import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import CanibalizacionesView from "./CanibalizacionesView";

export default async function ProjectCanibalizacionesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) notFound();

  return <CanibalizacionesView projectId={project.id} />;
}
