/**
 * Direct import to Tally — POST voucher XML to local Tally HTTP server.
 *
 * Replaces the manual "download XML then import" flow with one click.
 *
 * Requires Tally Prime running locally with HTTP server enabled
 * (F1 → Settings → Connectivity → Configure as Server, port 9000).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  importClientToTally,
  TALLY_SETUP_INSTRUCTIONS,
} from "@/lib/integrations/tally-bulk-import";

export const maxDuration = 60;

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

  const body = await req.json();
  const clientId: string = body.clientId;
  if (!clientId)
    return NextResponse.json(
      { error: "clientId required" },
      { status: 400 },
    );

  const result = await importClientToTally({
    supabase,
    firmId: profile.firm_id,
    userId: user.id,
    clientId,
  });

  if (result.status === "no_pending") {
    return NextResponse.json(
      { error: "No pending invoices to import" },
      { status: 400 },
    );
  }

  if (result.status === "tally_offline") {
    return NextResponse.json(
      {
        error: result.message,
        errorType: "connection_refused",
        requiresSetup: true,
        setupInstructions: TALLY_SETUP_INSTRUCTIONS,
      },
      { status: 502 },
    );
  }

  if (result.status === "tally_rejected") {
    return NextResponse.json(
      {
        error: result.message,
        tallyErrors: result.tallyErrors,
        rawResponseSnippet: result.errorDetails,
      },
      { status: 400 },
    );
  }

  if (result.status === "unknown_error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    vouchersImported: result.vouchersImported,
    vouchersAltered: result.vouchersAltered,
    invoiceCount: result.invoiceCount,
    totalValue: result.totalValue,
    message: `✓ ${result.vouchersImported} voucher${result.vouchersImported === 1 ? "" : "s"} imported into Tally`,
  });
}
