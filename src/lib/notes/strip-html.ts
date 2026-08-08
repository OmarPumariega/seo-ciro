// Solo para comprobar server-side si un HTML generado por el editor
// enriquecido está "vacío" en la práctica (p.ej. "<p></p>"). No es un
// sanitizador — el HTML que llega aquí siempre viene del editor Tiptap del
// propio front-end (schema cerrado, sin <script>/<iframe>/on*), nunca de
// input arbitrario de terceros.
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
