import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";
import { Sparkles, Zap, FileText, ShieldAlert, ChevronRight } from "lucide-react";

export default async function SmartInboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: firm }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("firms").select("*").eq("id", (await supabase.from("profiles").select("firm_id").eq("id", user.id).single()).data?.firm_id || "").single(),
  ]);

  // Critical / urgent items
  const today = new Date().toISOString();
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [urgentNotices, highAnomalies, openMismatches, pendingInvoicesGrouped, draftNotices] = await Promise.all([
    supabase
      .from("notices")
      .select("id, client_id, notice_type, deadline, demand_amount, clients(name)")
      .lte("deadline", in7Days)
      .gte("deadline", today.slice(0, 10))
      .in("status", ["pending", "drafting", "ready", "filed"])
      .order("deadline", { ascending: true })
      .limit(10),

    supabase
      .from("anomalies")
      .select("id, client_id, type, severity, notice_probability, message, clients(name)")
      .in("severity", ["high", "critical"])
      .eq("status", "open")
      .order("notice_probability", { ascending: false })
      .limit(10),

    supabase
      .from("mismatches")
      .select("id, vendor_name, amount, severity")
      .eq("status", "open")
      .order("amount", { ascending: false })
      .limit(5),

    supabase
      .from("invoices")
      .select("client_id, amount, cgst, sgst, igst, clients(name)")
      .eq("tally_exported", false),

    supabase
      .from("notices")
      .select("id, status")
      .eq("status", "ready"),
  ]);

  // Group pending invoices by client (top 3 batches)
  const byClient = new Map<string, { name: string; count: number; total: number }>();
  for (const inv of pendingInvoicesGrouped.data || []) {
    if (!inv.client_id) continue;
    const name = (inv as unknown as { clients?: { name: string } }).clients?.name || "Unknown";
    const total = (Number(inv.amount) || 0) + (Number(inv.cgst) || 0) + (Number(inv.sgst) || 0) + (Number(inv.igst) || 0);
    const cur = byClient.get(inv.client_id);
    if (cur) {
      cur.count++;
      cur.total += total;
    } else {
      byClient.set(inv.client_id, { name, count: 1, total });
    }
  }
  const topPending = Array.from(byClient.entries())
    .map(([id, v]) => ({ clientId: id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const totalPendingInvoices = pendingInvoicesGrouped.data?.length || 0;
  const totalDraftNotices = draftNotices.data?.length || 0;
  const agentActivityCount = topPending.length + totalDraftNotices + (highAnomalies.data?.length || 0);

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good morning</h1>
          <p className="text-ink-600">{firm?.name || "Your firm"} · {formatDate(today)}</p>
        </div>
        <Link
          href="/app/notices/new"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85"
        >
          + Quick draft
        </Link>
      </div>

      {/* Agent activity hero card */}
      {agentActivityCount > 0 && (
        <Link
          href="/app/pending"
          className="mb-8 block rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-6 transition hover:border-blue-500"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-700">
                <Sparkles className="h-4 w-4" />
                Your agents have been busy
              </div>
              <h2 className="mt-2 text-xl font-bold text-ink-900">
                {agentActivityCount} item{agentActivityCount === 1 ? "" : "s"} awaiting your approval
              </h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink-700">
                {totalPendingInvoices > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1">
                    <Zap className="h-3.5 w-3.5 text-blue-700" />
                    <strong>{totalPendingInvoices}</strong> invoices · {topPending.length} client{topPending.length === 1 ? "" : "s"}
                  </span>
                )}
                {totalDraftNotices > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1">
                    <FileText className="h-3.5 w-3.5 text-amber-700" />
                    <strong>{totalDraftNotices}</strong> notice draft{totalDraftNotices === 1 ? "" : "s"}
                  </span>
                )}
                {(highAnomalies.data?.length || 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-700" />
                    <strong>{highAnomalies.data?.length}</strong> high-risk anomalies
                  </span>
                )}
              </div>

              {topPending.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {topPending.map((p) => (
                    <div key={p.clientId} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">
                        <strong>{p.name}</strong> · {p.count} invoice{p.count === 1 ? "" : "s"} · {inrFmt(p.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <ChevronRight className="h-6 w-6 flex-shrink-0 text-blue-700" />
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Urgent */}
        <Card title="🔴 Urgent" count={urgentNotices.data?.length || 0}>
          {!urgentNotices.data?.length ? (
            <Empty msg="No urgent deadlines this week" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {urgentNotices.data.map((n) => {
                const client = (n as { clients?: { name: string } }).clients;
                return (
                  <li key={n.id} className="py-3">
                    <Link href={`/app/notices/${n.id}`} className="block hover:bg-ink-50">
                      <div className="font-medium">{client?.name || "Client"}</div>
                      <div className="text-xs text-ink-500">
                        {n.notice_type} · Deadline: {formatDate(n.deadline)}
                        {n.demand_amount && ` · Demand: ${inrFmt(Number(n.demand_amount))}`}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Attention */}
        <Card title="🟡 Attention" count={highAnomalies.data?.length || 0}>
          {!highAnomalies.data?.length ? (
            <Empty msg="No high-risk anomalies" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {highAnomalies.data.map((a) => {
                const client = (a as { clients?: { name: string } }).clients;
                return (
                  <li key={a.id} className="py-3">
                    <Link href={`/app/anomalies`} className="block hover:bg-ink-50">
                      <div className="font-medium">{client?.name || "Client"}</div>
                      <div className="text-xs text-ink-500">
                        {a.type} · {Math.round((a.notice_probability || 0) * 100)}% notice risk
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Mismatches */}
        <Card title="⚠️ Top mismatches" count={openMismatches.data?.length || 0}>
          {!openMismatches.data?.length ? (
            <Empty msg="No open mismatches" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {openMismatches.data.map((m) => (
                <li key={m.id} className="py-3">
                  <Link href={`/app/reconciliation`} className="block hover:bg-ink-50">
                    <div className="font-medium">{m.vendor_name}</div>
                    <div className="text-xs text-ink-500">
                      {inrFmt(Number(m.amount))} · {m.severity}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-bold">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction href="/app/pending" label="Agent activity" />
          <QuickAction href="/app/notices/new" label="Draft notice" />
          <QuickAction href="/app/reconciliation/new" label="Run reconciliation" />
          <QuickAction href="/app/copilot" label="Ask Copilot" />
        </div>
      </section>

      {/* Practice stats */}
      <section className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Free credits" value={String(firm?.free_credits_remaining ?? 0)} />
        <Stat label="Plan" value={firm?.plan || "free"} />
        <Stat label="Paid drafts" value={String(firm?.total_paid_drafts || 0)} />
        <Stat label="Profile" value={profile?.role || "owner"} />
      </section>
    </div>
  );
}

function Card({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="py-4 text-sm text-ink-500">{msg}</p>;
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-900 hover:border-ink-900"
    >
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-xl font-bold capitalize">{value}</div>
    </div>
  );
}
