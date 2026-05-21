import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";
import { stageLabel, nextSuggestedActions, type LitigationStage } from "@/lib/litigation/state-machine";

export default async function LitigationCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lcase } = await supabase
    .from("litigation_cases")
    .select("*, notices(*), clients(name, primary_contact_name, primary_contact_email)")
    .eq("id", id)
    .single();

  if (!lcase) notFound();

  const { data: hearings } = await supabase
    .from("hearings")
    .select("*")
    .eq("case_id", id)
    .order("scheduled_at", { ascending: true });

  const client = (lcase as { clients?: { name: string; primary_contact_name: string; primary_contact_email: string } }).clients;
  const notice = (lcase as { notices?: { id: string; notice_type: string; demand_amount: number | null; status: string } }).notices;
  const nextActions = nextSuggestedActions(lcase.current_stage as LitigationStage);
  const timeline = (lcase.raw_timeline as Array<{ stage: string; at: string; note?: string }>) || [];

  return (
    <div className="px-8 py-8">
      <Link href="/app/litigation" className="mb-6 inline-block text-sm text-ink-600 hover:text-ink-900">
        ← Back to Litigation OS
      </Link>

      {/* Header */}
      <header className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{client?.name || "Client"}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
              <span>Stage: <strong>{stageLabel(lcase.current_stage as LitigationStage)}</strong></span>
              {lcase.file_no && <span>File: {lcase.file_no}</span>}
              {lcase.next_action_due && <span>Next action due: {formatDate(lcase.next_action_due)}</span>}
            </div>
            {lcase.next_action && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <strong>Next:</strong> {lcase.next_action}
              </div>
            )}
          </div>
          <div className="text-right">
            {lcase.total_demand_current != null && (
              <>
                <div className="text-xs uppercase tracking-wide text-ink-500">Current demand</div>
                <div className="text-2xl font-bold">{inrFmt(Number(lcase.total_demand_current))}</div>
                {lcase.total_demand_at_start != null && lcase.total_demand_at_start !== lcase.total_demand_current && (
                  <div className="text-xs text-green-700">
                    Reduced from {inrFmt(Number(lcase.total_demand_at_start))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Linked notice */}
      {notice && (
        <section className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold">Linked notice</h2>
          <Link
            href={`/app/notices/${notice.id}`}
            className="flex items-center justify-between rounded-lg border border-ink-100 p-3 hover:bg-ink-50"
          >
            <div>
              <div className="font-medium">{notice.notice_type}</div>
              <div className="text-xs text-ink-500">
                {notice.demand_amount ? `Demand: ${inrFmt(Number(notice.demand_amount))}` : "Demand: not quantified"} · Status: {notice.status}
              </div>
            </div>
            <span className="text-sm text-ink-600">View →</span>
          </Link>
        </section>
      )}

      {/* Hearings */}
      <section className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-bold">Hearings</h2>
        {!hearings || hearings.length === 0 ? (
          <p className="text-sm text-ink-500">No hearings scheduled.</p>
        ) : (
          <ul className="space-y-3">
            {hearings.map((h) => (
              <li
                key={h.id}
                className={`rounded-lg border p-4 ${
                  h.status === "scheduled" && new Date(h.scheduled_at) > new Date()
                    ? "border-amber-200 bg-amber-50"
                    : "border-ink-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">
                      {new Date(h.scheduled_at).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                    <div className="text-xs text-ink-600">
                      {h.forum} · {h.location || "Location TBD"} · Status: {h.status}
                    </div>
                  </div>
                  {h.brief_md && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                      ✓ Brief ready
                    </span>
                  )}
                </div>
                {h.outcome_md && (
                  <div className="mt-2 border-t border-ink-100 pt-2 text-sm text-ink-700">
                    <strong>Outcome:</strong> {h.outcome_md}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Timeline */}
      <section className="mb-8 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-bold">Case timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-ink-500">No timeline events recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-ink-200 pl-6">
            {timeline.map((evt, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink-900" />
                <div className="font-medium">{stageLabel(evt.stage as LitigationStage)}</div>
                <div className="text-xs text-ink-500">{new Date(evt.at).toLocaleString("en-IN")}</div>
                {evt.note && <p className="mt-1 text-sm text-ink-700">{evt.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Next suggested actions */}
      {nextActions.length > 0 && (
        <section className="rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold">Suggested next steps</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
            {nextActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
