"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { BrandMark } from "@/components/Sidebar";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="page-glow relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card/90 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-7 flex flex-col items-center gap-3">
          <BrandMark />
          <div className="text-center">
            <h1 className="font-display text-4xl tracking-tight">Moblog</h1>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
              <Lock className="h-3 w-3" /> Private trading journal — sign in to continue
            </p>
          </div>
        </div>

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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full pr-10"
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-2.5"
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
