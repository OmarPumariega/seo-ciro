import NotasView from "./NotasView";

export default async function NotasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotasView projectId={id} />;
}
