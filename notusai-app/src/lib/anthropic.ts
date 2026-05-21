/**
 * Notice drafting — uses the LLM abstraction so it works with either
 * Gemini (free) or Anthropic Claude (paid).
 *
 * Filename kept as "anthropic.ts" for backward compatibility with imports.
 */

import { generateText } from "@/lib/llm";
import { NOTICE_DRAFTER_SYSTEM, buildNoticeUserMessage } from "@/lib/prompts/notice-drafter";

export interface DraftInput {
  clientName: string;
  gstin?: string;
  state?: string;
  noticeNumber?: string;
  noticeDate?: string;
  noticeType: string;
  period?: string;
  demandAmount?: string;
  authority?: string;
  noticeText: string;
  keyFacts?: string;
  tone: string;
  premium?: boolean;
}

export interface DraftResult {
  draftMd: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costInr: number;
}

export async function generateNoticeDraft(input: DraftInput): Promise<DraftResult> {
  const userMessage = buildNoticeUserMessage(input);

  const result = await generateText({
    system: NOTICE_DRAFTER_SYSTEM,
    user: userMessage,
    premium: input.premium,
    maxTokens: 4096,
    temperature: 0.4,
  });

  return {
    draftMd: result.text,
    model: result.model,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    costInr: result.costInr,
  };
}
