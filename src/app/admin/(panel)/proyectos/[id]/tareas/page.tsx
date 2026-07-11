import TareasView from "./TareasView";

export default async function TareasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TareasView projectId={id} />;
}
