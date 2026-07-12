import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import GeogridView from "./GeogridView";

export default async function GeogridPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, lat: true, lng: true, businessName: true, gbpName: true, gbpPlaceId: true },
  });
  if (!project) notFound();

  return (
    <GeogridView
      projectId={project.id}
      centerLat={project.lat}
      centerLng={project.lng}
      businessName={project.businessName}
      gbpName={project.gbpName}
      gbpPlaceId={project.gbpPlaceId}
    />
  );
}
