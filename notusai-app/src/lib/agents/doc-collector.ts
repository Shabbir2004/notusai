/**
 * Document collector agent — chases client for documents before GSTR-3B deadline.
 */

import { generateText } from "@/lib/llm";
import { sendWhatsappText } from "@/lib/integrations/whatsapp";
import { CLIENT_CHASE_AGENT_SYSTEM } from "@/lib/prompts/client-chase-agent";
import { createServiceClient } from "@/lib/supabase/server";

export interface DocChaseInput {
  firmId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientLanguage?: "hi" | "en" | "hi-en" | "mr" | "ta" | "gu" | "te" | "bn" | "kn";
  daysToDeadline: number;
  documentsNeeded: string[];
  filingPeriod: string;
}

export async function chaseClient(input: DocChaseInput) {
  const supabase = createServiceClient();

  const urgency =
    input.daysToDeadline === 0
      ? "URGENT (today)"
      : input.daysToDeadline <= 1
        ? "Very urgent"
        : input.daysToDeadline <= 3
          ? "Urgent"
          : "Polite";

  const userPrompt = `Scenario: DOC_CHASE
Client: ${input.clientName}
Documents needed: ${input.documentsNeeded.join(", ")}
Filing period: ${input.filingPeriod}
Days to deadline: ${input.daysToDeadline}
Urgency: ${urgency}
Preferred language: ${input.clientLanguage || "hi-en"}

Generate a WhatsApp message asking the client to send the documents.`;

  const result = await generateText({
    system: CLIENT_CHASE_AGENT_SYSTEM,
    user: userPrompt,
    maxTokens: 512,
    jsonMode: true,
    temperature: 0.5,
  });

  let parsed: { message: string; needs_escalation: boolean };
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { message: result.text, needs_escalation: false };
  } catch {
    parsed = { message: result.text, needs_escalation: false };
  }

  await sendWhatsappText({
    toPhone: input.clientPhone,
    text: parsed.message,
  });

  await supabase.from("agent_runs").insert({
    firm_id: input.firmId,
    type: "doc_collector",
    status: "succeeded",
    steps: [
      {
        at: new Date().toISOString(),
        action: "whatsapp_sent",
        message: parsed.message,
      },
    ],
    result: { sent: true, message: parsed.message },
    completed_at: new Date().toISOString(),
  });
}
