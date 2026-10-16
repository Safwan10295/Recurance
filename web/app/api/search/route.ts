import { NextRequest } from "next/server";
import { quickSearch } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Typeahead for the command palette.
export async function GET(req: NextRequest) {
  const term = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  try {
    return Response.json(await quickSearch(term), { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return Response.json({ chains: [], reports: [], orgs: [] }, { status: 503 });
  }
}
