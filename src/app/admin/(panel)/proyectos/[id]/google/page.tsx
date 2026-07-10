import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import GoogleView from "./GoogleView";

export default async function ProjectGooglePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, gscSiteUrl: true, ga4PropertyId: true },
  });
  if (!project) notFound();

  return (
    <GoogleView
      projectId={project.id}
      initialGscSiteUrl={project.gscSiteUrl}
      initialGa4PropertyId={project.ga4PropertyId}
    />
  );
}
