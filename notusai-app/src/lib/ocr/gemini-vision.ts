/**
 * Gemini Vision OCR — read GST notices from PDFs/images.
 *
 * Why Gemini Flash over Tesseract/Google Vision OCR:
 *  - Modern LLM vision handles low-quality phone photos, multilingual notices,
 *    handwritten amendments. OCR-then-LLM pipelines break on those.
 *  - Gemini Flash is cheaper than GPT-4V or Claude vision for this task.
 *
 * Cost: ~₹2-5 per PDF page processed.
 */

const GEMINI_MODEL = "gemini-2.5-flash";

export interface ExtractedNotice {
  notice_type: string | null;
  notice_number: string | null;
  notice_date: string | null;
  deadline: string | null;
  authority: string | null;
  gstin: string | null;
  client_name: string | null;
  period: string | null;
  demand_amount: number | null;
  primary_issue: string | null;
  full_text: string;
  confidence: "high" | "medium" | "low";
}

export async function extractNoticeFromPdf(opts: {
  pdfBase64: string;
  mimeType?: string;
}): Promise<ExtractedNotice> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not set. Get one from https://aistudio.google.com/apikey",
    );
  }

  const mimeType = opts.mimeType || "application/pdf";

  const systemPrompt = `You are a GST notice reader. Read the attached document (PDF or image of a notice) and extract structured information.

Output strict JSON only (no prose):
{
  "notice_type": "ASMT-10" | "DRC-01" | "DRC-01A" | "DRC-07" | "Section 61 SCN" | "Section 73 SCN" | "Section 74 SCN" | "Audit Memo" | "Other",
  "notice_number": "exact reference number as printed",
  "notice_date": "YYYY-MM-DD",
  "deadline": "YYYY-MM-DD (date by which reply must be filed)",
  "authority": "Designation + Commissionerate (e.g., 'Assistant Commissioner of State Tax, Ward 04, Mumbai')",
  "gstin": "15-character GSTIN of the assessee",
  "client_name": "business name of the assessee",
  "period": "tax period in question (e.g., 'April 2025 to June 2025')",
  "demand_amount": number (in INR, omit currency symbol; null if not quantified),
  "primary_issue": "1-sentence summary of the discrepancy",
  "full_text": "complete verbatim text of the notice",
  "confidence": "high" if extraction is clean, "medium" if some fields uncertain, "low" if document is poor quality
}

Rules:
- Never fabricate. Use null for any field you cannot determine.
- Convert dates to ISO format (YYYY-MM-DD). If the notice has "12.10.2025", output "2025-10-12".
- Strip commas/symbols from demand_amount.
- For full_text, transcribe accurately — preserve numbers, GSTINs, section references.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: opts.pdfBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  try {
    const parsed = JSON.parse(text) as ExtractedNotice;
    return parsed;
  } catch (e) {
    throw new Error("Gemini did not return valid JSON: " + text.slice(0, 200));
  }
}

/**
 * Extract structured data from invoice PDFs (for auto-Tally entry creation).
 */
export interface ExtractedInvoice {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  vendor_gstin: string | null;
  buyer_name: string | null;
  buyer_gstin: string | null;
  taxable_value: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total_tax: number | null;
  hsn_code: string | null;
  confidence: "high" | "medium" | "low";
}

export async function extractInvoiceFromPdf(opts: {
  pdfBase64: string;
  mimeType?: string;
}): Promise<ExtractedInvoice> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const systemPrompt = `Read this tax invoice. Output strict JSON:
{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "vendor_name": "supplier business name or null",
  "vendor_gstin": "15-char GSTIN or null",
  "buyer_name": "buyer business name or null",
  "buyer_gstin": "15-char GSTIN or null",
  "taxable_value": number or null,
  "cgst": number or null,
  "sgst": number or null,
  "igst": number or null,
  "total_tax": number or null,
  "hsn_code": "HSN or SAC code or null",
  "confidence": "high" | "medium" | "low"
}

Never fabricate. Use null for any field you cannot determine.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: opts.mimeType || "application/pdf",
                  data: opts.pdfBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  return safeParseInvoiceJson(text);
}

/**
 * Robust JSON parser for Gemini OCR output.
 * Handles: markdown code fences, leading/trailing prose, unescaped newlines,
 * trailing commas, and truncated responses.
 */
function safeParseInvoiceJson(rawText: string): ExtractedInvoice {
  let text = rawText.trim();

  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Extract JSON object (first { to last })
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in OCR response. First 300 chars: ${text.slice(0, 300)}`);
  }
  let jsonStr = text.slice(start, end + 1);

  // First attempt — plain parse
  try {
    return JSON.parse(jsonStr) as ExtractedInvoice;
  } catch (firstErr) {
    // Cleanup attempt: remove trailing commas, fix unescaped newlines in strings
    const cleaned = jsonStr
      .replace(/,(\s*[}\]])/g, "$1")
      // Within strings, replace literal newlines/tabs with space
      .replace(/"((?:[^"\\]|\\.)*)"/g, (_match, inner) =>
        `"${inner.replace(/[\r\n\t]+/g, " ")}"`,
      );

    try {
      return JSON.parse(cleaned) as ExtractedInvoice;
    } catch {
      // Last resort: attempt to repair truncated JSON by closing braces
      const repaired = attemptTruncationRepair(jsonStr);
      try {
        return JSON.parse(repaired) as ExtractedInvoice;
      } catch {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        throw new Error(
          `OCR returned invalid JSON: ${msg}. Length: ${jsonStr.length}. First 400 chars: ${jsonStr.slice(0, 400)}`,
        );
      }
    }
  }
}

/**
 * If JSON is truncated (e.g. response cut off at token limit),
 * attempt to repair by closing the last open string and unclosed braces.
 */
function attemptTruncationRepair(jsonStr: string): string {
  let s = jsonStr;
  // Count quotes — if odd, append closing quote
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // Close the dangling string and assume rest is missing
    s = s + '"';
  }
  // Count open braces
  const open = (s.match(/\{/g) || []).length;
  const close = (s.match(/\}/g) || []).length;
  if (open > close) {
    s = s + "}".repeat(open - close);
  }
  return s;
}
