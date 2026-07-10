import TitulosMetaView from "./TitulosMetaView";

export default async function TitulosMetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TitulosMetaView projectId={id} />;
}
