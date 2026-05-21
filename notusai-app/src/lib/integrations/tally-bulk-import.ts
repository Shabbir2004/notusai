/**
 * Shared logic for importing one client's pending invoices into Tally.
 * Used by both /api/tally/direct-import (single-client) and
 * /api/tally/import-all-pending (multi-client batch).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateTallyVoucherXml,
  type TallyInvoice,
  type TallyConfig,
} from "./tally-xml";
import { postXmlToTally, TallyError } from "./tally-http";

export type ClientImportStatus =
  | "imported"
  | "no_pending"
  | "tally_offline"
  | "tally_rejected"
  | "unknown_error";

export interface ClientImportResult {
  clientId: string;
  clientName: string;
  status: ClientImportStatus;
  vouchersImported: number;
  vouchersAltered: number;
  invoiceCount: number;
  totalValue: number;
  message: string;
  errorDetails?: string;
  tallyErrors?: string[];
  requiresSetup?: boolean;
}

export async function importClientToTally(opts: {
  supabase: SupabaseClient;
  firmId: string;
  userId: string;
  clientId: string;
}): Promise<ClientImportResult> {
  const { supabase, firmId, userId, clientId } = opts;

  const [{ data: config }, { data: client }] = await Promise.all([
    supabase
      .from("client_tally_config")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id, name, firm_id")
      .eq("id", clientId)
      .single(),
  ]);

  if (!client || client.firm_id !== firmId) {
    return {
      clientId,
      clientName: "Unknown",
      status: "unknown_error",
      vouchersImported: 0,
      vouchersAltered: 0,
      invoiceCount: 0,
      totalValue: 0,
      message: "Client not found",
    };
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, vendor_id, vendor_name, vendor_gstin, amount, cgst, sgst, igst, hsn_code",
    )
    .eq("client_id", clientId)
    .eq("tally_exported", false)
    .order("invoice_date", { ascending: true });

  if (!invoices || invoices.length === 0) {
    return {
      clientId,
      clientName: client.name,
      status: "no_pending",
      vouchersImported: 0,
      vouchersAltered: 0,
      invoiceCount: 0,
      totalValue: 0,
      message: "No pending invoices",
    };
  }

  const { data: mappings } = await supabase
    .from("tally_vendor_mappings")
    .select("vendor_id, tally_ledger_id, tally_ledgers(name)")
    .eq("client_id", clientId);

  const vendorLedgerMap: Record<string, string> = {};
  for (const m of mappings || []) {
    const ledger = (m as unknown as { tally_ledgers?: { name: string } }).tally_ledgers;
    const inv = invoices.find((i) => i.vendor_id === m.vendor_id);
    if (inv && ledger) vendorLedgerMap[inv.vendor_name] = ledger.name;
  }

  const tallyConfig: TallyConfig = {
    companyName: config?.tally_company_name || client.name,
    purchaseLedger: config?.default_purchase_ledger || "Purchase A/c",
    cgstLedger: config?.default_cgst_ledger || "Input CGST",
    sgstLedger: config?.default_sgst_ledger || "Input SGST",
    igstLedger: config?.default_igst_ledger || "Input IGST",
    vendorLedgerMap,
  };

  const tallyInvoices: TallyInvoice[] = invoices.map((inv) => ({
    invoice_number: inv.invoice_number,
    invoice_date:
      inv.invoice_date || new Date().toISOString().slice(0, 10),
    vendor_name: inv.vendor_name,
    vendor_gstin: inv.vendor_gstin,
    amount: Number(inv.amount) || 0,
    cgst: Number(inv.cgst) || 0,
    sgst: Number(inv.sgst) || 0,
    igst: Number(inv.igst) || 0,
    hsn_code: inv.hsn_code,
  }));

  const xmlResult = generateTallyVoucherXml(tallyInvoices, tallyConfig);

  let tallyResponse;
  try {
    tallyResponse = await postXmlToTally({ xml: xmlResult.xml });
  } catch (e) {
    if (e instanceof TallyError) {
      return {
        clientId,
        clientName: client.name,
        status:
          e.errorType === "connection_refused" ? "tally_offline" : "unknown_error",
        vouchersImported: 0,
        vouchersAltered: 0,
        invoiceCount: tallyInvoices.length,
        totalValue: 0,
        message: e.message,
        errorDetails: e.message,
        requiresSetup: e.errorType === "connection_refused",
      };
    }
    return {
      clientId,
      clientName: client.name,
      status: "unknown_error",
      vouchersImported: 0,
      vouchersAltered: 0,
      invoiceCount: tallyInvoices.length,
      totalValue: 0,
      message: e instanceof Error ? e.message : "Unknown error",
    };
  }

  if (!tallyResponse.success) {
    return {
      clientId,
      clientName: client.name,
      status: "tally_rejected",
      vouchersImported: 0,
      vouchersAltered: 0,
      invoiceCount: tallyInvoices.length,
      totalValue: 0,
      message:
        tallyResponse.errors.join("; ") ||
        "Tally rejected the import — likely a missing ledger or wrong company",
      tallyErrors: tallyResponse.errors,
      errorDetails: tallyResponse.rawResponse.slice(0, 500),
    };
  }

  const totalValue = tallyInvoices.reduce(
    (s, i) => s + i.amount + i.cgst + i.sgst + i.igst,
    0,
  );

  const filename = `direct_import_${client.name.replace(/\s+/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.xml`;

  const { data: batch } = await supabase
    .from("tally_export_batches")
    .insert({
      firm_id: firmId,
      client_id: clientId,
      user_id: userId,
      invoice_count: tallyInvoices.length,
      total_value: totalValue,
      filename,
      status: "imported_confirmed",
      notes: `Direct import: ${tallyResponse.created} vouchers created`,
      imported_confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();

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

  return {
    clientId,
    clientName: client.name,
    status: "imported",
    vouchersImported: tallyResponse.created,
    vouchersAltered: tallyResponse.altered,
    invoiceCount: tallyInvoices.length,
    totalValue,
    message: `${tallyResponse.created} voucher${tallyResponse.created === 1 ? "" : "s"} imported`,
  };
}

export const TALLY_SETUP_INSTRUCTIONS = [
  "1. Open Tally Prime on your computer",
  "2. Press F1 (Help) → Settings",
  "3. Click 'Connectivity'",
  "4. Set 'Configure Tally as Server' to Yes",
  "5. Default port 9000 (don't change)",
  "6. Save settings",
  "7. Make sure the client company is OPEN/LOADED in Tally before importing",
];
