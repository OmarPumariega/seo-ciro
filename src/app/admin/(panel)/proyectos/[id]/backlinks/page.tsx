import BacklinksView from "./BacklinksView";

export default async function BacklinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BacklinksView projectId={id} />;
}
