"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LineChart, Loader2 } from "lucide-react";
import { login } from "@/lib/useData";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const from = useSearchParams().get("from") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <LineChart className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold tracking-tight">Moblog</span>
        </div>
        <h1 className="mb-1 text-center text-lg font-semibold">Sign in</h1>
        <p className="mb-6 text-center text-sm text-muted">
          This journal is private.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
              autoFocus
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-6 flex h-6 items-center justify-center">
          <span className="inline-block h-5 w-32 animate-pulse rounded bg-muted/20" />
        </div>
        <div className="space-y-4">
          <div className="h-10 animate-pulse rounded-lg bg-muted/20" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/20" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/20" />
        </div>
      </div>
    </div>
  );
}
