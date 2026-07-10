"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ArrowRight, FolderKanban, MapPin } from "lucide-react";

type Project = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  isLocalBusiness: boolean;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proyectos")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cada cliente/dominio gestionado por la agencia es un proyecto.
          </p>
        </div>
        <Link
          href="/admin/proyectos/nuevo"
          className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo proyecto
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay proyectos. Crea el primero.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/admin/proyectos/${p.id}`}
              className="group flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="h-11 w-11 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
                <FolderKanban className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{p.name}</div>
                <div className="text-xs text-gray-400 truncate">
                  {p.domain ?? p.slug}
                </div>
              </div>
              {p.isLocalBusiness && (
                <span
                  title="Negocio local"
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0"
                >
                  <MapPin className="h-3 w-3" />
                  Local
                </span>
              )}
              <ArrowRight className="h-4 w-4 text-gray-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
