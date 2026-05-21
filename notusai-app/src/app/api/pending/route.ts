/**
 * Aggregator: returns ALL agent activity awaiting CA's approval.
 *
 * Powers the /app/pending dashboard and the Smart Inbox agent activity card.
 *
 * Returns:
 *   - pendingInvoiceBatches: grouped by client (invoices auto-detected from
 *     email + waiting to be pushed to Tally)
 *   - draftNotices: notice drafts ready for CA review
 *   - openHighAnomalies: anomalies needing CA attention
 *   - autoResolvedVendorCount: recent autonomous vendor reactor wins
 *   - totalPendingItems: rollup count for sidebar badge
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export interface PendingInvoiceBatch {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  totalValue: number;
  uniqueVendorCount: number;
  unmappedVendorCount: number;
  ledgersSynced: boolean;
  autoImportEnabled: boolean;
  tallyCompanyName: string | null;
  oldestInvoiceDate: string | null;
  readyToImport: boolean;
}

export interface PendingNotice {
  id: string;
  clientId: string;
  clientName: string;
  noticeType: string;
  deadline: string | null;
  demandAmount: number | null;
  draftedAt: string | null;
}

export interface PendingAnomaly {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  severity: string;
  message: string;
  noticeProbability: number | null;
  detectedAt: string | null;
}

export interface UnassignedInvoiceGroup {
  buyerGstin: string | null;
  buyerName: string | null;
  invoiceCount: number;
  totalValue: number;
  vendorNames: string[];
  oldestInvoiceDate: string | null;
  sourceEmails: string[];
  invoiceIds: string[];
}

export interface PendingResponse {
  pendingInvoiceBatches: PendingInvoiceBatch[];
  unassignedInvoiceGroups: UnassignedInvoiceGroup[];
  unassignedInvoiceCount: number;
  draftNotices: PendingNotice[];
  openHighAnomalies: PendingAnomaly[];
  autoResolvedVendorCount: number;
  totalPendingItems: number;
  totals: {
    invoicesPending: number;
    invoiceValueTotal: number;
    clientsWithPending: number;
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", user.id)
    .single();
  if (!profile?.firm_id)
    return NextResponse.json({ error: "No firm" }, { status: 400 });

  // 1. Pending invoices — fetch ALL (assigned + unassigned)
  const { data: pendingInvoices } = await supabase
    .from("invoices")
    .select(
      "id, client_id, vendor_id, vendor_name, amount, cgst, sgst, igst, invoice_date, buyer_gstin, buyer_name, source_email_from, source_email_subject, clients(name)",
    )
    .eq("firm_id", profile.firm_id)
    .eq("tally_exported", false);

  const byClient = new Map<
    string,
    {
      clientName: string;
      invoices: Array<{ vendor_id: string | null; vendor_name: string; total: number; date: string | null }>;
      uniqueVendors: Set<string>;
      uniqueVendorIds: Set<string>;
    }
  >();

  // Group unassigned by buyer GSTIN (fallback bucket for those with no GSTIN)
  const NO_GSTIN_KEY = "__no_gstin__";
  const unassignedByBuyer = new Map<
    string,
    {
      buyerGstin: string | null;
      buyerName: string | null;
      invoices: Array<{
        id: string;
        vendor_name: string;
        total: number;
        date: string | null;
        source_email: string | null;
      }>;
      vendorNames: Set<string>;
      sourceEmails: Set<string>;
    }
  >();

  for (const inv of pendingInvoices || []) {
    const total =
      (Number(inv.amount) || 0) +
      (Number(inv.cgst) || 0) +
      (Number(inv.sgst) || 0) +
      (Number(inv.igst) || 0);

    if (inv.client_id) {
      // Assigned — group by client
      const clientName =
        (inv as unknown as { clients?: { name: string } }).clients?.name ||
        "Unknown";
      let bucket = byClient.get(inv.client_id);
      if (!bucket) {
        bucket = {
          clientName,
          invoices: [],
          uniqueVendors: new Set(),
          uniqueVendorIds: new Set(),
        };
        byClient.set(inv.client_id, bucket);
      }
      bucket.invoices.push({
        vendor_id: inv.vendor_id,
        vendor_name: inv.vendor_name,
        total,
        date: inv.invoice_date,
      });
      bucket.uniqueVendors.add(inv.vendor_name);
      if (inv.vendor_id) bucket.uniqueVendorIds.add(inv.vendor_id);
    } else {
      // Unassigned — group by buyer GSTIN
      const key = inv.buyer_gstin || NO_GSTIN_KEY;
      let bucket = unassignedByBuyer.get(key);
      if (!bucket) {
        bucket = {
          buyerGstin: inv.buyer_gstin || null,
          buyerName: inv.buyer_name || null,
          invoices: [],
          vendorNames: new Set(),
          sourceEmails: new Set(),
        };
        unassignedByBuyer.set(key, bucket);
      }
      bucket.invoices.push({
        id: inv.id,
        vendor_name: inv.vendor_name,
        total,
        date: inv.invoice_date,
        source_email: inv.source_email_from || null,
      });
      bucket.vendorNames.add(inv.vendor_name);
      if (inv.source_email_from) bucket.sourceEmails.add(inv.source_email_from);
      if (!bucket.buyerName && inv.buyer_name) bucket.buyerName = inv.buyer_name;
    }
  }

  // 2. Load per-client tally config + vendor mappings to compute readiness
  const clientIds = Array.from(byClient.keys());
  const [{ data: configs }, { data: allMappings }] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from("client_tally_config")
          .select(
            "client_id, tally_company_name, ledgers_count, ledgers_last_synced_at, auto_export_enabled",
          )
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] as Array<{
          client_id: string;
          tally_company_name: string | null;
          ledgers_count: number | null;
          ledgers_last_synced_at: string | null;
          auto_export_enabled: boolean | null;
        }> }),
    clientIds.length > 0
      ? supabase
          .from("tally_vendor_mappings")
          .select("client_id, vendor_id")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] as Array<{ client_id: string; vendor_id: string }> }),
  ]);

  const configByClient = new Map<string, {
    tally_company_name: string | null;
    ledgers_count: number | null;
    auto_export_enabled: boolean | null;
  }>();
  for (const c of configs || []) configByClient.set(c.client_id, c);

  const mappedVendorsByClient = new Map<string, Set<string>>();
  for (const m of allMappings || []) {
    let set = mappedVendorsByClient.get(m.client_id);
    if (!set) {
      set = new Set();
      mappedVendorsByClient.set(m.client_id, set);
    }
    set.add(m.vendor_id);
  }

  const pendingInvoiceBatches: PendingInvoiceBatch[] = [];
  let invoiceValueTotal = 0;
  let invoicesPendingTotal = 0;

  for (const [clientId, bucket] of byClient.entries()) {
    const totalValue = bucket.invoices.reduce((s, i) => s + i.total, 0);
    invoiceValueTotal += totalValue;
    invoicesPendingTotal += bucket.invoices.length;

    const oldest = bucket.invoices
      .map((i) => i.date)
      .filter((d): d is string => !!d)
      .sort()[0] || null;

    const config = configByClient.get(clientId);
    const ledgersSynced = (config?.ledgers_count ?? 0) > 0;
    const mappedVendors = mappedVendorsByClient.get(clientId) || new Set();
    const unmappedVendorCount = Array.from(bucket.uniqueVendorIds).filter(
      (v) => !mappedVendors.has(v),
    ).length;

    pendingInvoiceBatches.push({
      clientId,
      clientName: bucket.clientName,
      invoiceCount: bucket.invoices.length,
      totalValue,
      uniqueVendorCount: bucket.uniqueVendors.size,
      unmappedVendorCount,
      ledgersSynced,
      autoImportEnabled: !!config?.auto_export_enabled,
      tallyCompanyName: config?.tally_company_name || null,
      oldestInvoiceDate: oldest,
      readyToImport: ledgersSynced,
    });
  }

  // Sort: most invoices first
  pendingInvoiceBatches.sort((a, b) => b.invoiceCount - a.invoiceCount);

  // Build unassigned groups
  const unassignedInvoiceGroups: UnassignedInvoiceGroup[] = [];
  let unassignedInvoiceCount = 0;
  for (const bucket of unassignedByBuyer.values()) {
    const totalValue = bucket.invoices.reduce((s, i) => s + i.total, 0);
    const oldest = bucket.invoices
      .map((i) => i.date)
      .filter((d): d is string => !!d)
      .sort()[0] || null;
    unassignedInvoiceCount += bucket.invoices.length;
    invoiceValueTotal += totalValue;
    invoicesPendingTotal += bucket.invoices.length;
    unassignedInvoiceGroups.push({
      buyerGstin: bucket.buyerGstin,
      buyerName: bucket.buyerName,
      invoiceCount: bucket.invoices.length,
      totalValue,
      vendorNames: Array.from(bucket.vendorNames).slice(0, 5),
      oldestInvoiceDate: oldest,
      sourceEmails: Array.from(bucket.sourceEmails).slice(0, 3),
      invoiceIds: bucket.invoices.map((i) => i.id),
    });
  }
  unassignedInvoiceGroups.sort((a, b) => b.invoiceCount - a.invoiceCount);

  // 3. Draft notices waiting for review
  const { data: drafts } = await supabase
    .from("notices")
    .select(
      "id, client_id, notice_type, deadline, demand_amount, drafted_at, clients(name)",
    )
    .eq("firm_id", profile.firm_id)
    .eq("status", "ready")
    .order("drafted_at", { ascending: false })
    .limit(20);

  const draftNotices: PendingNotice[] = (drafts || []).map((n) => ({
    id: n.id,
    clientId: n.client_id,
    clientName: (n as unknown as { clients?: { name: string } }).clients?.name || "Unknown",
    noticeType: n.notice_type,
    deadline: n.deadline,
    demandAmount: n.demand_amount !== null ? Number(n.demand_amount) : null,
    draftedAt: n.drafted_at,
  }));

  // 4. Open high-severity anomalies
  const { data: anomalies } = await supabase
    .from("anomalies")
    .select(
      "id, client_id, type, severity, message, notice_probability, detected_at, clients(name)",
    )
    .eq("firm_id", profile.firm_id)
    .eq("status", "open")
    .in("severity", ["high", "critical"])
    .order("notice_probability", { ascending: false })
    .limit(15);

  const openHighAnomalies: PendingAnomaly[] = (anomalies || []).map((a) => ({
    id: a.id,
    clientId: a.client_id,
    clientName: (a as unknown as { clients?: { name: string } }).clients?.name || "Unknown",
    type: a.type,
    severity: a.severity,
    message: a.message,
    noticeProbability:
      a.notice_probability !== null ? Number(a.notice_probability) : null,
    detectedAt: a.detected_at,
  }));

  // 5. Recent autonomous vendor reactor wins (informational)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: autoResolvedVendorCount } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", profile.firm_id)
    .eq("type", "vendor_reactor")
    .eq("status", "succeeded")
    .gte("completed_at", since24h);

  const totalPendingItems =
    pendingInvoiceBatches.length +
    unassignedInvoiceGroups.length +
    draftNotices.length +
    openHighAnomalies.length;

  const response: PendingResponse = {
    pendingInvoiceBatches,
    unassignedInvoiceGroups,
    unassignedInvoiceCount,
    draftNotices,
    openHighAnomalies,
    autoResolvedVendorCount: autoResolvedVendorCount || 0,
    totalPendingItems,
    totals: {
      invoicesPending: invoicesPendingTotal,
      invoiceValueTotal,
      clientsWithPending: pendingInvoiceBatches.length,
    },
  };

  return NextResponse.json(response);
}
