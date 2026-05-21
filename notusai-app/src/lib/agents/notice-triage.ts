import { generateText } from "@/lib/llm";
import { NOTICE_CLASSIFIER_SYSTEM } from "@/lib/prompts/notice-classifier";

export interface TriageResult {
  notice_type: string;
  severity: "low" | "medium" | "high" | "critical";
  deadline: string | null;
  demand_amount_inr: number | null;
  primary_issue: string;
  applicable_sections: string[];
  missing_docs: string[];
  reply_complexity: "simple" | "medium" | "complex";
  estimated_hours: number;
  recommended_price_inr: 999 | 1999 | 4999;
  notice_number: string | null;
  issuing_authority: string | null;
  period_in_question: string | null;
}

export async function triageNotice(noticeText: string): Promise<TriageResult> {
  const result = await generateText({
    system: NOTICE_CLASSIFIER_SYSTEM,
    user: `NOTICE TEXT:\n"""\n${noticeText}\n"""\n\nOutput strict JSON only.`,
    maxTokens: 1024,
    jsonMode: true,
    temperature: 0.1,
  });

  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Classifier returned non-JSON: " + result.text.slice(0, 200));
  return JSON.parse(jsonMatch[0]) as TriageResult;
}
