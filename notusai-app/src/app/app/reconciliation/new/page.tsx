"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function NewReconciliationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; mismatches: number; itcAtRisk: number } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/reconciliation/run", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Reconciliation failed");
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setResult(data);
    setSubmitting(false);
    setTimeout(() => router.push("/app/reconciliation"), 3000);
  }

  return (
    <div className="px-8 py-8">
      <Link href="/app/reconciliation" className="mb-6 inline-block text-sm text-ink-600 hover:text-ink-900">
        ← Back to reconciliations
      </Link>
      <h1 className="text-2xl font-bold">Run reconciliation</h1>
      <p className="mt-2 text-ink-600">
        Upload Tally Purchase Register (CSV) and GSTR-2B JSON file from GST portal. Get a complete match in 30 seconds.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-5 rounded-xl border border-ink-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-ink-700">GSTIN (15 chars)</label>
          <input
            name="gstin"
            required
            placeholder="27AABCS1234M1Z5"
            className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700">Period (YYYY-MM)</label>
          <input
            name="period"
            required
            placeholder="2025-10"
            className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700">Tally Purchase Register (CSV)</label>
          <input
            name="booksCsv"
            type="file"
            accept=".csv,.xls,.xlsx"
            required
            className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-ink-500">Export from Tally: Display → Day Book → Purchase Register → Export → CSV</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700">GSTR-2B JSON (optional)</label>
          <input
            name="twoBJson"
            type="file"
            accept=".json"
            className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-ink-500">If skipped, we'll use mock 2B data for demonstration. Production needs GSP integration.</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
            ✓ Matched {result.matched} invoices · {result.mismatches} mismatches · ITC at risk: ₹{result.itcAtRisk.toLocaleString("en-IN")}
            <div className="mt-1 text-xs">Redirecting...</div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-ink-900 px-5 py-3 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
        >
          {submitting ? "Running reconciliation..." : "Run reconciliation"}
        </button>
      </form>
    </div>
  );
}
