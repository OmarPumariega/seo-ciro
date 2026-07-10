import ContentView from "./ContentView";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContentView projectId={id} />;
}
