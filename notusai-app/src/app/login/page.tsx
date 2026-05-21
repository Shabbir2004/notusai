"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Link href="/" className="mb-8 inline-flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-sm font-extrabold text-ink-50">
          N
        </div>
        <span className="text-lg font-bold">NotusAI</span>
      </Link>

      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-ink-600">
        We'll email you a magic link. No password needed.
      </p>

      {sent ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
          ✓ Check your email at <strong>{email}</strong>. Click the link to sign in.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcafirm.com"
              className="mt-1 w-full rounded-lg border border-ink-300 px-4 py-3 focus:border-ink-900 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-ink-900 px-4 py-3 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
          >
            {loading ? "Sending link..." : "Send magic link"}
          </button>
        </form>
      )}

      <p className="mt-8 text-sm text-ink-500">
        By signing in you agree to be a design partner for early NotusAI builds.
      </p>
    </main>
  );
}
