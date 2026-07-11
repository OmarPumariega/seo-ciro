import EnlacesView from "./EnlacesView";

export default async function EnlacesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnlacesView projectId={id} />;
}
