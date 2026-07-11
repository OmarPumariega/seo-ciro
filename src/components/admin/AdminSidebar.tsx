"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FolderKanban, LayoutDashboard, Settings, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectSwitcher, { pushRecent } from "@/components/admin/ProjectSwitcher";

const NAV_ITEMS = [
  { href: "/admin", label: "Panel general", icon: LayoutDashboard },
  { href: "/admin/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/admin/costes", label: "Costes", icon: Wallet },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

type ProjectInfo = { id: string; name: string; isLocalBusiness: boolean };

// Construye la lista de módulos de un proyecto (los mismos que antes eran
// pestañas). Geogrid solo si es negocio local. El orden sigue el nº de módulo.
function projectModules(base: string, isLocalBusiness: boolean) {
  const mods = [
    { href: base, label: "Perfil" },
    { href: `${base}/tareas`, label: "Tareas" },
    { href: `${base}/keywords`, label: "Keywords" },
    { href: `${base}/titulos-meta`, label: "Título y Meta" },
    { href: `${base}/schema`, label: "Schema" },
    { href: `${base}/rank`, label: "Rank Tracking" },
    { href: `${base}/google`, label: "Google" },
    { href: `${base}/contenido`, label: "Contenido" },
    { href: `${base}/tfidf`, label: "TF-IDF" },
    { href: `${base}/auditoria`, label: "Auditoría" },
    { href: `${base}/enlaces`, label: "Enlaces" },
    { href: `${base}/canibalizaciones`, label: "Canibalizaciones" },
  ];
  if (isLocalBusiness) mods.push({ href: `${base}/geogrid`, label: "Geogrid" });
  mods.push({ href: `${base}/informe`, label: "Informe" });
  mods.push({ href: `${base}/copilot`, label: "Copilot" });
  return mods;
}

// Extrae el projectId de la ruta /admin/proyectos/[id]/... si aplica.
function useProjectIdFromPath(): string | null {
  const pathname = usePathname();
  const m = pathname?.match(/^\/admin\/proyectos\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}

export default function AdminSidebar({
  navOpen,
  onClose,
}: {
  navOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const projectId = useProjectIdFromPath();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  // Carga la lista de proyectos (para el selector) cuando se está dentro de un
  // proyecto. El sidebar vive en el shell (nivel panel) y no recibe el proyecto
  // del layout del proyecto — lo deduce de la URL y pide la lista a la API.
  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      Promise.resolve().then(() => {
        if (!cancelled) setProjects([]);
      });
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/proyectos")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ProjectInfo[]) => {
        if (!cancelled && Array.isArray(list)) {
          setProjects(list.map((p) => ({ id: p.id, name: p.name, isLocalBusiness: !!p.isLocalBusiness })));
        }
      })
      .catch(() => {});
    // Registra el proyecto actual en "recientes" (localStorage) para el switcher.
    pushRecent(projectId);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const base = project ? `/admin/proyectos/${project.id}` : "";
  const modules = project ? projectModules(base, project.isLocalBusiness) : [];

  // Segmento de módulo actual (para mantenerlo al cambiar de proyecto).
  // P.ej. estando en .../KEYWORDS, al cambiar de proyecto se va al Keywords del nuevo.
  function switchProject(newId: string) {
    if (!newId || newId === projectId) return;
    const rest = projectId ? pathname.replace(`/admin/proyectos/${projectId}`, "") : "";
    const seg = rest.replace(/^\//, "").split("/")[0] ?? "";
    let target = `/admin/proyectos/${newId}`;
    if (seg && seg !== "geogrid") {
      target += `/${seg}`;
    } else if (seg === "geogrid") {
      // Geogrid solo existe en proyectos locales; si el destino no lo es, a Perfil.
      const np = projects.find((p) => p.id === newId);
      if (np?.isLocalBusiness) target += "/geogrid";
    }
    router.push(target);
    onClose();
  }

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
                  active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Selector de proyecto + módulos (solo dentro de un proyecto).
              El selector permite cambiar de proyecto sin ir a la lista (1 clic),
              y mantiene el módulo activo al cambiar. */}
          {projectId && (
            <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
              <label className="block px-3 text-xs font-medium text-gray-500">Proyecto</label>
              <ProjectSwitcher projects={projects} currentId={projectId} onSelect={switchProject} />
              {project && (
                <div className="space-y-0.5">
                  {modules.map((m) => {
                    const active = m.href === base ? pathname === m.href : pathname.startsWith(m.href);
                    return (
                      <Link
                        key={m.href}
                        href={m.href}
                        onClick={onClose}
                        className={cn(
                          "block pl-6 pr-3 py-1.5 rounded-lg text-sm transition-colors",
                          active
                            ? "bg-gray-100 text-gray-900 font-medium"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        {m.label}
                      </Link>
                    );
                  })}
                </div>
              )}
              <Link
                href="/admin/proyectos"
                onClick={onClose}
                className="block px-3 pt-1 text-xs text-gray-400 hover:text-gray-900"
              >
                Gestionar proyectos
              </Link>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
