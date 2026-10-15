import { NextRequest } from "next/server";
import { suggestReports } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const term = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  try {
    return Response.json(await suggestReports(term));
  } catch {
    return Response.json([]);
  }
}
