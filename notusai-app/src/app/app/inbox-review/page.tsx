import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/**
 * Inbox Review — every email auto-processed by the system. Lets CA see what
 * was matched correctly, what wasn't, and manually link unmatched items.
 */
export default async function InboxReviewPage() {
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("gmail_processed_messages")
    .select("*, notices(id, client_id, notice_type, demand_amount, clients(name))")
    .order("processed_at", { ascending: false })
    .limit(100);

  const byClassification = (messages || []).reduce((acc, m) => {
    const key = m.classified_as || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, typeof messages>);

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Inbox review</h1>
        <p className="text-ink-600">Every email auto-processed in the last 7 days. Review matches, link unmatched.</p>
      </header>

      {/* Summary stats */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["notice", "📄 Notices"],
          ["vendor_reply", "💬 Vendor replies"],
          ["invoice", "📥 Invoices"],
          ["tally_export", "📊 Tally exports"],
          ["ignored", "❌ Ignored"],
        ].map(([key, label]) => (
          <div key={key} className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
            <div className="mt-1 text-2xl font-bold">{(byClassification[key] || []).length}</div>
          </div>
        ))}
      </section>

      {!messages || messages.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-ink-600">
            No emails processed yet. Once Gmail sync runs, every email appears here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const notice = (m as { notices?: { id: string; client_id: string; notice_type: string; demand_amount: number; clients?: { name: string } } | null }).notices;
            const isOrphan = (m.classified_as === "notice" || m.classified_as === "invoice") && !notice?.client_id;
            return (
              <div
                key={m.id}
                className={`rounded-xl border p-4 ${
                  isOrphan ? "border-amber-300 bg-amber-50" : "border-ink-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                        m.classified_as === "notice" ? "bg-blue-100 text-blue-900" :
                        m.classified_as === "vendor_reply" ? "bg-green-100 text-green-900" :
                        m.classified_as === "invoice" ? "bg-purple-100 text-purple-900" :
                        "bg-ink-100 text-ink-700"
                      }`}>{m.classified_as}</span>
                      <span className="text-xs text-ink-500">{formatDate(m.processed_at)}</span>
                      {isOrphan && (
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                          ⚠ Needs manual link
                        </span>
                      )}
                    </div>
                    <div className="mt-2 font-medium text-ink-900">{m.subject || "(no subject)"}</div>
                    <div className="text-xs text-ink-600">From: {m.from_email}</div>
                    {notice && (
                      <div className="mt-2 rounded-lg border border-ink-100 bg-ink-50 p-2 text-sm">
                        <div className="font-medium">
                          {notice.notice_type}{" "}
                          {notice.clients && (
                            <span className="text-ink-600">· matched to {notice.clients.name}</span>
                          )}
                        </div>
                        {notice.demand_amount && (
                          <div className="text-xs text-ink-500">Demand: ₹{Number(notice.demand_amount).toLocaleString("en-IN")}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {notice?.id && (
                      <Link
                        href={`/app/notices/${notice.id}`}
                        className="text-sm font-medium text-ink-900 hover:underline"
                      >
                        View draft →
                      </Link>
                    )}
                    {isOrphan && notice?.id && (
                      <Link
                        href={`/app/notices/${notice.id}`}
                        className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:opacity-90"
                      >
                        Link to client
                      </Link>
                    )}
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
