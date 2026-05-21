/**
 * Cron: Weekly on Mondays at 5:00 AM IST.
 * Scans for Section 16(4) ITC deadlines approaching (claim cutoff = 30th Nov of next FY).
 * Alerts CAs about ITC that will be permanently lost if not claimed.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createNotification } from "@/lib/notifications/send";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const startedAt = Date.now();

  // Section 16(4): claim ITC by 30th November of next FY
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const year = today.getFullYear();

  // If we're in October/November, alert about the FY ending in March
  if (currentMonth < 8 || currentMonth > 10) {
    // Outside critical window
    return NextResponse.json({ message: "Outside Section 16(4) alert window" });
  }

  const deadlineDate = new Date(year, 10, 30); // Nov 30
  const daysToDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);

  if (daysToDeadline > 60 || daysToDeadline < 0) {
    return NextResponse.json({ message: "Not in alert window" });
  }

  // Get all firms
  const { data: firms } = await supabase.from("firms").select("id, name");
  let alerted = 0;

  for (const firm of firms || []) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", firm.id)
      .eq("role", "owner")
      .single();
    if (!owner) continue;

    await createNotification({
      firmId: firm.id,
      userId: owner.id,
      type: "deadline_alert",
      severity: daysToDeadline <= 14 ? "critical" : "warning",
      title: `📅 Section 16(4) deadline in ${daysToDeadline} days`,
      body: `30 Nov deadline for claiming ITC for FY ${year - 1}-${String(year).slice(2)}. Review all clients for pending ITC claims.`,
      link: "/app/anomalies",
      entityType: undefined,
    });
    alerted++;
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "section-16-deadlines",
    status: "success",
    items_processed: firms?.length || 0,
    items_succeeded: alerted,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ alerted, daysToDeadline });
}
