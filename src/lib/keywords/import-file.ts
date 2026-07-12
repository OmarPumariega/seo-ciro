import { normalizeKeyword } from "@/lib/keywords/normalize";

// Parser de CSV sin dependencias (mismo principio que downloadCsv en
// src/lib/csv.ts: no hace falta una librería para un formato tan simple).
// Soporta exports típicos de Excel/Sheets: cabeceras en español o inglés,
// separador coma o punto y coma (Excel en español exporta con ";"), y
// volumen/CPC con separador de miles "." o coma decimal.
//
// Los datos del archivo se usan TAL CUAL — no se completan con DataForSEO.
// El usuario aporta su propia fuente (ya investigada), así que no se
// fabrica ni se corrige nada que no venga en el archivo.

export type ImportedKeywordRow = {
  keyword: string;
  searchVolume: number | null;
  competition: string | null; // "HIGH" | "MEDIUM" | "LOW" | null
  cpc: number | null;
  intent: string | null; // "informacional" | "mixta" | "transaccional" | null
};

const KEYWORD_HEADERS = ["keyword", "keywords", "palabra clave", "palabras clave", "término", "termino", "term"];
const VOLUME_HEADERS = ["volumen", "volume", "search volume", "búsquedas", "busquedas", "vol", "searchvolume"];
const COMPETITION_HEADERS = ["competencia", "competition", "comp", "competición", "competicion"];
const CPC_HEADERS = ["cpc"];
const INTENT_HEADERS = ["intención", "intencion", "intent", "intención de búsqueda"];

function detectDelimiter(line: string): string {
  const commas = (line.match(/,/g) ?? []).length;
  const semicolons = (line.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

// Parser mínimo tipo RFC4180 (comillas dobles, "" como comilla escapada).
function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  // "1.234" (miles) o "1234,5" (decimal español) → normaliza a formato JS.
  const cleaned = raw.replace(/[€$\s]/g, "");
  if (!cleaned) return null;
  const normalized =
    cleaned.includes(",") && !cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeCompetition(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (["high", "alta", "alto"].includes(v)) return "HIGH";
  if (["medium", "media", "medio"].includes(v)) return "MEDIUM";
  if (["low", "baja", "bajo"].includes(v)) return "LOW";
  return null; // valor no reconocido → null, nunca se inventa una categoría
}

function normalizeIntent(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (["informacional", "informativa", "informational", "info"].includes(v)) return "informacional";
  if (["transaccional", "transactional", "trans"].includes(v)) return "transaccional";
  if (["mixta", "mixed", "navigational", "commercial", "comercial"].includes(v)) return "mixta";
  return null;
}

export class ImportFileError extends Error {}

export function parseKeywordFile(content: string): ImportedKeywordRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    throw new ImportFileError("El archivo está vacío.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const kwIdx = findColumn(headers, KEYWORD_HEADERS);
  if (kwIdx === -1) {
    throw new ImportFileError(
      'No se encontró una columna de keyword. Usa una cabecera como "keyword" o "palabra clave".'
    );
  }
  const volIdx = findColumn(headers, VOLUME_HEADERS);
  const compIdx = findColumn(headers, COMPETITION_HEADERS);
  const cpcIdx = findColumn(headers, CPC_HEADERS);
  const intentIdx = findColumn(headers, INTENT_HEADERS);

  const seen = new Set<string>();
  const rows: ImportedKeywordRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const keyword = normalizeKeyword(cells[kwIdx] ?? "");
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    rows.push({
      keyword,
      searchVolume: volIdx !== -1 ? parseNumber(cells[volIdx]) : null,
      competition: compIdx !== -1 ? normalizeCompetition(cells[compIdx]) : null,
      cpc: cpcIdx !== -1 ? parseNumber(cells[cpcIdx]) : null,
      intent: intentIdx !== -1 ? normalizeIntent(cells[intentIdx]) : null,
    });
  }

  if (rows.length === 0) {
    throw new ImportFileError("No se encontró ninguna keyword válida en el archivo.");
  }

  return rows;
}
