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

import { getSetting } from "@/lib/settings";

export class DataForSeoError extends Error {
  readonly code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "DataForSeoError";
    this.code = code;
  }
}

const API_BASE = "https://api.dataforseo.com";

// Login/password: BD (Configuración) primero, variables de entorno como
// fallback — ver src/lib/settings.ts.
export async function authHeader(): Promise<string> {
  const [login, password] = await Promise.all([
    getSetting("DATAFORSEO_LOGIN"),
    getSetting("DATAFORSEO_PASSWORD"),
  ]);
  if (!login || !password) {
    throw new DataForSeoError(
      "Faltan las credenciales de DataForSEO (configúralas en Configuración o en DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)"
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
//   40102 — "No Search Results"
const EMPTY_RESULT_TASK_CODES = new Set([40102]);

// Códigos de tarea transient (errores temporales del motor de búsqueda, no de
// nuestra cuenta ni de la petición): Google respondió con un error interno o
// no pudo ejecutar la tarea. La doc de DataForSEO recomienda reenviar la
// tarea con los mismos parámetros. Reintentar con backoff exponencial evita
// que un fallo puntual de Google haga caer un barrido completo de rank
// tracking o un bootstrap entero de proyecto.
//   40101 — "Internal SE Server Error"
//   40103 — "Task execution failed, please try to resubmit the task"
const RETRYABLE_TASK_CODES = new Set([40101, 40103]);
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Traduce los códigos de estado a un mensaje claro en español para el usuario
// final. Los códigos de DataForSEO son crípticos ("código 40101") y confunden
// — un 40101 NO es un problema de credenciales ni de saldo, es Google que
// falló al procesar la búsqueda, algo que se soluciona reintentando.
function taskStatusMessage(code: number | undefined, fallback: string): string {
  switch (code) {
    case 40100:
      return "credenciales de DataForSEO no válidas (revisa DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD en Configuración)";
    case 40101:
      return "Google respondió con un error interno al procesar la búsqueda (transient, suele recuperarse al reintentar)";
    case 40102:
      return "sin resultados en la búsqueda";
    case 40103:
      return "Google no pudo ejecutar la tarea (transient, suele recuperarse al reintentar)";
    case 40104:
      return "tu cuenta de DataForSEO requiere verificación (email/teléfono). Entra en app.dataforseo.com para completarla";
    case 40200:
      return "pago requerido (saldo insuficiente). Recarga créditos en dataforseo.com";
    case 40201:
      return "actividad inusual detectada en tu cuenta de DataForSEO";
    case 40202:
      return "límite de peticiones por tiempo superado (rate limit). Inténtalo de nuevo en unos minutos";
    case 40203:
      return "límite de coste superado (revisa los topes en Configuración y en la ficha del proyecto)";
    case 40501:
      return "campo inválido en la petición a DataForSEO (revisa los parámetros enviados)";
    case 40503:
      return "DataForSEO esperaba un array de tareas en el cuerpo de la petición";
    default:
      return fallback;
  }
}

export function extractTask(json: unknown, endpoint: string): TaskEnvelope {
  const top = json as { status_code?: number; status_message?: string; tasks?: TaskEnvelope[] };
  if (top.status_code !== 20000) {
    const raw = top.status_message ?? "error desconocido";
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${taskStatusMessage(top.status_code, raw)} (código ${top.status_code ?? "?"})`,
      top.status_code ?? null
    );
  }
  const task = top.tasks?.[0];
  if (!task || (task.status_code !== 20000 && !EMPTY_RESULT_TASK_CODES.has(task.status_code ?? -1))) {
    const raw = task?.status_message ?? top.status_message ?? "error de tarea";
    throw new DataForSeoError(
      `DataForSEO ${endpoint}: ${taskStatusMessage(task?.status_code, raw)} (código ${task?.status_code ?? "?"})`,
      task?.status_code ?? null
    );
  }
  return task;
}

// Traduce los códigos HTTP más comunes de DataForSEO a un mensaje claro con la
// causa y la acción a seguir — el "error HTTP 402" críptico era incomprensible
// para el usuario (significa saldo agotado, no un fallo de la herramienta).
function httpErrorMessage(endpoint: string, status: number): string {
  switch (status) {
    case 401:
      return `DataForSEO ${endpoint}: credenciales no válidas (HTTP 401). Revisa DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD en Configuración.`;
    case 402:
      return `DataForSEO ${endpoint}: saldo insuficiente (HTTP 402). Recarga créditos en tu cuenta de DataForSEO (dataforseo.com → Balance) e inténtalo de nuevo.`;
    case 429:
      return `DataForSEO ${endpoint}: has superado el límite de peticiones (HTTP 429). Inténtalo de nuevo en unos minutos.`;
    default:
      return `DataForSEO ${endpoint}: error HTTP ${status}`;
  }
}

// POST de una tarea a un endpoint Live de DataForSEO. Devuelve la task ya
// validada (status_code 20000 en ambos niveles). El coste real queda en
// `task.cost` para que el llamador lo registre en ApiUsageLog.
//
// Reintenta automáticamente los códigos transient (40101 "Internal SE Server
// Error" y 40103 "Task execution failed") con backoff exponencial — Google
// responde así a veces de forma puntual y la propia doc de DataForSEO
// recomienda reenviar la tarea. Sin este retry, un único fallo transient
// aborta el item completo (keyword, competidor, punto de geogrid) aunque se
// recuperaría al minuto siguiente.
export async function postTask(
  path: string,
  body: Record<string, unknown>,
  endpoint: string
): Promise<TaskEnvelope> {
  // Fuera del try/catch de red: si faltan credenciales, DataForSeoError debe
  // salir con su mensaje real, no enmascarado como "no se pudo conectar".
  const auth = await authHeader();

  let lastError: DataForSeoError | null = null;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: auth,
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
      throw new DataForSeoError(httpErrorMessage(endpoint, res.status));
    }

    const json = await res.json();
    try {
      return extractTask(json, endpoint);
    } catch (error) {
      if (!(error instanceof DataForSeoError)) throw error;
      // Solo reintentamos si el código es transient del motor de búsqueda.
      if (error.code === null || !RETRYABLE_TASK_CODES.has(error.code)) throw error;
      lastError = error;
      // Backoff exponencial: 1s, 2s, 4s…
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  // Agotados los reintentos: lanzamos el último error transient recibido.
  throw lastError ?? new DataForSeoError(`DataForSEO ${endpoint}: error desconocido tras reintentos`);
}
