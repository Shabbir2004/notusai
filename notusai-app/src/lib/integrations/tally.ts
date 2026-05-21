/**
 * Tally integration.
 *
 * Two paths:
 *
 * 1. PRIMARY (production): TDL connector — proprietary scripting on Tally.
 *    Build OR license from existing TDL vendors (Suvit-style integration, Refrens, etc.).
 *    Expensive (2 engineer-months) — don't build from scratch.
 *
 * 2. FALLBACK (works today): CSV import. CA exports Day Book / Purchase Register
 *    from Tally as Excel/CSV, uploads to NotusAI. We parse and ingest.
 *
 * This module handles path 2 (CSV) now and provides hooks for path 1 (TDL).
 */

import Papa from "papaparse";

export interface ParsedInvoice {
  invoice_number: string;
  invoice_date: string | null;
  vendor_name: string;
  vendor_gstin: string | null;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  hsn_code: string | null;
  raw: Record<string, string>;
}

/**
 * Parse a Tally Purchase Register CSV export.
 * Tally export columns vary by version (TallyPrime vs ERP9). We auto-detect.
 */
export function parseTallyPurchaseCsv(csvText: string): ParsedInvoice[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim().replace(/\s+/g, "_"),
  });

  if (result.errors.length > 0) {
    console.warn("Tally CSV parse warnings:", result.errors.slice(0, 3));
  }

  return result.data
    .map((row): ParsedInvoice | null => {
      const num = pick(row, ["invoice_number", "voucher_number", "bill_no", "invoice_no"]);
      const date = pick(row, ["date", "invoice_date", "voucher_date", "bill_date"]);
      const vendor = pick(row, ["party_name", "vendor_name", "supplier", "particulars"]);
      const gstin = pick(row, ["party_gstin", "vendor_gstin", "gstin"]);
      const amount = parseAmount(pick(row, ["amount", "taxable_amount", "taxable_value", "value"]));
      const cgst = parseAmount(pick(row, ["cgst", "cgst_amount"]));
      const sgst = parseAmount(pick(row, ["sgst", "sgst_amount"]));
      const igst = parseAmount(pick(row, ["igst", "igst_amount"]));
      const hsn = pick(row, ["hsn", "hsn_code", "hsn_sac"]);
      if (!num || !vendor) return null;
      return {
        invoice_number: num,
        invoice_date: date ? normalizeDate(date) : null,
        vendor_name: vendor,
        vendor_gstin: gstin || null,
        amount,
        cgst,
        sgst,
        igst,
        hsn_code: hsn || null,
        raw: row,
      };
    })
    .filter((x): x is ParsedInvoice => x !== null);
}

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function parseAmount(s: string | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(s: string): string | null {
  // Try DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const ddmmyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/;
  let m = s.match(ddmmyyyy);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(iso);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// ============================================
// FUTURE: TDL connector hook
// ============================================
export async function pullFromTally(_opts: {
  tallyHost: string;
  tallyPort: number;
  fromDate: string;
  toDate: string;
}): Promise<ParsedInvoice[]> {
  throw new Error("TDL connector not yet implemented. Use CSV import for now.");
}
