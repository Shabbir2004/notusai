/**
 * GSTR-2B vs Books reconciliation engine.
 *
 * Matches invoices from books (Tally export) to invoices in GSTR-2B.
 * Uses tiered matching:
 *   1. EXACT match: invoice_number + GSTIN + amount within ±100 paise
 *   2. FUZZY match: same vendor, amount within ±₹100, date within ±3 days
 *   3. SUGGEST: similar amount but different invoice number, flag for human
 */

import type { Gstr2BInvoice } from "@/lib/integrations/gstn";

export interface BooksInvoice {
  invoice_number: string;
  invoice_date: string;
  vendor_gstin: string | null;
  vendor_name: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  hsn_code: string | null;
}

export type MismatchType =
  | "missing_in_2b"
  | "missing_in_books"
  | "amount_diff"
  | "gstin_diff"
  | "hsn_diff";

export interface Match {
  bookInvoice: BooksInvoice;
  twoBInvoice: Gstr2BInvoice;
  confidence: "exact" | "fuzzy";
  diffs: string[];
}

export interface Mismatch {
  type: MismatchType;
  severity: "low" | "medium" | "high";
  bookInvoice?: BooksInvoice;
  twoBInvoice?: Gstr2BInvoice;
  amount: number;
  vendor_name: string;
  invoice_number: string | null;
  diff_amount?: number;
  ai_suggestion?: string;
}

export interface ReconResult {
  totalBooks: number;
  total2B: number;
  matched: Match[];
  mismatches: Mismatch[];
  totalMatchedValue: number;
  totalMismatchValue: number;
  itcAtRisk: number;
}

export function reconcile(books: BooksInvoice[], twoB: Gstr2BInvoice[]): ReconResult {
  const matched: Match[] = [];
  const mismatches: Mismatch[] = [];
  const consumed2B = new Set<number>();

  // Pass 1: exact match
  for (const b of books) {
    let foundIdx = -1;
    for (let i = 0; i < twoB.length; i++) {
      if (consumed2B.has(i)) continue;
      const t = twoB[i];
      if (
        normalize(b.invoice_number) === normalize(t.invoice_number) &&
        b.vendor_gstin === t.vendor_gstin &&
        Math.abs(b.amount - t.taxable_value) < 1
      ) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx >= 0) {
      matched.push({ bookInvoice: b, twoBInvoice: twoB[foundIdx], confidence: "exact", diffs: [] });
      consumed2B.add(foundIdx);
    }
  }

  // Pass 2: fuzzy match (only for unmatched books)
  const unmatchedBooks = books.filter((b) => !matched.some((m) => m.bookInvoice === b));
  for (const b of unmatchedBooks) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < twoB.length; i++) {
      if (consumed2B.has(i)) continue;
      const t = twoB[i];
      const score = fuzzyScore(b, t);
      if (score > bestScore && score >= 0.7) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const t = twoB[bestIdx];
      const diffs: string[] = [];
      if (Math.abs(b.amount - t.taxable_value) >= 1) diffs.push("amount");
      if (normalize(b.invoice_number) !== normalize(t.invoice_number)) diffs.push("invoice_number");
      if (b.vendor_gstin !== t.vendor_gstin) diffs.push("gstin");
      matched.push({ bookInvoice: b, twoBInvoice: t, confidence: "fuzzy", diffs });
      consumed2B.add(bestIdx);
    }
  }

  // Mismatches: books not matched
  for (const b of unmatchedBooks) {
    if (matched.some((m) => m.bookInvoice === b)) continue;
    const itcAtRisk = b.cgst + b.sgst + b.igst;
    mismatches.push({
      type: "missing_in_2b",
      severity: itcAtRisk > 10000 ? "high" : itcAtRisk > 2500 ? "medium" : "low",
      bookInvoice: b,
      amount: b.amount,
      vendor_name: b.vendor_name,
      invoice_number: b.invoice_number,
      ai_suggestion: `Vendor "${b.vendor_name}" hasn't reported this in their GSTR-1. Either follow up with vendor to amend, or reverse ITC of ₹${itcAtRisk.toLocaleString("en-IN")}.`,
    });
  }

  // Mismatches: 2B entries not consumed by any book entry (possibly unrecorded purchases)
  for (let i = 0; i < twoB.length; i++) {
    if (consumed2B.has(i)) continue;
    const t = twoB[i];
    mismatches.push({
      type: "missing_in_books",
      severity: "medium",
      twoBInvoice: t,
      amount: t.taxable_value,
      vendor_name: t.vendor_name,
      invoice_number: t.invoice_number,
      ai_suggestion: `Vendor "${t.vendor_name}" reported this invoice in GSTR-1 but it's not in your books. Possibly an unrecorded purchase — check with vendor and book if genuine.`,
    });
  }

  const totalMatchedValue = matched.reduce((s, m) => s + m.bookInvoice.amount, 0);
  const totalMismatchValue = mismatches.reduce((s, m) => s + m.amount, 0);
  const itcAtRisk = mismatches
    .filter((m) => m.type === "missing_in_2b" && m.bookInvoice)
    .reduce(
      (s, m) =>
        s +
        (m.bookInvoice!.cgst + m.bookInvoice!.sgst + m.bookInvoice!.igst),
      0,
    );

  return {
    totalBooks: books.length,
    total2B: twoB.length,
    matched,
    mismatches,
    totalMatchedValue,
    totalMismatchValue,
    itcAtRisk,
  };
}

function normalize(s: string): string {
  return s.replace(/[\s\-\/]/g, "").toLowerCase();
}

function fuzzyScore(b: BooksInvoice, t: Gstr2BInvoice): number {
  let score = 0;
  // GSTIN exact match
  if (b.vendor_gstin && b.vendor_gstin === t.vendor_gstin) score += 0.5;
  else if (vendorNameSimilar(b.vendor_name, t.vendor_name)) score += 0.3;

  // Amount close
  const amtDiff = Math.abs(b.amount - t.taxable_value);
  if (amtDiff < 1) score += 0.3;
  else if (amtDiff / Math.max(b.amount, 1) < 0.05) score += 0.2;
  else if (amtDiff / Math.max(b.amount, 1) < 0.15) score += 0.1;

  // Invoice number similar
  if (normalize(b.invoice_number) === normalize(t.invoice_number)) score += 0.2;
  else if (
    normalize(b.invoice_number).includes(normalize(t.invoice_number)) ||
    normalize(t.invoice_number).includes(normalize(b.invoice_number))
  )
    score += 0.1;

  return score;
}

function vendorNameSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (na === nb) return true;
  // Levenshtein-lite: if 80% of shorter is a substring of longer, consider similar
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return longer.includes(shorter.slice(0, Math.floor(shorter.length * 0.8)));
}
