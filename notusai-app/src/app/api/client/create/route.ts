import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Client name required" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  // Insert client
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      firm_id: profile.firm_id,
      name: body.name,
      industry: body.industry || null,
      primary_contact_name: body.primary_contact_name || null,
      primary_contact_phone: body.primary_contact_phone || null,
      primary_contact_email: body.primary_contact_email || null,
      assigned_to: user.id,
    })
    .select()
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: clientErr?.message || "Failed to create" }, { status: 500 });
  }

  // If GSTIN provided, create gstins row
  if (body.gstin) {
    await supabase.from("gstins").insert({
      firm_id: profile.firm_id,
      client_id: client.id,
      gstin: body.gstin,
      state: body.state || "Unknown",
      registration_type: "regular",
    });
  }

  return NextResponse.json({ clientId: client.id });
}
