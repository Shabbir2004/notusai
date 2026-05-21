/**
 * Cron: Every 4 hours.
 * Ticks vendor follow-up agents to check if they need escalation:
 *  - Email sent + no reply for 4 days → escalate to WhatsApp
 *  - WhatsApp sent + no reply for 3 days → escalate to voice
 *  - Voice attempted + no resolution after 2 more days → escalate to CA
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { escalateToWhatsapp, escalateToVoice } from "@/lib/agents/vendor-followup";
import { createNotification } from "@/lib/notifications/send";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const startedAt = Date.now();

  // Find running vendor-followup agent_runs
  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*, vendor_followups(vendor_id, vendors(*))")
    .eq("type", "vendor_followup")
    .eq("status", "running");

  let escalated = 0;
  let resolved = 0;

  for (const run of runs || []) {
    const steps = (run.steps as Array<Record<string, unknown>>) || [];
    const lastStep = steps[steps.length - 1];
    if (!lastStep) continue;

    const stepAt = new Date((lastStep.at as string) || run.started_at);
    const hoursSinceLastStep = (Date.now() - stepAt.getTime()) / (1000 * 60 * 60);

    const stage = lastStep.stage as string;

    try {
      // Get vendor + mismatch context for escalation input
      const vendorFollowup = (run as { vendor_followups?: { vendor_id: string; vendors: { name: string; gstin: string | null } } }).vendor_followups;
      if (!vendorFollowup) continue;

      if (stage === "email_sent" && hoursSinceLastStep > 96) {
        // 4+ days, no reply → escalate to WhatsApp
        await escalateToWhatsapp(run.id, {
          firmId: run.firm_id,
          vendorId: vendorFollowup.vendor_id,
          vendorName: vendorFollowup.vendors?.name || "Vendor",
          clientName: "Client",
          invoiceNumber: "—",
          invoiceDate: new Date().toISOString().slice(0, 10),
          amount: 0,
          gstAmount: 0,
          caEmail: "",
          caName: "",
          // Other fields would be loaded from related mismatch
        });
        escalated++;
      } else if (stage === "whatsapp_sent" && hoursSinceLastStep > 72) {
        // 3+ days after WhatsApp, no reply → voice
        await escalateToVoice(run.id, {
          firmId: run.firm_id,
          vendorId: vendorFollowup.vendor_id,
          vendorName: vendorFollowup.vendors?.name || "Vendor",
          clientName: "Client",
          invoiceNumber: "—",
          invoiceDate: new Date().toISOString().slice(0, 10),
          amount: 0,
          gstAmount: 0,
          caEmail: "",
          caName: "",
        });
        escalated++;
      } else if (stage === "voice_attempted" && hoursSinceLastStep > 48) {
        // 2+ days after voice, still unresolved → escalate to CA
        await supabase.from("agent_runs").update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          result: { resolution: "escalated_to_ca", reason: "voice_no_resolution" },
        }).eq("id", run.id);

        const { data: owner } = await supabase
          .from("profiles")
          .select("id")
          .eq("firm_id", run.firm_id)
          .eq("role", "owner")
          .single();
        if (owner) {
          await createNotification({
            firmId: run.firm_id,
            userId: owner.id,
            type: "system",
            severity: "warning",
            title: "Vendor agent escalated to you",
            body: `${vendorFollowup.vendors?.name || "Vendor"} did not respond to email, WhatsApp, and voice. Needs your attention.`,
            link: "/app/vendors",
            entityType: "agent_run",
            entityId: run.id,
          });
        }
        resolved++;
      }
    } catch (e) {
      console.error(`Vendor escalation error for run ${run.id}:`, e);
    }
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "vendor-followup-tick",
    status: "success",
    items_processed: runs?.length || 0,
    items_succeeded: escalated + resolved,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ runs: runs?.length || 0, escalated, resolved });
}
