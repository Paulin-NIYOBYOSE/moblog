"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Error boundary for every Replay page: show what went wrong and a way out,
// instead of a blank screen. Saved data is unaffected — it lives in the database.
export default function ReplayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <AlertTriangle className="mx-auto h-9 w-9 text-warning" />
      <h1 className="mt-3 text-lg font-semibold">Something went wrong in Replay</h1>
      <p className="mt-1 text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      <p className="mt-1 text-xs text-faint">Your sessions, trades and journal are saved in the database and are not affected.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link href="/replay" className="btn btn-secondary">
          Back to sessions
        </Link>
      </div>
    </div>
  );
}
