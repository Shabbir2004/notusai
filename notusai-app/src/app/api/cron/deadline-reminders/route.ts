/**
 * Cron: Daily at 9:00 AM IST.
 * Sends reminders for:
 *  - Notices with reply deadlines within 7 days
 *  - Hearings within 24 hours
 *  - Cases needing next action
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createNotification } from "@/lib/notifications/send";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const startedAt = Date.now();

  const today = new Date();
  const in7Days = new Date(today.getTime() + 7 * 86400000);

  // Notices with deadlines in next 7 days
  const { data: urgentNotices } = await supabase
    .from("notices")
    .select("id, firm_id, user_id, notice_type, deadline, demand_amount, clients(name)")
    .gte("deadline", today.toISOString().slice(0, 10))
    .lte("deadline", in7Days.toISOString().slice(0, 10))
    .neq("status", "closed");

  let alertsSent = 0;
  for (const n of urgentNotices || []) {
    if (!n.user_id) continue;
    const client = (n as { clients?: { name: string } }).clients;
    const daysLeft = Math.ceil(
      (new Date(n.deadline).getTime() - today.getTime()) / 86400000,
    );
    await createNotification({
      firmId: n.firm_id,
      userId: n.user_id,
      type: "deadline_alert",
      severity: daysLeft <= 2 ? "critical" : "warning",
      title: `⏰ ${n.notice_type} deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      body: `${client?.name || "Client"} · Demand: ₹${Number(n.demand_amount || 0).toLocaleString("en-IN")}`,
      link: `/app/notices/${n.id}`,
      entityType: "notice",
      entityId: n.id,
    });
    alertsSent++;
  }

  // Hearings in next 24 hours
  const tomorrow = new Date(today.getTime() + 86400000);
  const { data: upcomingHearings } = await supabase
    .from("hearings")
    .select("id, firm_id, scheduled_at, forum, location, case_id, litigation_cases(client_id, clients(name))")
    .gte("scheduled_at", today.toISOString())
    .lte("scheduled_at", tomorrow.toISOString())
    .eq("status", "scheduled");

  for (const h of upcomingHearings || []) {
    const lc = (h as { litigation_cases?: { client_id: string; clients?: { name: string } } }).litigation_cases;
    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", h.firm_id)
      .eq("role", "owner")
      .single();
    if (!owner) continue;
    await createNotification({
      firmId: h.firm_id,
      userId: owner.id,
      type: "hearing_reminder",
      severity: "warning",
      title: `🏛️ Hearing tomorrow: ${lc?.clients?.name || "Client"}`,
      body: `${h.forum} at ${new Date(h.scheduled_at).toLocaleTimeString("en-IN")}. ${h.location || ""}`,
      link: `/app/litigation/${h.case_id}`,
      entityType: "hearing",
      entityId: h.id,
    });
    alertsSent++;
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "deadline-reminders",
    status: "success",
    items_processed: (urgentNotices?.length || 0) + (upcomingHearings?.length || 0),
    items_succeeded: alertsSent,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ alertsSent });
}
