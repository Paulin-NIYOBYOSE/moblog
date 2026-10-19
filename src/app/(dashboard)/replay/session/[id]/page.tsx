"use client";

import { useParams } from "next/navigation";
import SessionDetail from "@/components/replay/SessionDetail";

export default function ReplaySessionDetailPage() {
  const params = useParams<{ id: string }>();
  return <SessionDetail key={params.id} sessionId={params.id} />;
}
