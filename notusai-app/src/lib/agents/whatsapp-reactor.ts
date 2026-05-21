/**
 * WhatsApp inbound reactor.
 * Classifies vendor replies and auto-resolves mismatches.
 */

import { generateText } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/send";

interface ClassifyResult {
  classification: "confirmation" | "denial" | "question" | "acknowledgment" | "unrelated";
  confidence: number;
  reasoning: string;
}

async function classifyMessage(message: string, context: string): Promise<ClassifyResult> {
  const result = await generateText({
    system: `You classify WhatsApp messages from vendors in response to GST reconciliation follow-ups. Output strict JSON:
{
  "classification": "confirmation" | "denial" | "question" | "acknowledgment" | "unrelated",
  "confidence": 0.0-1.0,
  "reasoning": "1 sentence why"
}

Classifications:
- confirmation: vendor confirms they filed/amended (e.g., "haan kar diya", "filed", "done", "ho gaya")
- denial: vendor denies the invoice or pushes back (e.g., "humne nahi bheja", "wrong amount")
- question: vendor asks for clarification
- acknowledgment: vendor says they'll do it but not done yet
- unrelated: not related to GST or this follow-up`,
    user: `Context (what we asked):\n"""\n${context}\n"""\n\nVendor reply:\n"""\n${message}\n"""\n\nClassify this reply.`,
    maxTokens: 256,
    jsonMode: true,
    temperature: 0.1,
  });

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    return jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { classification: "unrelated", confidence: 0, reasoning: "Could not parse" };
  } catch {
    return { classification: "unrelated", confidence: 0, reasoning: "Parse error" };
  }
}

export async function reactToInboundWhatsapp(opts: {
  fromPhone: string;
  body: string;
  messageId: string;
}): Promise<{ handled: boolean; classification?: string }> {
  const supabase = createServiceClient();

  const { data: activeFollowups } = await supabase
    .from("vendor_followups")
    .select("*, vendors(*), agent_runs(*)")
    .in("status", ["pending", "sent", "delivered"])
    .order("created_at", { ascending: false })
    .limit(10);

  const matchingFollowup = (activeFollowups || []).find((f) => {
    const vendor = (f as { vendors?: { phone?: string } }).vendors;
    return vendor?.phone && normalizePhone(vendor.phone) === normalizePhone(opts.fromPhone);
  });

  await supabase.from("whatsapp_messages").insert({
    firm_id: matchingFollowup?.firm_id || null,
    direction: "inbound",
    from_phone: opts.fromPhone,
    body: opts.body,
    message_id: opts.messageId,
    related_followup_id: matchingFollowup?.id || null,
    processed: false,
  });

  if (!matchingFollowup) {
    return { handled: false };
  }

  const context = matchingFollowup.last_message || "Asked vendor to verify GSTR-1 filing";
  const result = await classifyMessage(opts.body, context);

  await supabase
    .from("whatsapp_messages")
    .update({ ai_classification: result.classification, processed: true })
    .eq("message_id", opts.messageId);

  if (result.classification === "confirmation" && result.confidence >= 0.7) {
    await supabase
      .from("vendor_followups")
      .update({
        status: "resolved",
        resolution: result.reasoning,
        responded_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", matchingFollowup.id);

    if (matchingFollowup.mismatch_id) {
      await supabase
        .from("mismatches")
        .update({ status: "resolved", resolution_path: "vendor_amended" })
        .eq("id", matchingFollowup.mismatch_id);
    }

    if (matchingFollowup.agent_run_id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          result: { resolution: "vendor_confirmed_via_whatsapp", message: opts.body },
        })
        .eq("id", matchingFollowup.agent_run_id);
    }

    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", matchingFollowup.firm_id)
      .eq("role", "owner")
      .single();
    if (owner) {
      const vendor = (matchingFollowup as { vendors?: { name: string } }).vendors;
      await createNotification({
        firmId: matchingFollowup.firm_id,
        userId: owner.id,
        type: "vendor_resolved",
        severity: "success",
        title: `✓ ${vendor?.name || "Vendor"} resolved`,
        body: `Vendor confirmed on WhatsApp: "${opts.body.slice(0, 100)}"`,
        link: "/app/vendors",
        entityType: "vendor_followup",
        entityId: matchingFollowup.id,
      });
    }

    return { handled: true, classification: "confirmation" };
  }

  if (result.classification === "denial" || result.classification === "question") {
    await supabase
      .from("vendor_followups")
      .update({
        status: "escalated",
        resolution: result.reasoning,
        responded_at: new Date().toISOString(),
      })
      .eq("id", matchingFollowup.id);

    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("firm_id", matchingFollowup.firm_id)
      .eq("role", "owner")
      .single();
    if (owner) {
      const vendor = (matchingFollowup as { vendors?: { name: string } }).vendors;
      await createNotification({
        firmId: matchingFollowup.firm_id,
        userId: owner.id,
        type: "system",
        severity: "warning",
        title: `Vendor needs your attention: ${vendor?.name || "Vendor"}`,
        body: `Reply was classified as ${result.classification}. Message: "${opts.body.slice(0, 150)}"`,
        link: "/app/vendors",
        entityType: "vendor_followup",
        entityId: matchingFollowup.id,
      });
    }

    return { handled: true, classification: result.classification };
  }

  return { handled: true, classification: result.classification };
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d]/g, "").replace(/^91/, "");
}
