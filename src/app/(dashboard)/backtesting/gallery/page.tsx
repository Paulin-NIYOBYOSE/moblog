"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { INSTRUMENTS, YEARS } from "@/lib/backtesting";
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

  const instrumentParam = searchParams.get("instrument");
  const yearParam = Number(searchParams.get("year"));
  const instrument = (INSTRUMENTS as readonly string[]).includes(instrumentParam ?? "")
    ? (instrumentParam as string)
    : INSTRUMENTS[0];
  const year = (YEARS as readonly number[]).includes(yearParam) ? yearParam : YEARS[0];

  function setSelection(nextInstrument: string, nextYear: number) {
    router.push(`/backtesting/gallery?instrument=${nextInstrument}&year=${nextYear}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Backtesting Gallery"
        subtitle="Screenshots from your backtesting sessions, organized by instrument and year"
      />
      <BacktestGalleryView instrument={instrument} year={year} onSelect={setSelection} />
    </div>
  );
}
