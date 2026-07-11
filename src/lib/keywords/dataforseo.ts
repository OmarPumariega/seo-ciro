// Cliente de DataForSEO (Módulo 1 — Keyword Research). Auth HTTP Basic con
// el login/password de la cuenta de la agencia. Se usan dos endpoints:
//
//   • Volumen/competición/CPC → keywords_data/google_ads/search_volume/live
//     (Keywords Data API; la mejor fuente para mirar un lote de keywords ya
//      conocidas, hasta 1000 por llamada plana).
//   • Intención de búsqueda  → dataforseo_labs/google/search_intent/live
//     (DataForSEO Labs; no acepta ubicación, solo idioma obligatorio).
//
// Principio del proyecto: nada se inventa. Toda métrica proviene de la
// respuesta real de DataForSEO; si la llamada falla se lanza DataForSeoError
// con el status_message real de la API, nunca un dato fabricado.

const API_BASE = "https://api.dataforseo.com";

export class DataForSeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataForSeoError";
  }
}

export type Competition = "HIGH" | "MEDIUM" | "LOW";

export type KeywordVolume = {
  searchVolume: number | null;
  competition: Competition | null;
  cpc: number | null;
};

// "informacional" | "mixta" | "transaccional" — el vocabulario de 3 buckets
// del proyecto (ver UI). Navigational y commercial (los dos labels intermedios
// de DataForSEO) se agrupan como "mixta".
export type IntentValue = "informacional" | "mixta" | "transaccional";

export type VolumeResult = {
  byKeyword: Map<string, KeywordVolume>;
  costUsd: number | null;
};

export type IntentResult = {
  byKeyword: Map<string, IntentValue | null>;
  costUsd: number | null;
};

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new DataForSeoError(
      "Faltan las credenciales de DataForSEO (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)"
    );
  }
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${token}`;
}

// Envoltorio común de cada task de DataForSEO. La API devuelve HTTP 200 aun
// en fallos lógicos, así que hay dos status_code que comprobar: el del
// top-level (response.status_code) y el de la task concreta
// (response.tasks[0].status_code). 20000 = Ok en ambos.
type TaskEnvelope = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown;
};

function extractTask(json: unknown, endpoint: string): TaskEnvelope {
  const top = json as { status_code?: number; status_message?: string; tasks?: TaskEnvelope[] };
  if (top.status_code !== 20000) {
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${top.status_message ?? "error desconocido"} (código ${top.status_code ?? "?"})`
    );
  }
  const task = top.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${task?.status_message ?? top.status_message ?? "error de tarea"} (código ${task?.status_code ?? "?"})`
    );
  }
  return task;
}

async function postTask(
  path: string,
  body: Record<string, unknown>,
  endpoint: string
): Promise<TaskEnvelope> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      // DataForSEO exige un ARRAY de tasks en el cuerpo, incluso para una
      // sola (código 40503 "An ARRAY of tasks is expected"). Mandamos siempre
      // una tarea por llamada.
      body: JSON.stringify([body]),
    });
  } catch {
    throw new DataForSeoError(`DataForSEO ${endpoint}: no se pudo conectar con la API`);
  }

  if (!res.ok) {
    throw new DataForSeoError(`DataForSEO ${endpoint}: error HTTP ${res.status}`);
  }

  const json = await res.json();
  return extractTask(json, endpoint);
}

function isCompetition(v: unknown): v is Competition {
  return v === "HIGH" || v === "MEDIUM" || v === "LOW";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Volumen de búsqueda + competición + CPC. `result` es un ARRAY con un
// elemento por keyword pedida (las que no tienen dato llegan con sus campos
// a null, no se omiten). Coste leído del campo real `tasks[0].cost`.
export async function fetchSearchVolume(
  keywords: string[],
  locationCode: number,
  languageCode: string
): Promise<VolumeResult> {
  const task = await postTask(
    "/v3/keywords_data/google_ads/search_volume/live",
    { keywords, location_code: locationCode, language_code: languageCode },
    "volumen"
  );

  const result = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const byKeyword = new Map<string, KeywordVolume>();

  for (const item of result) {
    const kw = typeof item.keyword === "string" ? item.keyword : null;
    if (!kw) continue;
    byKeyword.set(kw, {
      searchVolume: typeof item.search_volume === "number" ? item.search_volume : null,
      competition: isCompetition(item.competition) ? item.competition : null,
      cpc: typeof item.cpc === "number" ? round2(item.cpc) : null,
    });
  }

  return { byKeyword, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Intención de búsqueda. Aquí la estructura es más profunda:
// `tasks[0].result[0].items[i]`, y cada item trae `keyword_intent.label`
// (informational | navigational | commercial | transactional). El endpoint
// no admite ubicación, solo idioma (obligatorio).
export async function fetchSearchIntent(
  keywords: string[],
  languageCode: string
): Promise<IntentResult> {
  const task = await postTask(
    "/v3/dataforseo_labs/google/search_intent/live",
    { keywords, language_code: languageCode },
    "intención"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const items = Array.isArray(resultObj.items) ? (resultObj.items as Array<Record<string, unknown>>) : [];
  const byKeyword = new Map<string, IntentValue | null>();

  for (const item of items) {
    const kw = typeof item.keyword === "string" ? item.keyword : null;
    if (!kw) continue;
    const intentObj = item.keyword_intent as { label?: string } | undefined;
    byKeyword.set(kw, mapIntent(intentObj?.label));
  }

  return { byKeyword, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Mapea los 4 labels de DataForSEO al vocabulario de 3 buckets del proyecto.
// Navigational y commercial son ambos "intermedios" → se agrupan como mixta.
export function mapIntent(label: string | undefined): IntentValue | null {
  switch (label) {
    case "informational":
      return "informacional";
    case "transactional":
      return "transaccional";
    case "navigational":
    case "commercial":
      return "mixta";
    default:
      return null;
  }
}
