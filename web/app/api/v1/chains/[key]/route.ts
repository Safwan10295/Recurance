import { NextRequest } from "next/server";
import { API_HEADERS, apiChain, rateLimited } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

// GET /api/v1/chains/<key>  One chain: reports, verified links with quotes, stated actions, follow-up evidence.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "too many requests, try again in a minute" }, { status: 429, headers: API_HEADERS });
  const { key } = await params;
  if (!/^[a-f0-9]{16}$/.test(key)) return Response.json({ error: "not found" }, { status: 404, headers: API_HEADERS });
  try {
    const out = await apiChain(key);
    if (!out) return Response.json({ error: "not found" }, { status: 404, headers: API_HEADERS });
    return Response.json(out, { headers: API_HEADERS });
  } catch {
    return Response.json({ error: "data unavailable" }, { status: 503, headers: API_HEADERS });
  }
}
