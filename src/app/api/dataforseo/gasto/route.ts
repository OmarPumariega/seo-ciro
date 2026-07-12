import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getMonthSpendUsd, getMonthlyLimitUsd } from "@/lib/dataforseo/spend";

// Estado del gasto mensual de DataForSEO para mostrar un aviso/barrera en la
// UI. Sin tope configurado, limitUsd viene null (uso ilimitado).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const spentUsd = await getMonthSpendUsd();
  const limitUsd = await getMonthlyLimitUsd();

  return NextResponse.json({
    spentUsd,
    limitUsd,
    nearLimit: limitUsd !== null && spentUsd >= limitUsd * 0.8,
    blocked: limitUsd !== null && spentUsd >= limitUsd,
  });
}
