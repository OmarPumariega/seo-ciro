"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Panel general", icon: LayoutDashboard },
  { href: "/admin/proyectos", label: "Proyectos", icon: FolderKanban },
];

// Módulos del spec todavía no construidos — se listan como referencia visual
// de a dónde va a crecer el panel, deshabilitados hasta que se planifiquen.
const UPCOMING_MODULES = [
  "Keyword Research",
  "Título y Meta",
  "Schema",
  "Rank Tracking",
  "Integraciones Google",
  "Generador de Contenido",
  "Auditoría Técnica",
  "Geogrid Local SEO",
];

export default function AdminSidebar({
  navOpen,
  onClose,
}: {
  navOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {navOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100 flex flex-col transition-transform md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <h1 className="text-lg font-bold text-gray-900">SEO Ciro</h1>
            <p className="text-xs text-gray-500">Agencia Ciro</p>
          </div>
          <button className="md:hidden text-gray-400" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-gray-100">
            <p className="px-3 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Próximamente
            </p>
            {UPCOMING_MODULES.map((label) => (
              <div
                key={label}
                className="px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
              >
                {label}
              </div>
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}
