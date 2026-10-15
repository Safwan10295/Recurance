import "server-only";
import { Pool, types } from "pg";

// Dates stay as 'YYYY-MM-DD' strings; float4/float8 come back as numbers.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(700, (v: string) => parseFloat(v));
types.setTypeParser(701, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10));

export class DbUnavailable extends Error {}

const g = globalThis as unknown as { __rwPool?: Pool };

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!g.__rwPool) {
    g.__rwPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    g.__rwPool.on("error", () => undefined);
  }
  return g.__rwPool;
}

export async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  if (!pool) throw new DbUnavailable("DATABASE_URL is not set");
  try {
    const r = await pool.query(sql, params);
    return r.rows as T[];
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "57P03") throw new DbUnavailable(String(e));
    throw e;
  }
}

export async function q1<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

// Small in-process cache: published data changes only when the pipeline publishes.
const cache = new Map<string, { t: number; v: unknown }>();
const TTL = Number(process.env.DATA_CACHE_SECONDS ?? 120) * 1000;

export async function cached<T>(key: string, fn: () => Promise<T>, ttl = TTL): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return v;
}
