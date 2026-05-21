/**
 * Cron: every 5 minutes, sync new emails for all active Gmail integrations.
 * Uses the email-router to dispatch each email to the right handler.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  listRecentMessages,
  getFullMessage,
  refreshAccessToken,
} from "@/lib/integrations/email/gmail";
import { routeEmail } from "@/lib/email-router/router";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startedAt = Date.now();

  const { data: integrations } = await supabase
    .from("email_integrations")
    .select("*")
    .eq("status", "active");

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ message: "No active integrations", processed: 0 });
  }

  let totalProcessed = 0;
  const intentCounts: Record<string, number> = {};

  for (const integ of integrations) {
    try {
      // Refresh token if expired
      let accessToken = integ.access_token;
      if (!integ.expires_at || new Date(integ.expires_at) <= new Date()) {
        const refreshed = await refreshAccessToken(integ.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabase
          .from("email_integrations")
          .update({ access_token: accessToken, expires_at: newExpiry })
          .eq("id", integ.id);
      }

      // Broader query — let the router decide what's actionable
      const messages = await listRecentMessages({
        accessToken,
        query: "newer_than:7d",
        maxResults: 30,
      });

      for (const summary of messages) {
        const { data: existing } = await supabase
          .from("gmail_processed_messages")
          .select("id")
          .eq("integration_id", integ.id)
          .eq("message_id", summary.id)
          .maybeSingle();

        if (existing) continue;

        const full = await getFullMessage({ accessToken, messageId: summary.id });

        const result = await routeEmail({
          firmId: integ.firm_id,
          userId: integ.user_id,
          userEmail: integ.email_address,
          integrationId: integ.id,
          message: full,
          accessToken,
        });

        totalProcessed++;
        intentCounts[result.intent] = (intentCounts[result.intent] || 0) + 1;
      }

      await supabase
        .from("email_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integ.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("email_integrations")
        .update({ status: "error", error_message: msg })
        .eq("id", integ.id);
      console.error(`gmail-sync error for integ ${integ.id}:`, msg);
    }
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "gmail-sync",
    status: "success",
    items_processed: totalProcessed,
    duration_ms: Date.now() - startedAt,
    result_summary: intentCounts,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({
    integrations: integrations.length,
    processed: totalProcessed,
    by_intent: intentCounts,
  });
}
