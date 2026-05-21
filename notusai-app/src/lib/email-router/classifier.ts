/**
 * Email classifier — figures out what kind of email this is.
 *
 * Outputs one of:
 *   - notice           : GST notice (ASMT-10, DRC-01, SCN, etc.)
 *   - vendor_reply     : reply from a vendor to a previous follow-up
 *   - invoice          : invoice attached for client's books
 *   - tally_export     : CSV/Excel export from client's Tally
 *   - client_doc       : other client document (bank statement, etc.)
 *   - internal         : email from CA's own team
 *   - portal_alert     : automated email from GST portal
 *   - other            : not actionable
 */

import { generateText } from "@/lib/llm";
import type { GmailFullMessage } from "@/lib/integrations/email/gmail";

export type EmailIntent =
  | "notice"
  | "vendor_reply"
  | "invoice"
  | "tally_export"
  | "client_doc"
  | "internal"
  | "portal_alert"
  | "other";

export interface EmailClassification {
  intent: EmailIntent;
  confidence: number; // 0-1
  reasoning: string;
  extracted: {
    notice_type?: string;
    notice_number?: string;
    gstin?: string;
    client_name?: string;
    vendor_name?: string;
    amount?: number;
    period?: string;
    invoice_count?: number; // for batch invoice attachments
  };
}

/**
 * Permissive pre-filter — drops only OBVIOUSLY junk emails (newsletters,
 * calendar invites, unsubscribe confirmations).
 *
 * Anything that could plausibly be business-relevant goes to the AI classifier.
 *
 * Why permissive: across 100+ CAs, email subjects/bodies are wildly varied
 * ("Invoice", "Bill", "Naya bill", "PI", auto-generated from Zoho/Vyapar,
 * Hindi/Marathi mixed, empty body + PDF only). No keyword list can cover this.
 * Gemini Flash is ~$0.0001/email — cheap enough to run on every plausible email.
 */
export function quickKeywordFilter(message: GmailFullMessage): {
  isLikelyActionable: boolean;
  likelyIntent: EmailIntent | "unknown";
} {
  const fromLower = message.from.toLowerCase();
  const subjectLower = message.subject.toLowerCase();
  const bodySnippet = message.body.slice(0, 2000).toLowerCase();
  const text = subjectLower + " " + bodySnippet;

  // ---- HARD DROPS: obvious non-business email ----
  const junkSenders = [
    "noreply@google", "no-reply@google", "notifications@", "newsletter@",
    "marketing@", "promo@", "deals@", "offers@", "updates@medium",
    "linkedin.com", "twitter.com", "facebookmail.com", "youtube.com",
    "googlegroups.com", "calendar-notification@google.com",
    "github.com", "gitlab.com", "stackoverflow.com", "quora.com",
    "amazon.in", "flipkart.com", "myntra.com", "swiggy.com", "zomato.com",
    "uber.com", "ola.com", "makemytrip.com", "irctc.co.in",
  ];
  if (junkSenders.some((s) => fromLower.includes(s))) {
    // But never drop emails that explicitly mention a notice or have an invoice attachment
    const hasAttachment = message.attachments.length > 0;
    const hasNoticeWords =
      text.includes("gst notice") || text.includes("asmt") || text.includes("drc-");
    if (!hasAttachment && !hasNoticeWords) {
      return { isLikelyActionable: false, likelyIntent: "unknown" };
    }
  }

  const junkSubjectPatterns = [
    "unsubscribe", "weekly digest", "monthly newsletter",
    "your order has shipped", "order confirmation", "delivery confirmation",
    "password reset", "verification code", "verify your email",
    "calendar invite", "meeting invitation", "accepted:", "declined:",
    "out of office", "auto-reply", "automatic reply",
  ];
  if (junkSubjectPatterns.some((p) => subjectLower.includes(p))) {
    return { isLikelyActionable: false, likelyIntent: "unknown" };
  }

  // ---- STRONG SIGNALS: take the keyword route hint to skip AI ----
  // Notice keywords are highly specific — when they match, route directly
  const noticeKeywords = [
    "asmt-10", "asmt 10", "drc-01", "drc 01", "drc-07", "drc 07",
    "section 73", "section 74", "section 61", "show cause", "scrutiny",
    "demand notice", "gst notice", "audit memo", "adjudication",
  ];
  if (noticeKeywords.some((k) => text.includes(k))) {
    return { isLikelyActionable: true, likelyIntent: "notice" };
  }

  const portalKeywords = ["gst.gov.in", "noreply@gst", "automated reminder"];
  if (portalKeywords.some((k) => text.includes(k))) {
    return { isLikelyActionable: true, likelyIntent: "portal_alert" };
  }

  // ---- DEFAULT: pass to AI classifier with "unknown" hint ----
  // Let Gemini Flash decide. It sees subject + body + attachment metadata.
  // This handles all the messy real-world cases (Hindi, abbreviations, empty
  // body + PDF, weird vendor formats, etc.).
  return { isLikelyActionable: true, likelyIntent: "unknown" };
}

/**
 * Regex helpers — used by the classifier for entity extraction confidence.
 */
export const GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;
export const AMOUNT_REGEX = /(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d{1,2})?/i;

/**
 * AI-powered classifier. The smart gatekeeper.
 *
 * Real CA inboxes are messy: subjects like "Invoice", "Bill", "Naya bill",
 * "PI", "Charges for July", auto-generated from Zoho/Vyapar, Hindi/Marathi
 * mixed, empty body + PDF attachment only. Don't expect clean keywords.
 *
 * Use attachment filename + mime type as primary signal when body is sparse.
 */
export async function classifyEmail(message: GmailFullMessage): Promise<EmailClassification> {
  const systemPrompt = `You classify emails received by an Indian Chartered Accountant firm. Output strict JSON only.

Categories:
- "notice": a GST notice — ASMT-10, DRC-01, DRC-07, Section 73/74 SCN, audit memo, scrutiny notice, demand letter. Often from gst.gov.in or department officers.
- "vendor_reply": reply from a vendor confirming GSTR-1 amendment / filing (e.g., "amended", "filed", "ho gaya", "done bhai"). Usually short, often in Hindi/regional.
- "invoice": ANY commercial document attached for CA to book in client's Tally. Includes: tax invoices, bills, receipts, purchase invoices, bill of supply, proforma invoices, debit/credit notes. Real-world subjects vary wildly:
    * Clean: "Tax Invoice INV-2026-001", "Invoice #1234"
    * Vague: "Invoice", "Bill", "PI", "Charges"
    * Hindi/regional: "Naya bill", "Bill bheja hai", "Invoice attach"
    * Auto-generated: "New invoice from Vendor X" (Zoho/Vyapar/Cleartax)
    * Empty subject/body + just a PDF attachment named like "INV_xxx.pdf" or "bill.pdf"
  If there's a PDF attachment AND it could plausibly be a commercial document, classify as invoice. The downstream OCR will verify.
- "tally_export": CSV/Excel/XML export from Tally (purchase register, day book, sales register, etc.). Usually large structured file from a client.
- "client_doc": other client document (bank statement, rental agreement, ID proof, agreement) — not a commercial transaction.
- "internal": email from CA's own team/staff (same firm domain, no business attachment).
- "portal_alert": automated email from GST portal, MCA portal, or tax department system.
- "other": newsletter, marketing, calendar invite, personal email, password reset, anything not business-actionable.

Output JSON:
{
  "intent": "<one of above>",
  "confidence": 0.0-1.0,
  "reasoning": "1 sentence — what specifically signaled this category",
  "extracted": {
    "notice_type": "ASMT-10 | DRC-01 | ... | null",
    "notice_number": "string or null",
    "gstin": "15-char GSTIN (format: 22ABCDE1234F1Z5) if mentioned, else null",
    "client_name": "business name of the assessee/buyer or null",
    "vendor_name": "supplier/vendor business name or null",
    "amount": number or null,
    "period": "tax period in question or null",
    "invoice_count": number or null
  }
}

Confidence guidance:
- 0.9+ : strong unambiguous signals (e.g., subject says "Tax Invoice", PDF attached, GSTIN visible)
- 0.7-0.9 : likely but not certain (e.g., subject says "Invoice" with PDF, no GSTIN in body)
- 0.5-0.7 : guess based on weak signals (e.g., empty subject, just a PDF named bill.pdf)
- <0.5 : genuinely unclear — defaults to "other"

Bias: when in doubt and there is a PDF/image attachment from a non-personal sender, prefer "invoice" over "other". Better a false-positive caught later than a missed invoice. The OCR step downstream will reject non-invoices.`;

  const attachmentDetails = message.attachments.length > 0
    ? message.attachments
        .map((a) => `  - ${a.filename} (${a.mimeType}${a.size ? `, ${a.size} bytes` : ""})`)
        .join("\n")
    : "  (none)";

  const userPrompt = `EMAIL TO CLASSIFY:

From: ${message.from}
Subject: ${message.subject || "(empty subject)"}
Attachments:
${attachmentDetails}

Body (first 3000 chars):
"""
${message.body.slice(0, 3000) || "(empty body)"}
"""

Classify this email. If subject and body are sparse but there's a commercial-looking attachment, lean toward invoice.`;

  try {
    const result = await generateText({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 1024,
      jsonMode: true,
      temperature: 0.1,
    });

    if (!result.text || result.text.trim().length === 0) {
      throw new Error(
        "LLM returned empty response (likely safety filter or token limit hit)",
      );
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `No JSON in LLM response. Got: ${result.text.slice(0, 200)}`,
      );
    }
    return JSON.parse(jsonMatch[0]) as EmailClassification;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(
      `[classifier] FAILED for "${message.subject.slice(0, 60)}":`,
      errMsg,
    );
    return {
      intent: "other",
      confidence: 0,
      reasoning: "Classifier failed: " + errMsg.slice(0, 200),
      extracted: {},
    };
  }
}
