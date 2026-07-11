import robotsParser from "robots-parser";

export const CRAWLER_USER_AGENT = "SEOCiroBot/1.0 (auditoría interna Agencia Ciro)";

export type RobotsRules = {
  isAllowed: (url: string) => boolean;
};

// Si robots.txt no existe o falla la petición, el protocolo estándar es
// "todo permitido" — no bloqueamos el rastreo por un fetch fallido.
export async function loadRobotsRules(origin: string): Promise<RobotsRules> {
  const robotsUrl = `${origin}/robots.txt`;

  let body = "";
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) body = await res.text();
  } catch {
    // sin robots.txt accesible → todo permitido
  }

  const robots = robotsParser(robotsUrl, body);

  return {
    isAllowed: (url: string) => robots.isAllowed(url, CRAWLER_USER_AGENT) !== false,
  };
}
