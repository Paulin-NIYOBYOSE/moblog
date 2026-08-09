"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import GalleryBrowser from "@/components/gallery/GalleryBrowser";

export default function TestingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TestingPageInner />
    </Suspense>
  );
}

function TestingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const folderId = searchParams.get("folder");

  function navigate(id: string | null) {
    router.push(id ? `/testing?folder=${id}` : "/testing", { scroll: false });
  }

  return (
    <div>
      <PageHeader title="Testing" subtitle="Screenshot library — organize by pair, year, or however you like" />
      <GalleryBrowser folderId={folderId} onNavigate={navigate} />
    </div>
  );
}
