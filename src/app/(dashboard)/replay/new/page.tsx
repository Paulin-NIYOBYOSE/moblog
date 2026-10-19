"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SessionWizard from "@/components/replay/wizard/SessionWizard";

function WizardRoute() {
  const params = useSearchParams();
  return <SessionWizard initialSymbol={params.get("symbol")} initialDatasetId={params.get("dataset")} />;
}

export default function NewReplaySessionPage() {
  return (
    <Suspense fallback={null}>
      <WizardRoute />
    </Suspense>
  );
}
