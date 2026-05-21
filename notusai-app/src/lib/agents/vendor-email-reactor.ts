/**
 * Vendor email reactor — handles vendor replies that arrive via email
 * (not WhatsApp). Parallel to whatsapp-reactor.
 *
 * When a vendor replies to a follow-up email saying "yes I filed",
 * this auto-classifies and resolves the mismatch.
 */

import { generateText } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/send";
import type { GmailFullMessage } from "@/lib/integrations/email/gmail";
import type { EmailClassification } from "@/lib/email-router/classifier";
import type { MatchResult } from "@/lib/email-router/entity-matcher";

interface ClassifyResult {
  classification: "confirmation" | "denial" | "question" | "acknowledgment" | "unrelated";
  confidence: number;
  reasoning: string;
}

export async function reactToVendorEmail(opts: {
  firmId: string;
  message: GmailFullMessage;
  classification: EmailClassification;
  vendorMatch: MatchResult;
}): Promise<{ handled: boolean; reason?: string }> {
  const supabase = createServiceClient();

  if (!opts.vendorMatch.vendorId || !opts.vendorMatch.vendorFollowupId) {
    // Couldn't match — let it sit in inbox review
    return { handled: false, reason: "vendor or followup not matched" };
  }

  // Classify the response intent (separately from email-level classification)
  const llmResult = await generateText({
    system: `Classify a vendor's email reply to a GSTR-1 filing request. JSON only:
{
  "classification": "confirmation" | "denial" | "question" | "acknowledgment" | "unrelated",
  "confidence": 0.0-1.0,
  "reasoning": "1 sentence"
}

confirmation: vendor confirms filed/amended ("yes filed", "done", "amended already")
denial: vendor disputes invoice or refuses
question: vendor asks for clarification
acknowledgment: vendor says will do later
unrelated: not about the filing request`,
    user: opts.message.body.slice(0, 2000),
    maxTokens: 256,
    jsonMode: true,
    temperature: 0.1,
  });

  let result: ClassifyResult;
  try {
    const jsonMatch = llmResult.text.match(/\{[\s\S]*\}/);
    result = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { classification: "unrelated", confidence: 0, reasoning: "Parse error" };
  } catch {
    result = { classification: "unrelated", confidence: 0, reasoning: "Parse error" };
  }

  // Get the followup
  const { data: followup } = await supabase
    .from("vendor_followups")
    .select("*, vendors(name)")
    .eq("id", opts.vendorMatch.vendorFollowupId)
    .single();

  if (!followup) return { handled: false, reason: "Followup not found" };

  // Handle resolution
  if (result.classification === "confirmation" && result.confidence >= 0.7) {
    await supabase
      .from("vendor_followups")
      .update({
        status: "resolved",
        resolution: result.reasoning,
        responded_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", followup.id);

    if (followup.mismatch_id) {
      await supabase
        .from("mismatches")
        .update({ status: "resolved", resolution_path: "vendor_amended" })
        .eq("id", followup.mismatch_id);
    }

    if (followup.agent_run_id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          result: { resolution: "vendor_confirmed_via_email", message: opts.message.body.slice(0, 500) },
        })
        .eq("id", followup.agent_run_id);
    }

    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", opts.firmId)
      .eq("role", "owner")
      .single();
    if (owner) {
      const v = (followup as { vendors?: { name: string } }).vendors;
      await createNotification({
        firmId: opts.firmId,
        userId: owner.id,
        type: "vendor_resolved",
        severity: "success",
        title: `✓ ${v?.name || "Vendor"} resolved`,
        body: `Vendor confirmed via email: "${opts.message.body.slice(0, 100)}"`,
        link: "/app/vendors",
        entityType: "vendor_followup",
        entityId: followup.id,
      });
    }

    return { handled: true };
  }

  if (["denial", "question"].includes(result.classification)) {
    await supabase
      .from("vendor_followups")
      .update({
        status: "escalated",
        resolution: result.reasoning,
        responded_at: new Date().toISOString(),
      })
      .eq("id", followup.id);

    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", opts.firmId)
      .eq("role", "owner")
      .single();
    if (owner) {
      const v = (followup as { vendors?: { name: string } }).vendors;
      await createNotification({
        firmId: opts.firmId,
        userId: owner.id,
        type: "system",
        severity: "warning",
        title: `Vendor needs attention: ${v?.name || "Vendor"}`,
        body: `Reply classified as ${result.classification}. Message: "${opts.message.body.slice(0, 150)}"`,
        link: "/app/vendors",
        entityType: "vendor_followup",
        entityId: followup.id,
      });
    }

    return { handled: true };
  }

  // Acknowledgment or unrelated — just record
  return { handled: true, reason: result.classification };
}
