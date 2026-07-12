import { normalizeKeyword } from "@/lib/keywords/normalize";

// Parser de CSV/TSV sin dependencias (mismo principio que downloadCsv en
// src/lib/csv.ts: no hace falta una librería para un formato tan simple).
// Soporta tanto un CSV genérico (keyword,volumen,competencia,cpc,intención,
// separador coma o punto y coma) como la exportación real de Google Ads
// Keyword Planner ("Historial de estadísticas de palabras clave"):
//   - UTF-16 con BOM (Google Ads exporta así por defecto) además de UTF-8.
//   - Separado por tabulaciones, no comas.
//   - Dos líneas de cabecera de informe antes de la fila de columnas real
//     ("Keyword Stats ..." y el rango de fechas) — se buscan las columnas,
//     no se asume que la fila 0 ya es la cabecera.
//   - Filas de resumen ("Todo", "España"...) sin keyword — se descartan
//     igual que cualquier fila sin keyword.
//   - Sin columna CPC única: se calcula como la media de "Top of page bid
//     (low range)" y "(high range)" cuando existen.
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
const VOLUME_HEADERS = [
  "volumen",
  "volume",
  "search volume",
  "búsquedas",
  "busquedas",
  "vol",
  "searchvolume",
  "avg. monthly searches",
  "average monthly searches",
  "promedio de búsquedas mensuales",
  "búsquedas mensuales promedio",
];
const COMPETITION_HEADERS = ["competencia", "competition", "comp", "competición", "competicion"];
const CPC_HEADERS = ["cpc"];
const INTENT_HEADERS = ["intención", "intencion", "intent", "intención de búsqueda"];
// Google Ads no trae una columna CPC única: dos rangos de puja que se
// promedian (ver parseKeywordFile). Nombres de columna reales del export,
// en inglés y español (la interfaz de Google Ads puede exportar en ambos).
const BID_LOW_HEADERS = ["top of page bid (low range)", "puja parte superior de la página (rango bajo)"];
const BID_HIGH_HEADERS = ["top of page bid (high range)", "puja parte superior de la página (rango alto)"];

// Detecta BOM de UTF-16LE/BE o UTF-8 y decodifica en consecuencia. Google
// Ads exporta sus CSV en UTF-16LE con BOM por defecto; un archivo "normal"
// sin BOM se trata como UTF-8 (comportamiento previo, sin cambios).
export function decodeFileContent(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }
  // TextDecoder("utf-8") ya descarta el BOM de UTF-8 si lo hay.
  return new TextDecoder("utf-8").decode(buffer);
}

function detectDelimiter(line: string): string {
  const commas = (line.match(/,/g) ?? []).length;
  const semicolons = (line.match(/;/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs > semicolons) return "\t";
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

// Busca la fila de cabecera real entre las primeras líneas: la exportación
// de Google Ads antepone 2 líneas de metadatos (título del informe + rango
// de fechas) antes de la fila de columnas. Un CSV normal ya tiene la
// cabecera en la línea 0, así que esto no cambia nada para ese caso — se
// encuentra en el primer intento.
function findHeaderRow(lines: string[]): { index: number; delimiter: string } | null {
  const maxScan = Math.min(lines.length, 10); // metadatos de Google Ads son 2 líneas; margen de sobra
  for (let i = 0; i < maxScan; i++) {
    const delimiter = detectDelimiter(lines[i]);
    const cells = parseCsvLine(lines[i], delimiter);
    if (cells.length > 1 && findColumn(cells, KEYWORD_HEADERS) !== -1) {
      return { index: i, delimiter };
    }
  }
  return null;
}

export function parseKeywordFile(content: string): ImportedKeywordRow[] {
  // Google Ads separa miles en los números con el propio salto de línea del
  // informe intacto; solo se filtran líneas totalmente vacías.
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    throw new ImportFileError("El archivo está vacío.");
  }

  const header = findHeaderRow(lines);
  if (!header) {
    throw new ImportFileError(
      'No se encontró una columna de keyword. Usa una cabecera como "keyword" o "palabra clave".'
    );
  }
  const { index: headerIndex, delimiter } = header;
  const headers = parseCsvLine(lines[headerIndex], delimiter);

  const kwIdx = findColumn(headers, KEYWORD_HEADERS);
  const volIdx = findColumn(headers, VOLUME_HEADERS);
  const compIdx = findColumn(headers, COMPETITION_HEADERS);
  const cpcIdx = findColumn(headers, CPC_HEADERS);
  const intentIdx = findColumn(headers, INTENT_HEADERS);
  const bidLowIdx = findColumn(headers, BID_LOW_HEADERS);
  const bidHighIdx = findColumn(headers, BID_HIGH_HEADERS);

  const seen = new Set<string>();
  const rows: ImportedKeywordRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const keyword = normalizeKeyword(cells[kwIdx] ?? "");
    // Filas de resumen de Google Ads ("Todo", "España"...) no traen keyword
    // — se descartan igual que cualquier fila sin ella.
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);

    // CPC: columna única si existe (CSV genérico); si no, media de los dos
    // rangos de puja de Google Ads cuando estén presentes.
    let cpc = cpcIdx !== -1 ? parseNumber(cells[cpcIdx]) : null;
    if (cpc === null && (bidLowIdx !== -1 || bidHighIdx !== -1)) {
      const low = bidLowIdx !== -1 ? parseNumber(cells[bidLowIdx]) : null;
      const high = bidHighIdx !== -1 ? parseNumber(cells[bidHighIdx]) : null;
      if (low !== null && high !== null) cpc = Math.round(((low + high) / 2) * 100) / 100;
      else cpc = low ?? high;
    }

    rows.push({
      keyword,
      searchVolume: volIdx !== -1 ? parseNumber(cells[volIdx]) : null,
      competition: compIdx !== -1 ? normalizeCompetition(cells[compIdx]) : null,
      cpc,
      intent: intentIdx !== -1 ? normalizeIntent(cells[intentIdx]) : null,
    });
  }

  if (rows.length === 0) {
    throw new ImportFileError("No se encontró ninguna keyword válida en el archivo.");
  }

  return rows;
}
