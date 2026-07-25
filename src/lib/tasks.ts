// Forma de una plantilla del catálogo (TodoTemplate) tal como la consumen
// TareasView (selector "Desde plantilla") y TodoTemplatesCard (CRUD) —
// antes duplicada como dos tipos locales idénticos en cada archivo.
export type TodoTemplateItem = {
  id: string;
  title: string;
  detail: string | null;
  priority: string;
  category: string | null;
};

// Divide el texto libre de una tarea manual (TodoItem con issueType null) en
// "título" (primera línea) + "detalle" (el resto). Compartido entre
// TareasView (tarjeta colapsable) e Informe (sección "Trabajos Realizados") —
// misma regla en los dos sitios, un solo lugar si cambia.
export function splitManualTask(text: string): { title: string; detail: string } {
  const idx = text.indexOf("\n");
  if (idx === -1) return { title: text, detail: "" };
  return { title: text.slice(0, idx).trim(), detail: text.slice(idx + 1).trim() };
}
