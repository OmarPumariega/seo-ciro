// Clasifica errores de la librería googleapis a un mensaje en español +
// código HTTP consistente. Todas las rutas que hablan con Google pasan por
// aquí para no reinventar el mensaje en cada endpoint.
export function classifyGoogleError(error: unknown): { status: number; message: string } {
  const err = error as { code?: number | string; message?: string; response?: { data?: { error?: { message?: string } } } };
  const code = typeof err.code === "string" ? parseInt(err.code, 10) : err.code;
  const googleMessage = err.response?.data?.error?.message ?? err.message ?? "";

  if (
    code === 401 ||
    /invalid_grant/i.test(googleMessage) ||
    /invalid_token/i.test(googleMessage)
  ) {
    return {
      status: 409,
      message: "La conexión con Google ha dejado de ser válida. Reconéctala desde Configuración.",
    };
  }

  if (code === 403) {
    return { status: 403, message: "No tienes acceso a esta propiedad de Google." };
  }

  if (code === 404) {
    return { status: 404, message: "No se ha encontrado esa propiedad en Google." };
  }

  return { status: 502, message: "No se pudo obtener datos de Google. Inténtalo de nuevo." };
}
