/**
 * Vendor follow-up agent — autonomous escalation: email → WhatsApp → voice.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText } from "@/lib/integrations/whatsapp";
import { placeOutboundCall } from "@/lib/integrations/voice";
import { Resend } from "resend";
import { generateText } from "@/lib/llm";
import { VENDOR_EMAIL_WRITER_SYSTEM } from "@/lib/prompts/vendor-email-writer";

export type FollowupStage =
  | "init"
  | "email_sent"
  | "email_no_reply"
  | "whatsapp_sent"
  | "whatsapp_no_reply"
  | "voice_attempted"
  | "resolved"
  | "escalated";

export interface FollowupInput {
  firmId: string;
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorLanguage?: "hi" | "en" | "mr" | "ta" | "gu";
  clientName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  gstAmount: number;
  mismatchId?: string;
  caEmail: string;
  caName: string;
}

export async function startVendorFollowup(input: FollowupInput): Promise<string> {
  const supabase = createServiceClient();

  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      firm_id: input.firmId,
      type: "vendor_followup",
      status: "running",
      related_id: input.mismatchId,
      steps: [{ stage: "init", at: new Date().toISOString() }],
    })
    .select()
    .single();

  if (runErr || !run) throw new Error("Could not create agent run: " + runErr?.message);

  if (input.vendorEmail) {
    const emailContent = await draftVendorEmail({ stage: "first", input });

    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || `NotusAI <onboarding@resend.dev>`,
      to: input.vendorEmail,
      replyTo: input.caEmail,
      subject: emailContent.subject,
      text: emailContent.body,
    });

    await appendStep(run.id, {
      stage: "email_sent",
      channel: "email",
      at: new Date().toISOString(),
      to: input.vendorEmail,
      subject: emailContent.subject,
    });

    await supabase.from("vendor_followups").insert({
      firm_id: input.firmId,
      agent_run_id: run.id,
      vendor_id: input.vendorId,
      client_id: null,
      mismatch_id: input.mismatchId,
      channel: "email",
      status: "sent",
      attempts: 1,
      last_message: emailContent.body,
    });
  }

  return run.id;
}

export async function escalateToWhatsapp(runId: string, input: FollowupInput) {
  if (!input.vendorPhone) return await escalateToCA(runId, "no_phone");

  const whatsappContent = await draftVendorEmail({ stage: "whatsapp", input });
  await sendWhatsappText({ toPhone: input.vendorPhone, text: whatsappContent.body });

  await appendStep(runId, {
    stage: "whatsapp_sent",
    channel: "whatsapp",
    at: new Date().toISOString(),
    to: input.vendorPhone,
  });
}

export async function escalateToVoice(runId: string, input: FollowupInput) {
  if (!input.vendorPhone) return await escalateToCA(runId, "no_phone");

  const script = await draftVendorEmail({ stage: "voice", input });
  const callResult = await placeOutboundCall({
    toPhone: input.vendorPhone,
    script: script.body,
    language: input.vendorLanguage || "hi",
    recordCall: true,
  });

  await appendStep(runId, {
    stage: "voice_attempted",
    channel: "voice",
    at: new Date().toISOString(),
    to: input.vendorPhone,
    callSid: callResult.callSid,
    transcript: callResult.transcript,
  });
}

async function escalateToCA(runId: string, reason: string) {
  const supabase = createServiceClient();
  await appendStep(runId, {
    stage: "escalated",
    at: new Date().toISOString(),
    reason,
  });
  await supabase
    .from("agent_runs")
    .update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      result: { resolution: "escalated_to_ca", reason },
    })
    .eq("id", runId);
}

async function appendStep(runId: string, step: Record<string, unknown>) {
  const supabase = createServiceClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("steps")
    .eq("id", runId)
    .single();
  const existingSteps = (run?.steps as unknown[]) || [];
  await supabase
    .from("agent_runs")
    .update({ steps: [...existingSteps, step] })
    .eq("id", runId);
}

async function draftVendorEmail(opts: {
  stage: "first" | "followup" | "whatsapp" | "voice";
  input: FollowupInput;
}): Promise<{ subject: string; body: string; language: string }> {
  const stageDescription = {
    first: "First email to vendor — polite, professional, asking them to verify their GSTR-1 filing.",
    followup: "Follow-up email 4 days later — still polite but firmer, mention the deadline.",
    whatsapp: "WhatsApp message — same content but conversational tone, in Hindi-English mix.",
    voice: "Voice call script — to be spoken aloud, brief (< 30 seconds), include the ask clearly.",
  }[opts.stage];

  const userPrompt = `${stageDescription}

Context:
- CA firm: ${opts.input.caName}
- End client: ${opts.input.clientName}
- Vendor: ${opts.input.vendorName}
- Invoice number: ${opts.input.invoiceNumber}
- Invoice date: ${opts.input.invoiceDate}
- Amount: ₹${opts.input.amount.toLocaleString("en-IN")}
- GST: ₹${opts.input.gstAmount.toLocaleString("en-IN")}
- Issue: Invoice not appearing in client's GSTR-2B; vendor likely filed GSTR-1 late or missed this invoice.

Ask: Vendor should file/amend their GSTR-1 to include this invoice. Provide deadline (7 days).`;

  const result = await generateText({
    system: VENDOR_EMAIL_WRITER_SYSTEM,
    user: userPrompt,
    maxTokens: 1024,
    jsonMode: true,
    temperature: 0.4,
  });

  try {
    const cleaned = result.text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      subject: parsed.subject || `GSTR-1 filing issue — invoice ${opts.input.invoiceNumber}`,
      body: parsed.body || parsed.script || result.text,
      language: parsed.language || "english",
    };
  } catch {
    return {
      subject: `GSTR-1 filing issue — invoice ${opts.input.invoiceNumber}`,
      body: result.text,
      language: "english",
    };
  }
}
