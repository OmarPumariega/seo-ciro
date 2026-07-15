import { google } from "googleapis";
import { getSetting } from "@/lib/settings";

// Search Console + GA4 (lectura). Business Profile queda fuera hasta que
// Google apruebe el acceso a su API — no se pide su scope todavía.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

// Lanzada cuando faltan las credenciales OAuth (Client ID/Secret/Redirect URI),
// tanto si no están en la BD (Configuración) como en el .env. La captura la ruta
// de autorización para redirigir a Configuración con un mensaje claro en vez de
// un 500 mudo.
export class GoogleOAuthConfigError extends Error {
  constructor() {
    super(
      "Faltan las credenciales de Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI). Configúralas en Configuración → Google."
    );
    this.name = "GoogleOAuthConfigError";
  }
}

// Resuelve la configuración OAuth por la misma cascada que el resto de claves:
// fila en BD (guardada desde /admin/configuracion) → variable de entorno → null.
// Así se pueden cambiar sin tocar el .env ni reiniciar.
async function getOAuthConfig() {
  const clientId = await getSetting("GOOGLE_CLIENT_ID");
  const clientSecret = await getSetting("GOOGLE_CLIENT_SECRET");
  const redirectUri = await getSetting("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleOAuthConfigError();
  }
  return { clientId, clientSecret, redirectUri };
}

// `googleapis` bundles su propia copia de google-auth-library a través de
// googleapis-common, distinta de la copia de nivel superior que expone el
// tipo `Auth.OAuth2Client`. Tipar con ese alias en vez de anotar
// explícitamente evita el choque de tipos entre ambas copias.
export async function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = await getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export type GoogleOAuthClient = Awaited<ReturnType<typeof createOAuthClient>>;

export async function buildAuthUrl(state: string): Promise<string> {
  const client = await createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = await createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function getConnectedEmail(client: GoogleOAuthClient): Promise<string | null> {
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data.email ?? null;
}
