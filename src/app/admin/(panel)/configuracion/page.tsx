import { prisma } from "@/lib/db/prisma";
import GoogleConnectionCard from "@/components/admin/GoogleConnectionCard";

const ERROR_MESSAGES: Record<string, string> = {
  cancelado: "Has cancelado la conexión con Google.",
  estado_invalido: "La conexión ha caducado o no es válida. Inténtalo de nuevo.",
  sin_codigo: "Google no ha devuelto un código de autorización. Inténtalo de nuevo.",
  sin_refresh_token:
    "Google no ha devuelto un token permanente (ya habías dado acceso antes). Revoca el acceso en myaccount.google.com/permissions y vuelve a conectar.",
  sin_email: "No se ha podido obtener el email de la cuenta conectada.",
};

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const connection = await prisma.googleConnection.findUnique({
    where: { id: "singleton" },
    select: { googleEmail: true, scope: true, connectedAt: true },
  });

  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Error al conectar con Google." : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">
          Conexión con Google para Search Console y Analytics (Módulo 6).
        </p>
      </div>

      <GoogleConnectionCard
        connection={connection}
        justConnected={params.connected === "1"}
        errorMessage={errorMessage}
      />

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
        <p className="font-semibold text-gray-900">Antes de conectar</p>
        <p>
          Si la cuenta de Google de la agencia es de <strong>Google Workspace</strong>, marca la
          app como <strong>Interna</strong> en Google Cloud Console: sin verificación, sin
          caducidad de 7 días.
        </p>
        <p>
          Si es un <strong>Gmail personal</strong>, la app debe ser Externa. En modo
          &quot;Pruebas&quot; los tokens caducan cada 7 días (hay que reconectar). Para tokens
          permanentes hace falta pasar por la verificación de Google de scopes sensibles
          (justificación + vídeo de demostración, del orden de días).
        </p>
      </div>
    </div>
  );
}
