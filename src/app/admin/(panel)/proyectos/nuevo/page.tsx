"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProjectForm, { type ProjectFormValues } from "@/components/admin/ProjectForm";

export default function NewProjectPage() {
  const router = useRouter();

  async function handleSubmit(values: ProjectFormValues) {
    const res = await fetch("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Error al crear el proyecto";

    router.push(`/admin/proyectos/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/proyectos"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Proyectos
      </Link>
      <h1 className="text-xl font-semibold text-gray-900">Nuevo proyecto</h1>
      <ProjectForm submitLabel="Crear proyecto" onSubmit={handleSubmit} />
    </div>
  );
}
