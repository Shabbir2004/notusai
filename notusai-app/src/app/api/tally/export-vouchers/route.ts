/**
 * Export pending (non-Tally-exported) invoices as Tally voucher XML.
 *
 * Flow:
 *   1. CA calls this endpoint with clientId
 *   2. We fetch unexported invoices + their vendor → ledger mappings
 *   3. Generate XML
 *   4. Create export_batch row
 *   5. Mark invoices as exported
 *   6. Return XML as file download
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateTallyVoucherXml,
  type TallyInvoice,
  type TallyConfig,
} from "@/lib/integrations/tally-xml";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", user.id)
    .single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const body = await req.json();
  const clientId: string = body.clientId;
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Load config + client
  const [{ data: config }, { data: client }] = await Promise.all([
    supabase
      .from("client_tally_config")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("clients").select("id, name, firm_id").eq("id", clientId).single(),
  ]);

  if (!client || client.firm_id !== profile.firm_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Load pending invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, vendor_id, vendor_name, vendor_gstin, amount, cgst, sgst, igst, hsn_code")
    .eq("client_id", clientId)
    .eq("tally_exported", false)
    .order("invoice_date", { ascending: true });

  if (!invoices || invoices.length === 0) {
    return NextResponse.json(
      { error: "No pending invoices to export for this client" },
      { status: 400 },
    );
  }

  // Load vendor → ledger mappings for this client
  const { data: mappings } = await supabase
    .from("tally_vendor_mappings")
    .select("vendor_id, tally_ledger_id, tally_ledgers(name)")
    .eq("client_id", clientId);

  const vendorLedgerMap: Record<string, string> = {};
  for (const m of mappings || []) {
    const ledger = (m as { tally_ledgers?: { name: string } }).tally_ledgers;
    const inv = invoices.find((i) => i.vendor_id === m.vendor_id);
    if (inv && ledger) {
      vendorLedgerMap[inv.vendor_name] = ledger.name;
    }
  }

  // Build config
  const tallyConfig: TallyConfig = {
    companyName: config?.tally_company_name || client.name,
    purchaseLedger: config?.default_purchase_ledger || "Purchase A/c",
    cgstLedger: config?.default_cgst_ledger || "Input CGST",
    sgstLedger: config?.default_sgst_ledger || "Input SGST",
    igstLedger: config?.default_igst_ledger || "Input IGST",
    vendorLedgerMap,
  };

  // Convert to TallyInvoice format
  const tallyInvoices: TallyInvoice[] = invoices.map((inv) => ({
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date || new Date().toISOString().slice(0, 10),
    vendor_name: inv.vendor_name,
    vendor_gstin: inv.vendor_gstin,
    amount: Number(inv.amount) || 0,
    cgst: Number(inv.cgst) || 0,
    sgst: Number(inv.sgst) || 0,
    igst: Number(inv.igst) || 0,
    hsn_code: inv.hsn_code,
  }));

  // Generate XML
  const result = generateTallyVoucherXml(tallyInvoices, tallyConfig);

  // Create export batch
  const filename = `notusai_tally_${client.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xml`;

  const { data: batch } = await supabase
    .from("tally_export_batches")
    .insert({
      firm_id: profile.firm_id,
      client_id: clientId,
      user_id: user.id,
      invoice_count: result.invoiceCount,
      total_value: result.totalValue,
      filename,
      status: "generated",
      notes: result.warnings.length > 0 ? result.warnings.join("; ") : null,
    })
    .select()
    .single();

  // Mark invoices as exported
  if (batch) {
    await supabase
      .from("invoices")
      .update({
        tally_exported: true,
        tally_export_batch_id: batch.id,
        tally_exported_at: new Date().toISOString(),
      })
      .in(
        "id",
        invoices.map((i) => i.id),
      );
  }

  // Return XML as file download
  return new NextResponse(result.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Invoice-Count": String(result.invoiceCount),
      "X-Total-Value": String(result.totalValue),
      "X-Warnings": result.warnings.length > 0 ? "yes" : "no",
    },
  });
}
