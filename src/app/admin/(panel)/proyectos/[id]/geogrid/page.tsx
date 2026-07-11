import GeogridView from "./GeogridView";

export default async function GeogridPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GeogridView projectId={id} />;
}
