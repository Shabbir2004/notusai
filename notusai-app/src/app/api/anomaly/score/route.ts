import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectAnomalies, computeNoticeProbability } from "@/lib/anomaly/rules";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const body = await req.json() as {
    clientId: string;
    gstinId?: string;
    period: string;
    reconciliationId?: string;
    itcClaimedInr?: number;
    gstr1B2bInr?: number;
    gstr3bB2bInr?: number;
    eInvoiceB2bInr?: number;
  };

  // Load reconciliation if provided
  let recon = undefined;
  if (body.reconciliationId) {
    const { data: r } = await supabase
      .from("reconciliations")
      .select("raw_results")
      .eq("id", body.reconciliationId)
      .single();
    recon = r?.raw_results as ReturnType<typeof detectAnomalies> extends never ? never : undefined;
  }

  const anomalies = detectAnomalies({
    recon,
    itcClaimedInr: body.itcClaimedInr,
    gstr1B2bInr: body.gstr1B2bInr,
    gstr3bB2bInr: body.gstr3bB2bInr,
    eInvoiceB2bInr: body.eInvoiceB2bInr,
  });

  const noticeProbability = computeNoticeProbability(anomalies);

  // Persist
  const rows = anomalies.map((a) => ({
    firm_id: profile.firm_id,
    client_id: body.clientId,
    gstin_id: body.gstinId,
    period: body.period,
    type: a.type,
    severity: a.severity,
    notice_probability: noticeProbability,
    message: a.description,
    recommended_action: a.recommended_action,
    estimated_savings_inr: a.estimated_savings_inr,
  }));

  if (rows.length > 0) {
    await supabase.from("anomalies").insert(rows);
  }

  return NextResponse.json({
    anomalies,
    noticeProbability,
  });
}
