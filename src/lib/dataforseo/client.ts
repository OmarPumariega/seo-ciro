// Cliente HTTP compartido de DataForSEO. Auth HTTP Basic con el
// login/password de la agencia (DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD).
//
// Todas las APIs de DataForSEO comparten el mismo patrón de envoltorio:
//   • body = ARRAY de tasks (código 40503 si mandas un objeto suelto)
//   • HTTP 200 incluso en fallos lógicos → hay que comprobar status_code a
//     DOS niveles (top-level y tasks[0]); 20000 = Ok en ambos
//   • cost real en tasks[0].cost
//
// Lo usan el Módulo 1 (keywords/dataforseo.ts) y el Módulo 5 (rank/serp.ts).

export class DataForSeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataForSeoError";
  }
}

const API_BASE = "https://api.dataforseo.com";

export function authHeader(): string {
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

// Envoltorio común de cada task de DataForSEO (ver comentario de fichero).
export type TaskEnvelope = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown;
};

// Códigos de tarea que NO son un error real, son un resultado vacío legítimo
// (p.ej. Maps SERP en una coordenada sin negocios de esa categoría cerca, algo
// completamente normal en los puntos periféricos de una rejilla de geogrid).
// Tratarlos como excepción hacía fallar rejillas enteras porque UN solo punto
// sin resultados abortaba los N² puntos ya comprobados y pagados.
//   40102 — "No Search Results"
const EMPTY_RESULT_TASK_CODES = new Set([40102]);

export function extractTask(json: unknown, endpoint: string): TaskEnvelope {
  const top = json as { status_code?: number; status_message?: string; tasks?: TaskEnvelope[] };
  if (top.status_code !== 20000) {
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${top.status_message ?? "error desconocido"} (código ${top.status_code ?? "?"})`
    );
  }
  const task = top.tasks?.[0];
  if (!task || (task.status_code !== 20000 && !EMPTY_RESULT_TASK_CODES.has(task.status_code ?? -1))) {
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${task?.status_message ?? top.status_message ?? "error de tarea"} (código ${task?.status_code ?? "?"})`
    );
  }
  return task;
}

// POST de una tarea a un endpoint Live de DataForSEO. Devuelve la task ya
// validada (status_code 20000 en ambos niveles). El coste real queda en
// `task.cost` para que el llamador lo registre en ApiUsageLog.
export async function postTask(
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
      // sola (código 40503 "An ARRAY of tasks is expected").
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
