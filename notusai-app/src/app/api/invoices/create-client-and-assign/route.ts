/**
 * Auto-create a client from staged invoice metadata, then assign all
 * invoices with that buyer GSTIN to the new client in one shot.
 *
 * Body: { buyerGstin: string; buyerName?: string }
 *
 * Use case: CA sees "12 invoices for GSTIN 27ABC...Z5 — buyer name 'Sharma Textile' —
 * not assigned to any client". One click → creates 'Sharma Textile' client +
 * GSTIN row + assigns all 12 invoices.
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
  const buyerGstin: string = (body.buyerGstin || "").trim().toUpperCase();
  if (!buyerGstin)
    return NextResponse.json(
      { error: "buyerGstin required" },
      { status: 400 },
    );

  // Validate basic GSTIN format
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(buyerGstin)) {
    return NextResponse.json(
      { error: "Invalid GSTIN format" },
      { status: 400 },
    );
  }

  // Check if a client with this GSTIN already exists (shouldn't, but defensive)
  const { data: existingGstin } = await supabase
    .from("gstins")
    .select("client_id, clients(name)")
    .eq("gstin", buyerGstin)
    .maybeSingle();

  let clientId: string;
  let clientName: string;

  if (existingGstin?.client_id) {
    // Already exists — just assign
    clientId = existingGstin.client_id;
    clientName =
      (existingGstin as unknown as { clients?: { name: string } }).clients?.name ||
      "Existing client";
  } else {
    // Pull suggested name from the most recent invoice with this GSTIN
    const { data: sampleInvoice } = await supabase
      .from("invoices")
      .select("buyer_name")
      .eq("firm_id", profile.firm_id)
      .eq("buyer_gstin", buyerGstin)
      .is("client_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const suggestedName =
      (body.buyerName as string | undefined)?.trim() ||
      sampleInvoice?.buyer_name ||
      `Client ${buyerGstin.slice(2, 7)}`;
    clientName = suggestedName;

    // Derive state from GSTIN (first 2 digits = state code)
    const stateCode = buyerGstin.slice(0, 2);

    // Create client
    const { data: newClient, error: clientErr } = await supabase
      .from("clients")
      .insert({
        firm_id: profile.firm_id,
        name: suggestedName,
        status: "active",
      })
      .select("id")
      .single();

    if (clientErr || !newClient) {
      return NextResponse.json(
        { error: clientErr?.message || "Failed to create client" },
        { status: 500 },
      );
    }
    clientId = newClient.id;

    // Create GSTIN row
    await supabase.from("gstins").insert({
      firm_id: profile.firm_id,
      client_id: clientId,
      gstin: buyerGstin,
      state: stateCode,
      registration_type: "regular",
    });
  }

  // Assign all unassigned invoices with this buyer GSTIN
  const { data: assigned, error: assignErr } = await supabase
    .from("invoices")
    .update({
      client_id: clientId,
      assigned_at: new Date().toISOString(),
      assigned_by_user_id: user.id,
    })
    .eq("firm_id", profile.firm_id)
    .is("client_id", null)
    .eq("buyer_gstin", buyerGstin)
    .select("id");

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    clientId,
    clientName,
    assignedCount: assigned?.length || 0,
    created: !existingGstin?.client_id,
  });
}
