import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/crypto";
import { createOAuthClient, type GoogleOAuthClient } from "@/lib/google/oauth";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("No hay ninguna cuenta de Google conectada");
    this.name = "GoogleNotConnectedError";
  }
}

// Sin caché en memoria: a diferencia de getOpenRouterClient(), esto debe
// reflejar siempre el estado actual en BD. Si se desconecta o reconecta,
// la siguiente llamada tiene que verlo al instante, no servir un cliente
// construido con un refresh token que ya no es el vigente.
export async function getGoogleClient(): Promise<GoogleOAuthClient> {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: "singleton" },
  });
  if (!connection) throw new GoogleNotConnectedError();

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decrypt(connection.encryptedRefreshToken) });
  return client;
}
