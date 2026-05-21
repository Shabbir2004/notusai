/**
 * Bulk import: push ALL clients' pending invoices into Tally in one call.
 *
 * Body (optional):
 *   { clientIds: string[] }  — limit to specific clients
 *
 * Returns aggregate result + per-client breakdown.
 *
 * Tally constraint: each client's company must be loaded in Tally first.
 * If a client's company isn't loaded, that client's batch fails with
 * "tally_rejected" — other clients still get imported.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  importClientToTally,
  TALLY_SETUP_INSTRUCTIONS,
  type ClientImportResult,
} from "@/lib/integrations/tally-bulk-import";

export const maxDuration = 300;

export async function POST(req: Request) {
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

  let body: { clientIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — means "all clients"
  }

  // Find clients that have pending invoices
  let clientIds = body.clientIds || [];

  if (clientIds.length === 0) {
    const { data: pendingClients } = await supabase
      .from("invoices")
      .select("client_id")
      .eq("tally_exported", false);

    clientIds = Array.from(
      new Set((pendingClients || []).map((p) => p.client_id).filter(Boolean)),
    ) as string[];
  }

  if (clientIds.length === 0) {
    return NextResponse.json({
      success: true,
      totalClients: 0,
      imported: 0,
      failed: 0,
      results: [],
      message: "No pending invoices across any client",
    });
  }

  const results: ClientImportResult[] = [];
  let imported = 0;
  let failed = 0;
  let tallyOfflineCount = 0;
  let totalVouchers = 0;
  let totalValue = 0;

  for (const clientId of clientIds) {
    const r = await importClientToTally({
      supabase,
      firmId: profile.firm_id,
      userId: user.id,
      clientId,
    });
    results.push(r);

    if (r.status === "imported") {
      imported++;
      totalVouchers += r.vouchersImported;
      totalValue += r.totalValue;
    } else if (r.status === "no_pending") {
      // not a failure — just skip
    } else {
      failed++;
      if (r.status === "tally_offline") tallyOfflineCount++;
    }

    // If Tally is completely offline, no point trying the rest
    if (r.status === "tally_offline" && results.length === 1) {
      return NextResponse.json(
        {
          success: false,
          error: "Tally HTTP server unreachable. Cannot import any client.",
          requiresSetup: true,
          setupInstructions: TALLY_SETUP_INSTRUCTIONS,
          results: [r],
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    success: failed === 0,
    totalClients: results.length,
    imported,
    failed,
    tallyOfflineCount,
    totalVouchersImported: totalVouchers,
    totalValue,
    results,
    message:
      failed === 0
        ? `${totalVouchers} vouchers imported across ${imported} client${imported === 1 ? "" : "s"}`
        : `${imported} client${imported === 1 ? "" : "s"} imported, ${failed} failed`,
  });
}
