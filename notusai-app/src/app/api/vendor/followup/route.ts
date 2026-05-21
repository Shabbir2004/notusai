import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startVendorFollowup } from "@/lib/agents/vendor-followup";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id, email")
    .eq("id", user.id)
    .single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const body = await req.json() as {
    mismatchId: string;
    vendorEmail?: string;
    vendorPhone?: string;
    vendorLanguage?: "hi" | "en" | "mr" | "ta" | "gu";
  };

  // Look up the mismatch
  const { data: mismatch } = await supabase
    .from("mismatches")
    .select("*, vendors(*)")
    .eq("id", body.mismatchId)
    .single();

  if (!mismatch) return NextResponse.json({ error: "Mismatch not found" }, { status: 404 });

  const vendor = (mismatch as { vendors?: { id: string; name: string; gstin: string | null } }).vendors;
  if (!vendor) return NextResponse.json({ error: "Vendor not linked to mismatch" }, { status: 400 });

  const { data: firm } = await supabase.from("firms").select("name").eq("id", profile.firm_id).single();

  const runId = await startVendorFollowup({
    firmId: profile.firm_id,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorEmail: body.vendorEmail,
    vendorPhone: body.vendorPhone,
    vendorLanguage: body.vendorLanguage,
    clientName: mismatch.vendor_name || "Client", // resolved from mismatch
    invoiceNumber: mismatch.invoice_number || "—",
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: Number(mismatch.amount),
    gstAmount: Number(mismatch.amount) * 0.18,
    mismatchId: mismatch.id,
    caEmail: profile.email || user.email!,
    caName: firm?.name || "Your CA",
  });

  await supabase.from("mismatches").update({ status: "in_followup" }).eq("id", mismatch.id);

  return NextResponse.json({ agentRunId: runId, status: "started" });
}
