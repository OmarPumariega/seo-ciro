"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

// Caracteres inválidos como nombre de archivo en Windows/Mac — el resto
// (espacios, tildes, mayúsculas) se conserva para que el nombre siga siendo
// legible.
function sanitizeForFilename(input: string): string {
  return input.replace(/[/\\:*?"<>|]/g, "").trim();
}

function todayDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

export default function PrintButton({ className, projectName }: { className?: string; projectName: string }) {
  function handlePrint() {
    // El nombre de archivo que sugiere "Guardar como PDF" en el diálogo de
    // impresión del navegador se deriva del document.title en el momento de
    // imprimir (Chrome/Edge/Safari) — es una sugerencia, no algo que la app
    // pueda forzar al 100% (el usuario puede cambiarlo en el diálogo), mismo
    // límite que ya asume el resto del módulo (impresión nativa del
    // navegador, sin PDF generado en servidor).
    const originalTitle = document.title;
    document.title = `Informe SEO - ${sanitizeForFilename(projectName)} - ${todayDDMMYYYY()}`;

    function restoreTitle() {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    }
    window.addEventListener("afterprint", restoreTitle);
    // Red de seguridad: no todos los navegadores disparan `afterprint` de
    // forma fiable (p.ej. al cancelar el diálogo en algunos casos).
    setTimeout(restoreTitle, 5000);

    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "print:hidden inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap",
        className
      )}
    >
      <Printer className="h-4 w-4 shrink-0" />
      Imprimir / Guardar PDF
    </button>
  );
}
