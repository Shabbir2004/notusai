import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";

export default async function AnomaliesPage() {
  const supabase = await createClient();
  const { data: anomalies } = await supabase
    .from("anomalies")
    .select("*, clients(name)")
    .eq("status", "open")
    .order("notice_probability", { ascending: false })
    .limit(100);

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Anomaly Engine</h1>
        <p className="text-ink-600">Pre-filing anomalies — fix before they become notices.</p>
      </header>

      {!anomalies || anomalies.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <h3 className="text-lg font-semibold">No open anomalies</h3>
          <p className="mt-2 text-ink-600">All client filings look clean. Run a reconciliation to surface new issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((a) => {
            const client = (a as { clients?: { name: string } }).clients;
            const sevColor = a.severity === "critical" ? "border-red-400 bg-red-50"
              : a.severity === "high" ? "border-amber-400 bg-amber-50"
              : a.severity === "medium" ? "border-yellow-300 bg-yellow-50"
              : "border-ink-200 bg-white";
            return (
              <div key={a.id} className={`rounded-xl border p-5 ${sevColor}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                        a.severity === "critical" ? "bg-red-200 text-red-900"
                        : a.severity === "high" ? "bg-amber-200 text-amber-900"
                        : a.severity === "medium" ? "bg-yellow-200 text-yellow-900"
                        : "bg-ink-200 text-ink-700"
                      }`}>{a.severity}</span>
                      <span className="font-semibold">{client?.name || "Client"}</span>
                      <span className="text-sm text-ink-500">· {a.period} · {a.type}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-800">{a.message}</p>
                    {a.recommended_action && (
                      <p className="mt-2 text-sm font-medium text-ink-900">→ {a.recommended_action}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
                      <span>Notice probability: {Math.round((a.notice_probability || 0) * 100)}%</span>
                      {a.estimated_savings_inr && <span>Potential saving: {inrFmt(Number(a.estimated_savings_inr))}</span>}
                      <span>Detected: {formatDate(a.detected_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
