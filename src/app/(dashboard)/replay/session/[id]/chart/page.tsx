"use client";

import { useParams } from "next/navigation";
import Workstation from "@/components/replay/workstation/Workstation";

export default function ReplayChartPage() {
  const params = useParams<{ id: string }>();
  return <Workstation key={params.id} sessionId={params.id} />;
}
