/**
 * Cron: Daily at 10:00 AM IST.
 * For each client, check if filing deadline (typically 20th of month for GSTR-3B) is approaching
 * and trigger WhatsApp document chase if needed.
 *
 * Schedule:
 *   T-7 days: gentle reminder
 *   T-3 days: firmer reminder
 *   T-1 day:  urgent
 *   T-0:      flag to CA partner
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { chaseClient } from "@/lib/agents/doc-collector";

export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const startedAt = Date.now();

  // GSTR-3B filing deadline is typically 20th of next month
  const today = new Date();
  const filingDeadline = new Date(today.getFullYear(), today.getMonth(), 20);
  if (today.getDate() > 20) {
    filingDeadline.setMonth(today.getMonth() + 1);
  }
  const daysToDeadline = Math.ceil(
    (filingDeadline.getTime() - today.getTime()) / 86400000,
  );

  // Only chase if T-7, T-3, T-1, or T-0
  if (![7, 3, 1, 0].includes(daysToDeadline)) {
    return NextResponse.json({ message: `${daysToDeadline} days to deadline — no chase today` });
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, firm_id, name, primary_contact_phone, primary_contact_name")
    .eq("status", "active")
    .not("primary_contact_phone", "is", null);

  let chased = 0;
  for (const c of clients || []) {
    if (!c.primary_contact_phone) continue;

    try {
      await chaseClient({
        firmId: c.firm_id,
        clientId: c.id,
        clientName: c.name,
        clientPhone: c.primary_contact_phone,
        clientLanguage: "hi-en",
        daysToDeadline,
        documentsNeeded: ["Purchase invoices for the month", "Sales register"],
        filingPeriod: today.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      });
      chased++;
    } catch (e) {
      console.error(`Doc chase failed for client ${c.id}:`, e);
    }
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "client-doc-chase",
    status: "success",
    items_processed: clients?.length || 0,
    items_succeeded: chased,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ daysToDeadline, chased });
}
