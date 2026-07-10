import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ProjectSubNav from "@/components/admin/ProjectSubNav";

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
    select: { id: true, name: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <ProjectSubNav projectId={project.id} projectName={project.name} />
      {children}
    </div>
  );
}
