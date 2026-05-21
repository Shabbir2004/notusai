import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";
import { stageLabel, isOpenStage, type LitigationStage } from "@/lib/litigation/state-machine";

export default async function LitigationOSPage() {
  const supabase = await createClient();

  const [{ data: cases }, { data: hearings }] = await Promise.all([
    supabase
      .from("litigation_cases")
      .select("*, clients(name)")
      .order("next_action_due", { ascending: true })
      .limit(50),

    supabase
      .from("hearings")
      .select("*, litigation_cases(id, clients(name))")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(10),
  ]);

  const openCases = (cases || []).filter((c) => isOpenStage(c.current_stage as LitigationStage));

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Litigation OS</h1>
        <p className="text-ink-600">{openCases.length} open cases · {hearings?.length || 0} upcoming hearings</p>
      </header>

      {/* Upcoming hearings */}
      {hearings && hearings.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">⚠️ Upcoming hearings</h2>
          <div className="space-y-3">
            {hearings.map((h) => {
              const c = (h as { litigation_cases?: { id?: string; clients?: { name: string } } }).litigation_cases;
              return (
                <div key={h.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{c?.clients?.name || "Client"}</div>
                      <div className="text-sm text-ink-700">
                        {h.forum} · {new Date(h.scheduled_at).toLocaleString("en-IN", {
                          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                      {h.location && <div className="text-xs text-ink-500">📍 {h.location}</div>}
                    </div>
                    {c?.id && (
                      <Link
                        href={`/app/litigation/${c.id}`}
                        className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ink-50 hover:opacity-85"
                      >
                        View case
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Open cases */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Active cases</h2>
        {openCases.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
            <p className="text-ink-600">No active litigation cases. When you draft and file a notice reply, it gets tracked here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-ink-700">Client</th>
                  <th className="px-4 py-3 font-semibold text-ink-700">Stage</th>
                  <th className="px-4 py-3 font-semibold text-ink-700">Next action</th>
                  <th className="px-4 py-3 font-semibold text-ink-700">Due</th>
                  <th className="px-4 py-3 font-semibold text-ink-700">Demand</th>
                </tr>
              </thead>
              <tbody>
                {openCases.map((c) => {
                  const client = (c as { clients?: { name: string } }).clients;
                  return (
                    <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                      <td className="px-4 py-3">
                        <Link href={`/app/litigation/${c.id}`} className="font-medium hover:underline">
                          {client?.name || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-700">{stageLabel(c.current_stage as LitigationStage)}</td>
                      <td className="px-4 py-3 text-ink-700">{c.next_action || "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{c.next_action_due ? formatDate(c.next_action_due) : "—"}</td>
                      <td className="px-4 py-3 text-ink-700">{c.total_demand_current ? inrFmt(Number(c.total_demand_current)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
