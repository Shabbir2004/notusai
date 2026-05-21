import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: notice } = await supabase
    .from("notices")
    .select("*, clients(name)")
    .eq("id", id)
    .single();

  if (!notice) notFound();
  const client = (notice as { clients?: { name: string } }).clients;

  return (
    <div className="px-8 py-8">
      <Link href="/app/notices" className="mb-6 inline-block text-sm text-ink-600 hover:text-ink-900">
        ← Back to notices
      </Link>

      <header className="mb-8 border-b border-ink-200 pb-6">
        <h1 className="text-2xl font-bold">{client?.name || "Notice"}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
          <span>{notice.notice_type}</span>
          {notice.notice_number && <span>{notice.notice_number}</span>}
          {notice.period && <span>Period: {notice.period}</span>}
          {notice.demand_amount && <span>Demand: {inrFmt(Number(notice.demand_amount))}</span>}
          {notice.deadline && <span>Deadline: {formatDate(notice.deadline)}</span>}
        </div>
      </header>

      {notice.status === "drafting" && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-900">
          ⏳ Generating draft... usually takes 30–60 seconds. Refresh in a moment.
        </div>
      )}

      {notice.status === "failed" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          ❌ {notice.failure_reason || "Drafting failed"}. Try again or contact support.
        </div>
      )}

      {!notice.was_free && !notice.paid && notice.razorpay_payment_link && notice.status === "ready" && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="font-semibold text-amber-900">Payment required to view full draft</div>
          <p className="mt-1 text-sm text-amber-900">
            This is a {notice.tier} notice. Pay {inrFmt(notice.price_inr)} to unlock.
          </p>
          <a
            href={notice.razorpay_payment_link}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-ink-900 hover:opacity-90"
          >
            Pay {inrFmt(notice.price_inr)} via Razorpay →
          </a>
        </div>
      )}

      {notice.status === "ready" && (notice.was_free || notice.paid) && notice.draft_md && (
        <article className="prose-draft rounded-xl border border-ink-200 bg-white p-8">
          <pre className="whitespace-pre-wrap font-sans text-ink-900">{notice.draft_md}</pre>
        </article>
      )}

      {notice.status === "ready" && !notice.was_free && !notice.paid && !notice.razorpay_payment_link && (
        <div className="rounded-xl border border-ink-200 bg-white p-8 text-center text-ink-500">
          Payment link not yet generated. Contact support.
        </div>
      )}

      {notice.draft_md && (notice.was_free || notice.paid) && (
        <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4 text-xs text-ink-500">
          <strong>Reminder:</strong> Verify every case-law citation on{" "}
          <a href="https://indiankanoon.org" target="_blank" rel="noreferrer" className="underline">indiankanoon.org</a>{" "}
          before filing. AI-assisted draft; your professional review and signature required.
        </div>
      )}
    </div>
  );
}
