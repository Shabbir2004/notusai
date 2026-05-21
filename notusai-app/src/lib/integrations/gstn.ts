/**
 * GSTN integration — Cygnet GSP wrapper.
 *
 * GSTN APIs (GSTR-1, 2A, 2B, 3B, e-invoice) require GSP licensing.
 * Options:
 *  1. Apply directly to GSTN — 12-18 months, ₹50L+
 *  2. White-label through Cygnet Infotech / IRIS / Karvy / Vayana — ₹2-5 per API call
 *
 * This module is the abstraction layer. In dev mode, it returns mocked data so
 * you can test the whole flow before signing a GSP contract. In production,
 * set USE_MOCK_GSTN=false and provide real Cygnet credentials.
 *
 * To get production access: contact sales@cygnetinfotech.com (or IRIS / Vayana).
 * Typical SLA: 2-4 weeks for sandbox + KYC, 4-8 weeks for production.
 */

const USE_MOCK = process.env.USE_MOCK_GSTN !== "false";

export interface Gstr2BInvoice {
  invoice_number: string;
  invoice_date: string;
  vendor_gstin: string;
  vendor_name: string;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
  hsn_code?: string;
}

export interface Gstr2BResponse {
  gstin: string;
  period: string; // 'YYYY-MM'
  generated_on: string;
  invoices: Gstr2BInvoice[];
  total_invoices: number;
  total_itc: number;
}

export interface Gstr1Summary {
  gstin: string;
  period: string;
  total_b2b: number;
  total_b2c: number;
  filed_at: string | null;
  filed_on_time: boolean;
}

export async function fetchGstr2B(opts: {
  gstin: string;
  period: string;
}): Promise<Gstr2BResponse> {
  if (USE_MOCK) {
    return mockGstr2B(opts.gstin, opts.period);
  }
  // PRODUCTION: call Cygnet (or other GSP) here
  const cygnetUrl = process.env.CYGNET_GSP_URL;
  const cygnetKey = process.env.CYGNET_GSP_API_KEY;
  if (!cygnetUrl || !cygnetKey) {
    throw new Error("Cygnet GSP not configured. Set CYGNET_GSP_URL and CYGNET_GSP_API_KEY.");
  }
  const res = await fetch(`${cygnetUrl}/gstr2b?gstin=${opts.gstin}&period=${opts.period}`, {
    headers: { Authorization: `Bearer ${cygnetKey}` },
  });
  if (!res.ok) throw new Error(`GSP error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchGstr1Summary(opts: {
  gstin: string;
  period: string;
}): Promise<Gstr1Summary> {
  if (USE_MOCK) {
    return {
      gstin: opts.gstin,
      period: opts.period,
      total_b2b: 1200000,
      total_b2c: 350000,
      filed_at: new Date().toISOString(),
      filed_on_time: true,
    };
  }
  const cygnetUrl = process.env.CYGNET_GSP_URL;
  const cygnetKey = process.env.CYGNET_GSP_API_KEY;
  if (!cygnetUrl || !cygnetKey) {
    throw new Error("Cygnet GSP not configured.");
  }
  const res = await fetch(`${cygnetUrl}/gstr1/summary?gstin=${opts.gstin}&period=${opts.period}`, {
    headers: { Authorization: `Bearer ${cygnetKey}` },
  });
  if (!res.ok) throw new Error(`GSP error: ${res.status}`);
  return res.json();
}

// ============================================
// MOCK DATA (for development before GSP contract)
// ============================================
function mockGstr2B(gstin: string, period: string): Gstr2BResponse {
  const vendors = [
    { gstin: "27AABCS1234N1Z6", name: "Patel Yarn Mills" },
    { gstin: "27AABCS5678M1Z3", name: "Mumbai Trading Co" },
    { gstin: "29AABCS9012M1Z7", name: "Bangalore Electronics" },
    { gstin: "07AABCS3456M1Z9", name: "Delhi Suppliers" },
  ];
  const invoices: Gstr2BInvoice[] = [];
  let totalItc = 0;
  for (let i = 0; i < 25; i++) {
    const v = vendors[i % vendors.length];
    const taxable = Math.floor(50000 + Math.random() * 200000);
    const cgst = taxable * 0.09;
    const sgst = taxable * 0.09;
    invoices.push({
      invoice_number: `INV-${period}-${1000 + i}`,
      invoice_date: `${period}-${(i % 28) + 1}`.padStart(10, "0"),
      vendor_gstin: v.gstin,
      vendor_name: v.name,
      taxable_value: taxable,
      cgst,
      sgst,
      igst: 0,
      total_tax: cgst + sgst,
      hsn_code: "8479",
    });
    totalItc += cgst + sgst;
  }
  return {
    gstin,
    period,
    generated_on: new Date().toISOString(),
    invoices,
    total_invoices: invoices.length,
    total_itc: totalItc,
  };
}
