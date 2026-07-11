import AuditoriaView from "./AuditoriaView";

export default async function AuditoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuditoriaView projectId={id} />;
}
