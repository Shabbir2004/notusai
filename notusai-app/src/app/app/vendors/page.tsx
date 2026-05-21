import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function VendorsPage() {
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("risk_score", { ascending: false })
    .limit(100);

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <p className="text-ink-600">Ranked by risk score — high-risk vendors cause your ITC mismatches.</p>
      </header>

      {!vendors || vendors.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-ink-600">No vendors tracked yet. Vendors auto-populate when you run reconciliations.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-ink-700">Vendor</th>
                <th className="px-4 py-3 font-semibold text-ink-700">GSTIN</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Risk score</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Filing punctuality</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Late filings</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Total invoices</th>
                <th className="px-4 py-3 font-semibold text-ink-700">Last assessed</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const risk = Number(v.risk_score) || 0;
                const riskColor = risk >= 7 ? "text-red-700" : risk >= 4 ? "text-amber-700" : "text-green-700";
                return (
                  <tr key={v.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3 text-ink-600">{v.gstin || "—"}</td>
                    <td className={`px-4 py-3 font-bold ${riskColor}`}>{risk.toFixed(1)}</td>
                    <td className="px-4 py-3 text-ink-700">{Number(v.filing_punctuality || 5).toFixed(1)}</td>
                    <td className="px-4 py-3 text-ink-700">{v.late_filings_count || 0}</td>
                    <td className="px-4 py-3 text-ink-700">{v.total_invoices_count || 0}</td>
                    <td className="px-4 py-3 text-ink-500">{v.last_assessed_at ? formatDate(v.last_assessed_at) : "Never"}</td>
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
