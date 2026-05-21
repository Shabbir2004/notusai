/**
 * Assign one or more unassigned invoices to an existing client.
 *
 * Body: { invoiceIds: string[]; clientId: string }
 * OR:   { buyerGstin: string; clientId: string }  ← assign all invoices with this GSTIN
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Verify the target client belongs to this firm
  const { data: client } = await supabase
    .from("clients")
    .select("id, firm_id, name")
    .eq("id", clientId)
    .single();
  if (!client || client.firm_id !== profile.firm_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let query = supabase
    .from("invoices")
    .update({
      client_id: clientId,
      assigned_at: new Date().toISOString(),
      assigned_by_user_id: user.id,
    })
    .eq("firm_id", profile.firm_id)
    .is("client_id", null);

  if (Array.isArray(body.invoiceIds) && body.invoiceIds.length > 0) {
    query = query.in("id", body.invoiceIds);
  } else if (body.buyerGstin) {
    query = query.eq("buyer_gstin", body.buyerGstin);
  } else {
    return NextResponse.json(
      { error: "Provide either invoiceIds[] or buyerGstin" },
      { status: 400 },
    );
  }

  const { data: updated, error } = await query.select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    assignedCount: updated?.length || 0,
    clientName: client.name,
  });
}
