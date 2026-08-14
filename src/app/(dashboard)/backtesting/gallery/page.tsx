"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { INSTRUMENTS, isGalleryTarget } from "@/lib/backtesting";
import BacktestGalleryView from "@/components/backtesting/BacktestGalleryView";

export default function BacktestGalleryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BacktestGalleryPageInner />
    </Suspense>
  );
}

function BacktestGalleryPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const targetParam = searchParams.get("target") ?? "";
  const target = isGalleryTarget(targetParam) ? targetParam : INSTRUMENTS[0];

  function setTarget(next: string) {
    router.push(`/backtesting/gallery?target=${encodeURIComponent(next)}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Backtesting Gallery"
        subtitle="Analytics screenshots for each pair across all years, plus your combined all-pairs view"
      />
      <BacktestGalleryView target={target} onSelect={setTarget} />
    </div>
  );
}
