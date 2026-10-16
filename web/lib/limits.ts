import "server-only";
import { RESERVE_CEILING, liveSpent } from "./llm";
import { getStore } from "./store";
import { sha256 } from "./text";

export const GLOBAL_DAILY_CAP = Number(process.env.LIVE_GLOBAL_DAILY_CAP ?? "40");
export const PER_IP_DAILY_CAP = Number(process.env.LIVE_PER_IP_DAILY_CAP ?? "5");

// why: a plain explanation for the server log (never a key or other secret).
export type Gate = { ok: true } | { ok: false; reason: "paused" | "daily_cap" | "ip_cap" | "budget"; why: string };

function day() {
  return new Date().toISOString().slice(0, 10);
}

export async function checkLive(ip: string): Promise<Gate> {
  const store = getStore();
  if (store.kind === "none") return { ok: false, reason: "paused", why: "no shared store (DATABASE_URL not set)" };
  if (!process.env.NEBIUS_LIVE_API_KEY) return { ok: false, reason: "paused", why: "NEBIUS_LIVE_API_KEY is not set" };
  if (process.env.LIVE_BRIEF_PAUSED === "1") return { ok: false, reason: "paused", why: "LIVE_BRIEF_PAUSED=1" };
  try {
    if ((await liveSpent()) >= RESERVE_CEILING) return { ok: false, reason: "budget", why: `live spend reached the $${RESERVE_CEILING} ceiling` };
    const g = Number((await store.get<number>(`count:${day()}`)) ?? 0);
    if (g >= GLOBAL_DAILY_CAP) return { ok: false, reason: "daily_cap", why: `${GLOBAL_DAILY_CAP} live checks already today` };
    const ipKey = `ip:${day()}:${(await sha256("rw-salt:" + ip)).slice(0, 16)}`;
    const n = Number((await store.get<number>(ipKey)) ?? 0);
    if (n >= PER_IP_DAILY_CAP) return { ok: false, reason: "ip_cap", why: `this visitor used ${PER_IP_DAILY_CAP} live checks today` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "paused", why: "the limits store could not be read" };
  }
}

export async function countLive(ip: string) {
  const store = getStore();
  await store.add(`count:${day()}`, 1);
  await store.add(`ip:${day()}:${(await sha256("rw-salt:" + ip)).slice(0, 16)}`, 1);
}
