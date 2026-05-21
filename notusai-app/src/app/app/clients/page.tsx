import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, industry, status, created_at, gstins(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-ink-600">{clients?.length || 0} clients in your portfolio</p>
        </div>
        <Link
          href="/app/clients/new"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85"
        >
          + Add client
        </Link>
      </header>

      {!clients || clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <h3 className="text-lg font-semibold">No clients yet</h3>
          <p className="mt-2 text-ink-600">Add your first client to start tracking their GST returns and notices.</p>
          <Link
            href="/app/clients/new"
            className="mt-4 inline-block rounded-lg bg-ink-900 px-5 py-2.5 font-semibold text-ink-50 hover:opacity-85"
          >
            Add your first client →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-ink-700">Client</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Industry</th>
                <th className="px-4 py-3 font-semibold text-ink-700">GSTINs</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Status</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Added</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const gstinCount = (c as { gstins?: Array<{ count: number }> }).gstins?.[0]?.count || 0;
                return (
                  <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <Link href={`/app/clients/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{c.industry || "—"}</td>
                    <td className="px-4 py-3 text-ink-700">{gstinCount}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.status === "active" ? "bg-green-100 text-green-900" : "bg-ink-100 text-ink-600"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(c.created_at)}</td>
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
