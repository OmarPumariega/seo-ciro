import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

// Layout de las páginas de un proyecto. La navegación entre módulos va ahora
// en el sidebar principal (debajo de Configuración), no como pestañas aquí —
// así no se rompe por el número de módulos. Aquí solo validamos que el proyecto
// existe (404 si no) y renderizamos el contenido.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) notFound();

  return <div className="space-y-6">{children}</div>;
}
