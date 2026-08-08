// Límites del módulo Notas (título/contenido enriquecido/fotos adjuntas).
// Compartidos entre el cliente (feedback inmediato) y las rutas de API
// (fuente de verdad — el cliente nunca es de fiar). Las fotos se guardan
// como bytes en Postgres (ver ProjectNoteImage en schema.prisma), así que
// estos topes también acotan cuánto puede crecer la tabla.

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 20000;

export const NOTE_IMAGE_MAX_COUNT = 8;
export const NOTE_IMAGE_MAX_SIZE = 6 * 1024 * 1024; // 6 MB por foto
export const NOTE_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
