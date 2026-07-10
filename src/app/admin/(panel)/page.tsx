import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { FolderKanban, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const projectCount = await prisma.project.count();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Panel general</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vista rápida de la actividad de la agencia. El resto de módulos (keyword
          research, rank tracking, auditorías...) se irán sumando aquí.
        </p>
      </div>

      <Link
        href="/admin/proyectos"
        className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-5 hover:bg-gray-50 transition-colors max-w-sm"
      >
        <div className="h-11 w-11 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
          <FolderKanban className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-2xl font-semibold text-gray-900">{projectCount}</div>
          <div className="text-sm text-gray-500">
            {projectCount === 1 ? "proyecto" : "proyectos"}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400" />
      </Link>
    </div>
  );
}
