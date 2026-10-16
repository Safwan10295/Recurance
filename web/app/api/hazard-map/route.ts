import { DbUnavailable } from "@/lib/db";
import { getHazardMapJson } from "@/lib/queries-map";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await getHazardMapJson();
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const missing = (e as { code?: string }).code === "42P01"; // table not published yet
    const msg = e instanceof DbUnavailable ? "The database is not reachable." : missing ? "The map has not been published yet." : "The map could not be loaded.";
    return Response.json({ error: msg }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
