/**
 * Bulk-approve vendor → ledger mappings.
 * CA reviews proposed matches and clicks "Approve all" or fixes individual ones.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = (await req.json()) as {
    clientId: string;
    mappings: Array<{
      vendorId: string;
      tallyLedgerId: string;
      matchStrategy: string;
      matchConfidence: "high" | "medium" | "low" | "manual";
    }>;
  };

  if (!body.clientId || !body.mappings || body.mappings.length === 0) {
    return NextResponse.json({ error: "clientId and mappings required" }, { status: 400 });
  }

  const rows = body.mappings.map((m) => ({
    firm_id: profile.firm_id,
    client_id: body.clientId,
    vendor_id: m.vendorId,
    tally_ledger_id: m.tallyLedgerId,
    match_confidence: m.matchConfidence,
    match_strategy: m.matchStrategy,
    approved_by_user_id: user.id,
    approved_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("tally_vendor_mappings")
    .upsert(rows, { onConflict: "client_id,vendor_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    mappings_saved: rows.length,
  });
}
