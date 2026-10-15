import { checkLive } from "@/lib/limits";
import { dbHealthy } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Health for monitoring: database reachable, when data was last published, live brief state.
export async function GET() {
  const db = await dbHealthy();
  let live = "unknown";
  try {
    const g = await checkLive("health-check");
    live = g.ok ? "available" : g.reason;
  } catch {
    live = "error";
  }
  return Response.json({ ok: db.ok, database: db, live_brief: live, time: new Date().toISOString() }, { status: db.ok ? 200 : 503 });
}
