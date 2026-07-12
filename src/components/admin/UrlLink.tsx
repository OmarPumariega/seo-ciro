"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Fallo común detectado en todo el panel: se mencionaba una URL como texto
// plano (a veces solo el path) sin poder ir a ella. Este componente es el
// único sitio donde se decide cómo se ve/enlaza una URL — se usa siempre que
// se muestra una, con la URL completa (nunca solo el path) y clicable.
export default function UrlLink({
  url,
  className,
  showIcon = true,
}: {
  url: string;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 min-w-0 text-indigo-600 hover:text-indigo-800 hover:underline",
        className
      )}
    >
      <span className="truncate">{url}</span>
      {showIcon && <ExternalLink className="h-3 w-3 shrink-0" />}
    </a>
  );
}
