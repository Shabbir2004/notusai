/**
 * Returns count + summary of pending (non-Tally-exported) invoices for a client,
 * plus the vendor → ledger mapping status.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { proposeVendorLedgerMatches } from "@/lib/integrations/tally-ledger-matcher";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", user.id)
    .single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Pending invoice count + sum
  const { data: invoices, count } = await supabase
    .from("invoices")
    .select("id, vendor_id, vendor_name, amount, cgst, sgst, igst", { count: "exact" })
    .eq("client_id", clientId)
    .eq("tally_exported", false);

  const totalValue = (invoices || []).reduce(
    (sum, inv) =>
      sum +
      (Number(inv.amount) || 0) +
      (Number(inv.cgst) || 0) +
      (Number(inv.sgst) || 0) +
      (Number(inv.igst) || 0),
    0,
  );

  // Unique vendors among pending
  const uniqueVendorIds = Array.from(
    new Set((invoices || []).map((i) => i.vendor_id).filter(Boolean)),
  );

  // Check ledger sync status
  const { data: config } = await supabase
    .from("client_tally_config")
    .select("ledgers_count, ledgers_last_synced_at, tally_company_name")
    .eq("client_id", clientId)
    .maybeSingle();

  const ledgersSynced = (config?.ledgers_count || 0) > 0;

  // Get vendor mapping status (only if ledgers are synced)
  let mappingProposals = null;
  let unmappedVendorCount = 0;

  if (ledgersSynced && uniqueVendorIds.length > 0) {
    try {
      const proposals = await proposeVendorLedgerMatches({
        firmId: profile.firm_id,
        clientId,
      });

      mappingProposals = proposals;
      unmappedVendorCount = proposals.filter(
        (p) => p.confidence === "new" || p.confidence === "low",
      ).length;
    } catch (e) {
      console.error("Match failed:", e);
    }
  }

  return NextResponse.json({
    pendingCount: count || 0,
    totalValue,
    uniqueVendorCount: uniqueVendorIds.length,
    ledgersSynced,
    ledgersCount: config?.ledgers_count || 0,
    ledgersLastSyncedAt: config?.ledgers_last_synced_at,
    tallyCompanyName: config?.tally_company_name,
    unmappedVendorCount,
    mappingProposals,
    readyToExport: ledgersSynced && unmappedVendorCount === 0 && (count || 0) > 0,
  });
}
