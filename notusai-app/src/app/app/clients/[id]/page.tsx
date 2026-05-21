import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) notFound();

  // Load related entities in parallel
  const [
    { data: gstins },
    { data: notices },
    { data: reconciliations },
    { data: anomalies },
  ] = await Promise.all([
    supabase.from("gstins").select("*").eq("client_id", id).order("created_at"),
    supabase
      .from("notices")
      .select("id, notice_type, deadline, demand_amount, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reconciliations")
      .select("id, period, matched_count, mismatch_value, itc_at_risk, created_at, gstins(gstin)")
      .in("gstin_id", (await supabase.from("gstins").select("id").eq("client_id", id)).data?.map((g) => g.id) || ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("anomalies")
      .select("id, type, severity, message, notice_probability, status, detected_at")
      .eq("client_id", id)
      .eq("status", "open")
      .order("detected_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="px-8 py-8">
      <Link href="/app/clients" className="mb-6 inline-block text-sm text-ink-600 hover:text-ink-900">
        ← Back to clients
      </Link>

      {/* Header */}
      <header className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
              {client.industry && <span>{client.industry}</span>}
              {client.business_type && <span>{client.business_type}</span>}
              <span>
                Status: <span className="font-medium">{client.status}</span>
              </span>
              <span>Added: {formatDate(client.created_at)}</span>
            </div>
            {(client.primary_contact_name || client.primary_contact_phone || client.primary_contact_email) && (
              <div className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-700">
                <strong>Contact:</strong>{" "}
                {client.primary_contact_name && `${client.primary_contact_name} · `}
                {client.primary_contact_phone && `${client.primary_contact_phone} · `}
                {client.primary_contact_email}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href={`/app/notices/new?client=${client.id}`}
              className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-semibold text-ink-50 hover:opacity-85"
            >
              + Draft notice
            </Link>
            <Link
              href={`/app/clients/${client.id}/invoices`}
              className="rounded-lg border border-ink-300 px-3 py-1.5 text-center text-sm hover:bg-ink-50"
            >
              📥 Upload invoices
            </Link>
            <Link
              href={`/app/reconciliation/new?client=${client.id}`}
              className="rounded-lg border border-ink-300 px-3 py-1.5 text-center text-sm hover:bg-ink-50"
            >
              + Run recon
            </Link>
            <Link
              href={`/app/clients/${client.id}/tally-bridge`}
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-center text-sm font-medium text-blue-900 hover:bg-blue-100"
            >
              ⚡ Tally Bridge
            </Link>
          </div>
        </div>
      </header>

      {/* Stats strip */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="GSTINs" value={String(gstins?.length || 0)} />
        <Stat label="Notices" value={String(notices?.length || 0)} />
        <Stat label="Open anomalies" value={String(anomalies?.length || 0)} />
        <Stat label="Recent recons" value={String(reconciliations?.length || 0)} />
      </section>

      {/* GSTINs */}
      <section className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">GSTINs</h2>
        {!gstins || gstins.length === 0 ? (
          <p className="text-sm text-ink-500">No GSTINs added yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {gstins.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-mono text-sm font-medium">{g.gstin}</div>
                  <div className="text-xs text-ink-500">
                    {g.state} · {g.registration_type || "regular"}
                    {g.status !== "active" && ` · ${g.status}`}
                  </div>
                </div>
                <Link
                  href={`/app/reconciliation/new?gstin=${g.gstin}`}
                  className="text-xs text-ink-600 hover:text-ink-900"
                >
                  Run reconciliation →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Open anomalies */}
      {anomalies && anomalies.length > 0 && (
        <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="mb-4 text-lg font-bold">⚠️ Open anomalies</h2>
          <ul className="space-y-3">
            {anomalies.map((a) => (
              <li key={a.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{a.type}</div>
                  <span className="text-xs uppercase tracking-wide text-amber-700">{a.severity}</span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{a.message}</p>
                <p className="mt-1 text-xs text-ink-500">
                  Notice probability: {Math.round((a.notice_probability || 0) * 100)}% · Detected {formatDate(a.detected_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent notices */}
      <section className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">Recent notices</h2>
        {!notices || notices.length === 0 ? (
          <p className="text-sm text-ink-500">
            No notices yet for this client.{" "}
            <Link href={`/app/notices/new?client=${client.id}`} className="text-ink-900 underline">
              Draft the first one
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {notices.map((n) => (
              <li key={n.id} className="py-3">
                <Link href={`/app/notices/${n.id}`} className="flex items-center justify-between hover:bg-ink-50">
                  <div>
                    <div className="font-medium">{n.notice_type}</div>
                    <div className="text-xs text-ink-500">
                      {n.deadline && `Deadline: ${formatDate(n.deadline)} · `}
                      {n.demand_amount && `Demand: ${inrFmt(Number(n.demand_amount))} · `}
                      Created: {formatDate(n.created_at)}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    n.status === "ready" ? "bg-green-100 text-green-900" :
                    n.status === "drafting" ? "bg-yellow-100 text-yellow-900" :
                    n.status === "failed" ? "bg-red-100 text-red-900" :
                    "bg-ink-100 text-ink-700"
                  }`}>{n.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent reconciliations */}
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">Recent reconciliations</h2>
        {!reconciliations || reconciliations.length === 0 ? (
          <p className="text-sm text-ink-500">
            No reconciliations yet.{" "}
            <Link href={`/app/reconciliation/new?client=${client.id}`} className="text-ink-900 underline">
              Run the first one
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {reconciliations.map((r) => {
              const gstin = (r as { gstins?: { gstin: string } }).gstins?.gstin;
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.period}</div>
                      <div className="text-xs text-ink-500">
                        GSTIN: {gstin || "—"} · Matched: {r.matched_count || 0}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium text-amber-700">
                        ITC at risk: {r.itc_at_risk ? inrFmt(Number(r.itc_at_risk)) : "—"}
                      </div>
                      <div className="text-xs text-ink-500">{formatDate(r.created_at)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
