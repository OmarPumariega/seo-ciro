"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Braces,
  ChevronDown,
  Copy,
  FileBarChart2,
  FileText,
  FolderKanban,
  FolderTree,
  Key,
  LayoutDashboard,
  LineChart,
  Link2,
  ListChecks,
  Map,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  Sigma,
  TrendingUp,
  Type,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectSwitcher, { pushRecent } from "@/components/admin/ProjectSwitcher";
import Logo from "@/components/admin/Logo";

const NAV_ITEMS = [
  { href: "/admin", label: "Panel general", icon: LayoutDashboard },
  { href: "/admin/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/admin/costes", label: "Costes", icon: Wallet },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

type ProjectInfo = { id: string; name: string; isLocalBusiness: boolean };

type NavModule = { href: string; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; icon: LucideIcon; modules: NavModule[] };
type ProjectNav = { top: NavModule[]; groups: NavGroup[]; bottom: NavModule[] };

// Navegación de un proyecto agrupada por tipo de herramienta. Los módulos
// transversales (Perfil, Tareas, Informe, Copilot) van sueltos; el resto se
// agrupa en carpetas plegables: Investigación · On-Page · Técnico · Seguimiento.
// Geogrid solo aparece en proyectos locales (negocio con coordenadas) y cuelga
// del grupo Seguimiento.
function projectNav(base: string, isLocalBusiness: boolean): ProjectNav {
  const groups: NavGroup[] = [
    {
      id: "investigacion",
      label: "Investigación",
      icon: Search,
      modules: [
        { href: `${base}/keywords`, label: "Keywords", icon: Key },
        { href: `${base}/arquitectura`, label: "Arquitectura", icon: FolderTree },
      ],
    },
    {
      id: "onpage",
      label: "On-Page",
      icon: FileText,
      modules: [
        { href: `${base}/titulos-meta`, label: "Título y Meta", icon: Type },
        { href: `${base}/schema`, label: "Schema", icon: Braces },
        { href: `${base}/contenido`, label: "Contenido", icon: PenLine },
        { href: `${base}/tfidf`, label: "TF-IDF", icon: Sigma },
      ],
    },
    {
      id: "tecnico",
      label: "Técnico",
      icon: Wrench,
      modules: [
        { href: `${base}/auditoria`, label: "Auditoría", icon: ShieldCheck },
        { href: `${base}/enlaces`, label: "Enlaces", icon: Link2 },
        { href: `${base}/canibalizaciones`, label: "Canibalizaciones", icon: Copy },
      ],
    },
    {
      id: "seguimiento",
      label: "Seguimiento",
      icon: LineChart,
      modules: [
        { href: `${base}/rank`, label: "Rank Tracking", icon: TrendingUp },
        { href: `${base}/google`, label: "Google", icon: Globe },
        { href: `${base}/competidores`, label: "Competidores", icon: Users },
      ],
    },
  ];
  if (isLocalBusiness) {
    groups
      .find((g) => g.id === "seguimiento")!
      .modules.push({ href: `${base}/geogrid`, label: "Geogrid", icon: Map });
  }
  return {
    top: [
      { href: base, label: "Perfil", icon: User },
      { href: `${base}/tareas`, label: "Tareas", icon: ListChecks },
    ],
    groups,
    bottom: [
      { href: `${base}/informe`, label: "Informe", icon: FileBarChart2 },
      { href: `${base}/copilot`, label: "Copilot", icon: Bot },
    ],
  };
}

// ¿Es esta la ruta activa? Para Perfil (== base) exige coincidencia exacta;
// para el resto acepta rutas anidadas (p.ej. .../keywords/estudios/123).
function isModuleActive(href: string, base: string, pathname: string): boolean {
  if (href === base) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
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
  const nav = project ? projectNav(base, project.isLocalBusiness) : null;

  // Grupo plegable abierto. Por defecto (y al navegar a otro módulo) se abre el
  // grupo que contiene el módulo activo; el usuario puede abrir otro a mano.
  const activeGroupId = nav
    ? nav.groups.find((g) => g.modules.some((m) => isModuleActive(m.href, base, pathname)))?.id ?? null
    : null;
  // override = undefined → sigue al módulo activo (su grupo abierto por defecto);
  // string/null cuando el usuario abre/cierra a mano. Se resetea al navegar a un
  // módulo de otro grupo (patrón "reset state on prop change", sin effect).
  const [lastActive, setLastActive] = useState<string | null | undefined>(activeGroupId);
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  if (activeGroupId !== lastActive) {
    setLastActive(activeGroupId);
    setOverride(undefined);
  }
  const openGroup = override !== undefined ? override : activeGroupId;

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
            <Logo />
            <p className="text-xs text-gray-500 mt-1">Agencia Ciro</p>
          </div>
          <button className="md:hidden text-gray-400" onClick={onClose} aria-label="Cerrar menú">
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
              {nav && (
                <div className="space-y-0.5">
                  {nav.top.map((m) => (
                    <ModuleLink key={m.href} module={m} base={base} pathname={pathname} onClick={onClose} />
                  ))}

                  {nav.groups.map((g) => {
                    const isOpen = openGroup === g.id;
                    const groupHasActive = g.id === activeGroupId;
                    const GIcon = g.icon;
                    return (
                      <div key={g.id}>
                        <button
                          type="button"
                          onClick={() => setOverride(openGroup === g.id ? null : g.id)}
                          aria-expanded={isOpen}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors",
                            groupHasActive ? "text-gray-700" : "text-gray-400 hover:text-gray-700"
                          )}
                        >
                          <GIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 text-left">{g.label}</span>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-transform",
                              isOpen ? "" : "-rotate-90"
                            )}
                          />
                        </button>
                        {isOpen && (
                          <div className="mt-0.5 mb-1 space-y-0.5">
                            {g.modules.map((m) => (
                              <ModuleLink
                                key={m.href}
                                module={m}
                                base={base}
                                pathname={pathname}
                                onClick={onClose}
                                indented
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {nav.bottom.map((m) => (
                    <ModuleLink key={m.href} module={m} base={base} pathname={pathname} onClick={onClose} />
                  ))}
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

function ModuleLink({
  module: m,
  base,
  pathname,
  onClick,
  indented,
}: {
  module: NavModule;
  base: string;
  pathname: string;
  onClick: () => void;
  indented?: boolean;
}) {
  const active = isModuleActive(m.href, base, pathname);
  const Icon = m.icon;
  // Los módulos sueltos (no indentados) comparten la tipología de las cabeceras
  // de grupo: mayúsculas, text-xs, font-semibold. Los indentados (hijos de un
  // grupo) van en minúsculas normales a text-sm.
  const sizeText = indented
    ? "pl-9 text-sm"
    : "pl-3 text-xs font-semibold uppercase tracking-wide";
  const iconSize = indented ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <Link
      href={m.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-1.5 pr-3 rounded-lg transition-colors",
        sizeText,
        active
          ? "bg-gray-100 text-gray-900"
          : indented
            ? "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            : "text-gray-400 hover:text-gray-900"
      )}
    >
      <Icon className={cn(iconSize, "shrink-0")} />
      <span className="truncate">{m.label}</span>
    </Link>
  );
}
