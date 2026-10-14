import "server-only";
import fs from "node:fs";
import path from "node:path";

// Small key-value store used by the live brief for its cache, ledger and limits.
// Production: Supabase table rw_kv (see docs/DEPLOY.md). Development: a JSON file in web/.local/.
// On Vercel without Supabase there is no shared store, so the live brief stays paused (see limits.ts).

export interface Store {
  kind: "supabase" | "file" | "none";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  add(key: string, delta: number): Promise<number>;
}

class SupabaseStore implements Store {
  kind = "supabase" as const;
  constructor(private url: string, private key: string) {}
  private headers() {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" };
  }
  async get<T>(key: string): Promise<T | null> {
    const r = await fetch(`${this.url}/rest/v1/rw_kv?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`store get ${r.status}`);
    const rows = (await r.json()) as { value: T }[];
    return rows.length ? rows[0].value : null;
  }
  async set(key: string, value: unknown): Promise<void> {
    const r = await fetch(`${this.url}/rest/v1/rw_kv`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`store set ${r.status}`);
  }
  async add(key: string, delta: number): Promise<number> {
    // Atomic increment through a Postgres function (docs/DEPLOY.md, rw_kv_add).
    const r = await fetch(`${this.url}/rest/v1/rpc/rw_kv_add`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ k: key, delta }),
    });
    if (!r.ok) throw new Error(`store add ${r.status}`);
    return Number(await r.json());
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

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) cached = new SupabaseStore(url.replace(/\/$/, ""), key);
  else if (!process.env.VERCEL) cached = new FileStore();
  else cached = new NoStore();
  return cached;
}
