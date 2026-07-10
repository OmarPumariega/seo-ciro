import SchemaView from "./SchemaView";

export default async function SchemaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SchemaView projectId={id} />;
}
