import { Suspense } from "react";
import KeywordsView from "./KeywordsView";

export default async function KeywordsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <KeywordsView projectId={id} />
    </Suspense>
  );
}
