/**
 * Auto-generate hearing brief for litigation cases.
 */

import { generateText } from "@/lib/llm";

export interface HearingBriefInput {
  clientName: string;
  caseTimeline: Array<{ date: string; event: string; demand?: number }>;
  notices: Array<{ type: string; number?: string; date: string; demand?: number }>;
  priorReplies: string[];
  applicableSections: string[];
  forum: "ao" | "comm_appeals" | "tribunal" | "hc" | "sc";
  hearingDate: string;
  totalDemand: number;
  practitionerName: string;
}

export async function generateHearingBrief(input: HearingBriefInput): Promise<string> {
  const system = `You are a senior CA preparing a hearing brief for a junior associate to use tomorrow at a GST adjudication hearing.

Output format (Markdown):

# HEARING BRIEF — [Client Name] vs [Department]
**Date:** [Hearing date and time]
**Forum:** [Forum]
**Practitioner:** [Name]

## Case Timeline
Bullet list of every notice/order with dates.

## Demand History
Current demand: ₹X. Original: ₹Y. Reduction so far: ₹Z.

## Key Arguments to Make
Numbered list. Each argument:
- Heading
- Statutory basis (section/rule)
- 1-2 case-law citations
- 1-sentence ratio/principle

## Documents Packaged
Tab A, B, C — what's in each tab.

## Cited Authorities
Full list of sections, rules, circulars, case laws.

## Predicted Outcome
Likelihood (low/medium/high) of relief, with reasoning.

## Anticipated Department Arguments
What the department officer might say, and the counter.

Tone: tight, professional, no fluff.`;

  const userPrompt = `CLIENT: ${input.clientName}
FORUM: ${input.forum}
HEARING DATE: ${input.hearingDate}
TOTAL DEMAND: ₹${input.totalDemand.toLocaleString("en-IN")}
PRACTITIONER: ${input.practitionerName}

TIMELINE:
${input.caseTimeline.map((e) => `- ${e.date}: ${e.event}${e.demand ? ` (demand: ₹${e.demand.toLocaleString("en-IN")})` : ""}`).join("\n")}

PRIOR NOTICES:
${input.notices.map((n) => `- ${n.type}${n.number ? ` (${n.number})` : ""}, ${n.date}, demand: ₹${(n.demand || 0).toLocaleString("en-IN")}`).join("\n")}

APPLICABLE SECTIONS: ${input.applicableSections.join(", ")}

Generate the hearing brief now.`;

  const result = await generateText({
    system,
    user: userPrompt,
    premium: true,
    maxTokens: 4096,
    temperature: 0.3,
  });

  return result.text;
}
