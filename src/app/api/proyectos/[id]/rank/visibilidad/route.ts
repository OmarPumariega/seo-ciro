import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { computeVisibilitySeries } from "@/lib/rank/visibility";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const group = req.nextUrl.searchParams.get("group") ?? undefined;
  const series = await computeVisibilitySeries(id, group || undefined);
  return NextResponse.json(series);
}
