import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getPool } from "./db";

// Key-value store for the live brief: response cache, ledger, spend and daily limits.
// Production: the brief_kv table in PostgreSQL (pipeline/db/schema_publish.sql).
// Development without a database: a JSON file in web/.local/. In production with no database the
// store is "none" and the live brief stays paused (see limits.ts).

export interface Store {
  kind: "postgres" | "file" | "none";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  add(key: string, delta: number): Promise<number>;
}

class PostgresStore implements Store {
  kind = "postgres" as const;
  async get<T>(key: string) {
    const r = await getPool()!.query("SELECT value FROM brief_kv WHERE key = $1", [key]);
    return (r.rows[0]?.value ?? null) as T | null;
  }
  async set(key: string, value: unknown) {
    await getPool()!.query(
      "INSERT INTO brief_kv (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
      [key, JSON.stringify(value)],
    );
  }
  async add(key: string, delta: number) {
    const r = await getPool()!.query("SELECT brief_kv_add($1, $2) AS v", [key, delta]);
    return Number(r.rows[0].v);
  }
}

class FileStore implements Store {
  kind = "file" as const;
  private file: string;
  constructor() {
    const dir = path.join(process.cwd(), ".local");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "store.json");
  }
  private load(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      return {};
    }
  }
  private save(d: Record<string, unknown>) {
    fs.writeFileSync(this.file, JSON.stringify(d));
  }
  async get<T>(key: string) {
    return (this.load()[key] as T) ?? null;
  }
  async set(key: string, value: unknown) {
    const d = this.load();
    d[key] = value;
    this.save(d);
  }
  async add(key: string, delta: number) {
    const d = this.load();
    const v = Number(d[key] ?? 0) + delta;
    d[key] = v;
    this.save(d);
    return v;
  }
}

class NoStore implements Store {
  kind = "none" as const;
  async get<T>() {
    return null as T | null;
  }
  async set() {}
  async add() {
    return Number.POSITIVE_INFINITY;
  }
}

let current: Store | null = null;

export function getStore(): Store {
  if (current) return current;
  if (getPool()) current = new PostgresStore();
  else if (process.env.NODE_ENV !== "production") current = new FileStore();
  else current = new NoStore();
  return current;
}
