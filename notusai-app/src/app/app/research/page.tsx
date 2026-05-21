"use client";

import { useState } from "react";

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);

  async function search() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    const res = await fetch("/api/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      setAnswer("❌ Search failed");
      setLoading(false);
      return;
    }
    const { answer: result } = await res.json();
    setAnswer(result);
    setHistory((h) => [{ q: query, a: result }, ...h.slice(0, 9)]);
    setLoading(false);
  }

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Tax Research</h1>
        <p className="text-ink-600">Indian GST + Income Tax research. Cites real sections, rules, circulars, case laws.</p>
      </header>

      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Example: What's the GST treatment of warranty services sold separately from the original product?"
          rows={3}
          className="w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="mt-3 rounded-lg bg-ink-900 px-5 py-2.5 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
        >
          {loading ? "Researching..." : "Research"}
        </button>
      </div>

      {answer && (
        <article className="prose-draft mt-6 rounded-xl border border-ink-200 bg-white p-8">
          <pre className="whitespace-pre-wrap font-sans">{answer}</pre>
        </article>
      )}

      {history.length > 1 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Recent queries</h2>
          <div className="space-y-2">
            {history.slice(1).map((h, i) => (
              <details key={i} className="rounded-lg border border-ink-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 font-medium">{h.q}</summary>
                <pre className="whitespace-pre-wrap border-t border-ink-100 px-4 py-3 font-sans text-sm">{h.a}</pre>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
