import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ProjectEditView from "./ProjectEditView";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const hours = project.hours as { text?: string } | null;

  return (
    <ProjectEditView
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        domain: project.domain ?? "",
        isLocalBusiness: project.isLocalBusiness,
        businessName: project.businessName ?? "",
        address: project.address ?? "",
        phone: project.phone ?? "",
        hours: hours?.text ?? "",
        lat: project.lat !== null ? String(project.lat) : "",
        lng: project.lng !== null ? String(project.lng) : "",
        toneOfVoice: project.toneOfVoice ?? "",
        notes: project.notes ?? "",
      }}
    />
  );
}
