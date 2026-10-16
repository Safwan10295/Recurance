import { NextRequest } from "next/server";
import { API_HEADERS, apiChains, rateLimited } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

// GET /api/v1/chains?org=&q=&limit=&offset=  Recurrence chains, newest last report first.
export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "too many requests, try again in a minute" }, { status: 429, headers: API_HEADERS });
  const sp = req.nextUrl.searchParams;
  try {
    const out = await apiChains({
      org: sp.get("org")?.slice(0, 120) || undefined,
      q: sp.get("q")?.slice(0, 200) || undefined,
      limit: Number(sp.get("limit")) || undefined,
      offset: Number(sp.get("offset")) || undefined,
    });
    return Response.json(out, { headers: API_HEADERS });
  } catch {
    return Response.json({ error: "data unavailable" }, { status: 503, headers: API_HEADERS });
  }
}
