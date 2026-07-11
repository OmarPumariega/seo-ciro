import TfidfView from "./TfidfView";

export default async function TfidfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TfidfView projectId={id} />;
}
