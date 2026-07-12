// Divide el texto libre de una tarea manual (TodoItem con issueType null) en
// "título" (primera línea) + "detalle" (el resto). Compartido entre
// TareasView (tarjeta colapsable) e Informe (sección "Trabajos Realizados") —
// misma regla en los dos sitios, un solo lugar si cambia.
export function splitManualTask(text: string): { title: string; detail: string } {
  const idx = text.indexOf("\n");
  if (idx === -1) return { title: text, detail: "" };
  return { title: text.slice(0, idx).trim(), detail: text.slice(idx + 1).trim() };
}
