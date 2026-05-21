import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";

export default async function ReconciliationPage() {
  const supabase = await createClient();
  const { data: recos } = await supabase
    .from("reconciliations")
    .select("*, gstins(gstin, clients(name))")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation Hub</h1>
          <p className="text-ink-600">Match GSTR-2B against books for every client, every month.</p>
        </div>
        <Link
          href="/app/reconciliation/new"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85"
        >
          + Run new
        </Link>
      </header>

      {!recos || recos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <h3 className="text-lg font-semibold">No reconciliations yet</h3>
          <p className="mt-2 text-ink-600">Upload a Tally Purchase Register and GSTR-2B JSON to run your first match.</p>
          <Link href="/app/reconciliation/new" className="mt-4 inline-block rounded-lg bg-ink-900 px-5 py-2.5 font-semibold text-ink-50 hover:opacity-85">
            Run first reconciliation →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-ink-700">Client / GSTIN</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Period</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Matched</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Mismatch ₹</th>
                <th className="px-4 py-3 font-semibold text-ink-700">ITC at risk</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Date</th>
              </tr>
            </thead>
            <tbody>
              {recos.map((r) => {
                const g = (r as { gstins?: { gstin: string; clients?: { name: string } } }).gstins;
                return (
                  <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{g?.clients?.name || "—"}</div>
                      <div className="text-xs text-ink-500">{g?.gstin || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{r.period}</td>
                    <td className="px-4 py-3 text-ink-700">
                      {r.matched_count || 0} / {r.total_books_invoices || 0}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{r.mismatch_value ? inrFmt(Number(r.mismatch_value)) : "—"}</td>
                    <td className="px-4 py-3 font-medium text-amber-700">{r.itc_at_risk ? inrFmt(Number(r.itc_at_risk)) : "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
