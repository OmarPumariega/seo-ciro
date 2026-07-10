import { google } from "googleapis";

// Search Console + GA4 (lectura). Business Profile queda fuera hasta que
// Google apruebe el acceso a su API — no se pide su scope todavía.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI en las variables de entorno"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// `googleapis` bundles su propia copia de google-auth-library a través de
// googleapis-common, distinta de la copia de nivel superior que expone el
// tipo `Auth.OAuth2Client`. Tipar con ese alias en vez de anotar
// explícitamente evita el choque de tipos entre ambas copias.
export function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export type GoogleOAuthClient = ReturnType<typeof createOAuthClient>;

export function buildAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function getConnectedEmail(client: GoogleOAuthClient): Promise<string | null> {
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data.email ?? null;
}
