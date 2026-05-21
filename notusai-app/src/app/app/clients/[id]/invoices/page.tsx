import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inrFmt } from "@/lib/utils";
import { InvoiceUploadPanel } from "./InvoiceUploadPanel";

export default async function ClientInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!client) notFound();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, vendor_name, vendor_gstin, amount, cgst, sgst, igst, source, tally_exported, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const total = (invoices || []).length;
  const totalValue = (invoices || []).reduce(
    (s, i) =>
      s +
      (Number(i.amount) || 0) +
      (Number(i.cgst) || 0) +
      (Number(i.sgst) || 0) +
      (Number(i.igst) || 0),
    0,
  );
  const pendingTallyExport = (invoices || []).filter((i) => !i.tally_exported).length;

  return (
    <div className="px-8 py-8">
      <Link
        href={`/app/clients/${id}`}
        className="mb-4 inline-block text-sm text-ink-600 hover:text-ink-900"
      >
        ← Back to client
      </Link>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices · {client.name}</h1>
          <p className="text-ink-600">Booked invoices for this client's purchase ledger.</p>
        </div>
        <Link
          href={`/app/clients/${id}/tally-bridge`}
          className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
        >
          ⚡ Export to Tally
        </Link>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total invoices" value={String(total)} />
        <Stat label="Total value" value={inrFmt(totalValue)} />
        <Stat
          label="Pending Tally export"
          value={String(pendingTallyExport)}
          good={pendingTallyExport === 0}
        />
      </section>

      <InvoiceUploadPanel clientId={id} clientName={client.name} />

      <h2 className="mb-3 mt-8 text-lg font-bold">Invoices ({total})</h2>

      {!invoices || invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-8 text-center">
          <p className="text-ink-600">
            No invoices yet. Upload PDFs above, OR forward client invoices to your connected Gmail
            (NotusAI auto-detects them).
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Invoice #</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Vendor</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold text-right">GST</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Tally</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const totalTax =
                  (Number(inv.cgst) || 0) +
                  (Number(inv.sgst) || 0) +
                  (Number(inv.igst) || 0);
                return (
                  <tr key={inv.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-ink-600">{inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{inv.vendor_name}</div>
                      {inv.vendor_gstin && (
                        <div className="text-xs text-ink-500">{inv.vendor_gstin}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {inrFmt(Number(inv.amount) || 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-700">{inrFmt(totalTax)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs">
                        {inv.source || "books"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.tally_exported ? (
                        <span className="text-xs text-green-700">✓ exported</span>
                      ) : (
                        <span className="text-xs text-amber-700">pending</span>
                      )}
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

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${good ? "text-green-700" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}
