/**
 * Lightweight client list for dropdowns. Returns only id + name.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("firm_id", profile.firm_id)
    .order("name");

  return NextResponse.json({ clients: clients || [] });
}
