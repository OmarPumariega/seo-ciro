import RankView from "./RankView";

export default async function RankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RankView projectId={id} />;
}
