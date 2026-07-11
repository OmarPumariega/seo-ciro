import CompetidoresView from "./CompetidoresView";

export default async function CompetidoresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompetidoresView projectId={id} />;
}
