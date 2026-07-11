"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProjectSubNav({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const pathname = usePathname();
  const base = `/admin/proyectos/${projectId}`;

  const tabs = [
    { href: base, label: "Perfil" },
    { href: `${base}/keywords`, label: "Keywords" },
    { href: `${base}/titulos-meta`, label: "Título y Meta" },
    { href: `${base}/schema`, label: "Schema" },
    { href: `${base}/rank`, label: "Rank Tracking" },
    { href: `${base}/google`, label: "Google" },
    { href: `${base}/contenido`, label: "Contenido" },
    { href: `${base}/auditoria`, label: "Auditoría" },
  ];

  return (
    <div className="space-y-3">
      <Link
        href="/admin/proyectos"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Proyectos
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">{projectName}</h1>

      <nav className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
