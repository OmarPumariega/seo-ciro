import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { parseKeywordFile, ImportFileError, decodeFileContent } from "@/lib/keywords/import-file";
import { computePriorities } from "@/lib/keywords/priority";

// Tope por estudio: mismo límite que el resto del Módulo 1 (route.ts de
// estudios/estudios/[id]/keywords) — un archivo real de agencia puede traer
// miles de filas, pero por encima de esto el prompt de estructura y la UI
// dejan de ser manejables.
const MAX_KEYWORDS = 300;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — de sobra para un CSV de keywords

// Crea un estudio directamente desde un CSV/documento subido por el usuario
// (keyword + volumen, opcionalmente competencia/CPC/intención). A diferencia
// del resto del Módulo 1, NO llama a DataForSEO: el usuario aporta su propia
// fuente ya investigada, así que los campos que no vengan en el archivo se
// quedan en null (nunca se completan inventando ni gastando sin pedirlo).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo enviado" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "El archivo supera los 2 MB" }, { status: 400 });
  }

  // ArrayBuffer, no .text(): Google Ads exporta en UTF-16 con BOM y
  // file.text() siempre decodifica como UTF-8, lo que rompería esos
  // caracteres — decodeFileContent detecta el BOM real y usa la
  // codificación correcta (ver src/lib/keywords/import-file.ts).
  const buffer = await file.arrayBuffer();
  const content = decodeFileContent(buffer);
  let rows;
  try {
    rows = parseKeywordFile(content);
  } catch (error) {
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo leer el archivo — ¿es un CSV válido?" }, { status: 400 });
  }

  if (rows.length > MAX_KEYWORDS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_KEYWORDS} keywords por estudio (el archivo trae ${rows.length})` },
      { status: 400 }
    );
  }

  const nameField = form.get("name");
  const name =
    typeof nameField === "string" && nameField.trim()
      ? nameField.trim().slice(0, 120)
      : `${file.name.replace(/\.[^.]+$/, "")}`.slice(0, 120) || `Importado el ${new Date().toLocaleDateString("es-ES")}`;

  const priorities = computePriorities(rows.map((r) => ({ keyword: r.keyword, searchVolume: r.searchVolume })));

  const study = await prisma.keywordStudy.create({
    data: {
      projectId: id,
      name,
      keywords: {
        create: rows.map((r) => ({
          keyword: r.keyword,
          searchVolume: r.searchVolume,
          competition: r.competition,
          cpc: r.cpc,
          intent: r.intent,
          priority: priorities.get(r.keyword) ?? 0,
        })),
      },
    },
    include: { keywords: true },
  });

  return NextResponse.json(study, { status: 201 });
}
