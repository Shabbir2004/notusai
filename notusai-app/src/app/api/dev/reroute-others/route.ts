/**
 * DEV ONLY — re-process emails that were classified as "other" in the
 * last N hours. Useful after tweaking the keyword filter / classifier.
 *
 * Auth: same as cron (Bearer CRON_SECRET).
 *
 *   curl.exe http://localhost:3000/api/dev/reroute-others \
 *     -H "Authorization: Bearer test123" \
 *     -X POST -d '{"hours":24}'
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  getFullMessage,
  refreshAccessToken,
} from "@/lib/integrations/email/gmail";
import { routeEmail } from "@/lib/email-router/router";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isAuthorizedCron(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  let body: { hours?: number; subjectContains?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const hours = body.hours ?? 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Find "other" emails to retry
  let query = supabase
    .from("gmail_processed_messages")
    .select("id, integration_id, message_id, subject, from_email")
    .eq("classified_as", "other")
    .gte("processed_at", since);

  if (body.subjectContains) {
    query = query.ilike("subject", `%${body.subjectContains}%`);
  }

  const { data: candidates } = await query.limit(50);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      message: "No 'other' emails found in window",
      reprocessed: 0,
    });
  }

  // Load all integration tokens up front
  const integIds = Array.from(new Set(candidates.map((c) => c.integration_id)));
  const { data: integrations } = await supabase
    .from("email_integrations")
    .select("*")
    .in("id", integIds);

  const integMap = new Map(
    (integrations || []).map((i) => [i.id, i]),
  );

  const results: Array<{
    subject: string;
    from: string;
    previousIntent: string;
    newIntent: string;
    matched: boolean;
  }> = [];

  for (const cand of candidates) {
    const integ = integMap.get(cand.integration_id);
    if (!integ) continue;

    // Refresh token if expired
    let accessToken = integ.access_token;
    if (!integ.expires_at || new Date(integ.expires_at) <= new Date()) {
      try {
        const refreshed = await refreshAccessToken(integ.refresh_token);
        accessToken = refreshed.access_token;
        await supabase
          .from("email_integrations")
          .update({
            access_token: accessToken,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq("id", integ.id);
      } catch (e) {
        console.error("Token refresh failed:", e);
        continue;
      }
    }

    let full;
    try {
      full = await getFullMessage({ accessToken, messageId: cand.message_id });
    } catch (e) {
      console.error("Failed to fetch message", cand.message_id, e);
      continue;
    }

    // Delete the existing audit row so router will re-record
    await supabase.from("gmail_processed_messages").delete().eq("id", cand.id);

    const result = await routeEmail({
      firmId: integ.firm_id,
      userId: integ.user_id,
      userEmail: integ.email_address,
      integrationId: integ.id,
      message: full,
      accessToken,
    });

    results.push({
      subject: cand.subject,
      from: cand.from_email,
      previousIntent: "other",
      newIntent: result.intent,
      matched: result.matched,
    });
  }

  const changed = results.filter((r) => r.newIntent !== "other");

  return NextResponse.json({
    reprocessed: results.length,
    changedCount: changed.length,
    changed,
    unchanged: results.filter((r) => r.newIntent === "other").length,
  });
}
