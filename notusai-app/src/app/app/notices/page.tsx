import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";

export default async function NoticesPage() {
  const supabase = await createClient();
  const { data: notices } = await supabase
    .from("notices")
    .select("id, client_id, notice_type, notice_number, status, deadline, demand_amount, tier, price_inr, was_free, paid, created_at, clients(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notices</h1>
          <p className="text-ink-600">All notice drafts and litigation cases</p>
        </div>
        <Link
          href="/app/notices/new"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85"
        >
          + New notice
        </Link>
      </header>

      {!notices || notices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <h3 className="text-lg font-semibold">No notices yet</h3>
          <p className="mt-2 text-ink-600">Draft your first notice reply free.</p>
          <Link href="/app/notices/new" className="mt-4 inline-block rounded-lg bg-ink-900 px-5 py-2.5 font-semibold text-ink-50 hover:opacity-85">
            Draft your first notice →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-ink-700">Client</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Type</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Deadline</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Demand</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Status</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Price</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const client = (n as { clients?: { name: string } }).clients;
                return (
                  <tr key={n.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <Link href={`/app/notices/${n.id}`} className="font-medium hover:underline">
                        {client?.name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{n.notice_type}</td>
                    <td className="px-4 py-3 text-ink-700">{n.deadline ? formatDate(n.deadline) : "—"}</td>
                    <td className="px-4 py-3 text-ink-700">{n.demand_amount ? inrFmt(Number(n.demand_amount)) : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                    <td className="px-4 py-3 text-ink-700">
                      {n.was_free ? "Free" : n.paid ? inrFmt(n.price_inr) : `${inrFmt(n.price_inr)} (unpaid)`}
                    </td>
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-ink-100 text-ink-700",
    drafting: "bg-yellow-100 text-yellow-900",
    ready: "bg-green-100 text-green-900",
    failed: "bg-red-100 text-red-900",
    filed: "bg-blue-100 text-blue-900",
    closed: "bg-ink-100 text-ink-500",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
