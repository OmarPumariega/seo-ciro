"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
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
