/**
 * Toggle auto-import per client.
 *
 * Body: { clientId: string; enabled: boolean }
 *
 * When enabled, the Smart Inbox visit handler (or a future scheduled job)
 * auto-confirms imports for that client without manual button click —
 * appropriate for high-trust clients with stable vendor lists.
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
  const enabled: boolean = !!body.enabled;
  if (!clientId)
    return NextResponse.json(
      { error: "clientId required" },
      { status: 400 },
    );

  const { data: client } = await supabase
    .from("clients")
    .select("id, firm_id")
    .eq("id", clientId)
    .single();
  if (!client || client.firm_id !== profile.firm_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("client_tally_config")
    .upsert(
      {
        client_id: clientId,
        firm_id: profile.firm_id,
        auto_export_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, enabled });
}
