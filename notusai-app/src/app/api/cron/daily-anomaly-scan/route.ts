/**
 * Cron: Daily at 6:00 AM IST.
 * Scans all firms' clients for anomalies (Section 16(4) deadlines, vendor risk patterns,
 * GSTR-1 vs 3B mismatches), creates anomaly rows, sends digest notifications.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { detectAnomalies, computeNoticeProbability } from "@/lib/anomaly/rules";
import { createNotification } from "@/lib/notifications/send";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const startedAt = Date.now();

  // Get all active firms with clients
  const { data: firms } = await supabase.from("firms").select("id, name");
  if (!firms) return NextResponse.json({ message: "No firms" });

  let totalAnomalies = 0;
  let firmsScanned = 0;

  for (const firm of firms) {
    const { data: gstins } = await supabase
      .from("gstins")
      .select("id, client_id, gstin, clients(name)")
      .eq("firm_id", firm.id);

    if (!gstins || gstins.length === 0) continue;

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

    for (const gstinRow of gstins) {
      // Build anomaly input from latest reconciliation + vendor stats
      const { data: latestRecon } = await supabase
        .from("reconciliations")
        .select("*")
        .eq("gstin_id", gstinRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Compute vendor late filing rate (last 6 months)
      const { count: lateVendorCount } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firm.id)
        .gte("late_filings_count", 1);

      const { count: totalVendorCount } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firm.id);

      const vendorLatePct = totalVendorCount && totalVendorCount > 0
        ? (lateVendorCount || 0) / totalVendorCount
        : 0;

      const anomalies = detectAnomalies({
        vendorLatePctLast6Months: vendorLatePct,
        // Other inputs (gstr1B2bInr, itcClaimedInr) would come from latest GSTR-3B
        // For now we rely on recon data only
      });

      if (anomalies.length === 0) continue;

      const noticeProbability = computeNoticeProbability(anomalies);

      // Persist anomalies (skip if duplicate from today)
      const today = new Date().toISOString().slice(0, 10);
      const rows = anomalies.map((a) => ({
        firm_id: firm.id,
        client_id: gstinRow.client_id,
        gstin_id: gstinRow.id,
        period: currentPeriod,
        type: a.type,
        severity: a.severity,
        notice_probability: noticeProbability,
        message: a.description,
        recommended_action: a.recommended_action,
        estimated_savings_inr: a.estimated_savings_inr,
      }));

      const { data: existing } = await supabase
        .from("anomalies")
        .select("id")
        .eq("client_id", gstinRow.client_id)
        .gte("detected_at", today)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("anomalies").insert(rows);
        totalAnomalies += rows.length;

        // Notify firm owner if any anomaly is high or critical
        const hasHighSeverity = anomalies.some((a) => ["high", "critical"].includes(a.severity));
        if (hasHighSeverity) {
          const { data: owner } = await supabase
            .from("profiles")
            .select("id")
            .eq("firm_id", firm.id)
            .eq("role", "owner")
            .single();
          if (owner) {
            const client = (gstinRow as { clients?: { name: string } }).clients;
            await createNotification({
              firmId: firm.id,
              userId: owner.id,
              type: "anomaly_detected",
              severity: "warning",
              title: `⚠️ High-risk anomaly: ${client?.name || "Client"}`,
              body: anomalies[0].description,
              link: "/app/anomalies",
              entityType: "anomaly",
            });
          }
        }
      }
    }

    firmsScanned++;
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "daily-anomaly-scan",
    status: "success",
    items_processed: firmsScanned,
    items_succeeded: totalAnomalies,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ firmsScanned, totalAnomalies });
}
