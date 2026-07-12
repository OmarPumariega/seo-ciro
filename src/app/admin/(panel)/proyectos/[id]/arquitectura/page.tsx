import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ArquitecturaView from "./ArquitecturaView";

export default async function ArquitecturaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, domain: true },
  });
  if (!project) notFound();

  return <ArquitecturaView projectId={project.id} domain={project.domain} />;
}
