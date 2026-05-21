/**
 * Pre-filing anomaly engine (rules-based v1).
 *
 * Given a client + period + reconciliation result + GSTR-1 / GSTR-3B drafts,
 * detect anomalies that increase notice probability.
 *
 * v1: hand-coded rules. v2 (future): XGBoost on historical {filing → notice} pairs.
 */

import type { ReconResult } from "@/lib/reconciliation/matcher";

export type AnomalyType =
  | "itc_excess"
  | "vendor_late"
  | "b2b_b2c_mismatch"
  | "gstr1_3b_mismatch"
  | "invoice_payment_unpaid"
  | "section_16_4_deadline";

export interface Anomaly {
  type: AnomalyType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  impact_inr: number;
  recommended_action: string;
  estimated_savings_inr: number;
}

export interface AnomalyInput {
  recon?: ReconResult;
  itcClaimedInr?: number;
  gstr1B2bInr?: number;
  gstr3bB2bInr?: number;
  eInvoiceB2bInr?: number;
  vendorLatePctLast6Months?: number;
  unpaidInvoicesOver180Days?: { invoice: string; amount: number; itc: number }[];
  fyDeadlineApproaching?: { fy: string; daysRemaining: number; itcAtRiskInr: number };
}

export function detectAnomalies(input: AnomalyInput): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Rule 1: ITC claimed in 3B exceeds 2B match
  if (input.recon && input.itcClaimedInr) {
    const eligibleItc = input.recon.matched.reduce(
      (s, m) => s + (m.bookInvoice.cgst + m.bookInvoice.sgst + m.bookInvoice.igst),
      0,
    );
    const excess = input.itcClaimedInr - eligibleItc;
    if (excess > 1000) {
      const interestPerYear = excess * 0.18;
      anomalies.push({
        type: "itc_excess",
        severity: excess > 50000 ? "high" : excess > 10000 ? "medium" : "low",
        description: `You're claiming ₹${input.itcClaimedInr.toLocaleString("en-IN")} ITC but only ₹${eligibleItc.toLocaleString("en-IN")} is eligible per 2B. Excess: ₹${excess.toLocaleString("en-IN")}.`,
        impact_inr: excess,
        recommended_action: `Reverse ₹${excess.toLocaleString("en-IN")} ITC OR follow up with vendors to get GSTR-1 amended before filing.`,
        estimated_savings_inr: Math.round(interestPerYear),
      });
    }
  }

  // Rule 2: Vendor non-compliance pattern
  if (input.vendorLatePctLast6Months && input.vendorLatePctLast6Months > 0.25) {
    anomalies.push({
      type: "vendor_late",
      severity: input.vendorLatePctLast6Months > 0.5 ? "high" : "medium",
      description: `${Math.round(input.vendorLatePctLast6Months * 100)}% of your vendors filed late in the last 6 months. This is significantly above average.`,
      impact_inr: 0,
      recommended_action: "Switch to compliant vendors for high-value purchases OR add 14-day buffer before filing.",
      estimated_savings_inr: 0,
    });
  }

  // Rule 3: GSTR-1 vs GSTR-3B mismatch
  if (input.gstr1B2bInr != null && input.gstr3bB2bInr != null) {
    const diff = Math.abs(input.gstr1B2bInr - input.gstr3bB2bInr);
    if (diff > 1000) {
      anomalies.push({
        type: "gstr1_3b_mismatch",
        severity: diff > 100000 ? "high" : "medium",
        description: `GSTR-1 reports ₹${input.gstr1B2bInr.toLocaleString("en-IN")} B2B; GSTR-3B reports ₹${input.gstr3bB2bInr.toLocaleString("en-IN")}. Diff: ₹${diff.toLocaleString("en-IN")}.`,
        impact_inr: diff,
        recommended_action: "Reconcile the gap. Likely cause: amendments, credit notes, or rounding. Fix before filing to avoid Section 61 scrutiny.",
        estimated_savings_inr: Math.round(diff * 0.18),
      });
    }
  }

  // Rule 4: E-invoice vs GSTR-1 B2B mismatch
  if (input.gstr1B2bInr != null && input.eInvoiceB2bInr != null) {
    const diff = Math.abs(input.gstr1B2bInr - input.eInvoiceB2bInr);
    if (diff > 1000) {
      anomalies.push({
        type: "b2b_b2c_mismatch",
        severity: diff > 100000 ? "high" : "medium",
        description: `GSTR-1 B2B (₹${input.gstr1B2bInr.toLocaleString("en-IN")}) doesn't match e-invoice total (₹${input.eInvoiceB2bInr.toLocaleString("en-IN")}). Difference: ₹${diff.toLocaleString("en-IN")}.`,
        impact_inr: diff,
        recommended_action: "Identify the missing IRN. Either missed invoice in GSTR-1 or non-IRN B2B invoices over threshold.",
        estimated_savings_inr: 0,
      });
    }
  }

  // Rule 5: Section 16(2)(c) payment within 180 days
  if (input.unpaidInvoicesOver180Days && input.unpaidInvoicesOver180Days.length > 0) {
    const totalItc = input.unpaidInvoicesOver180Days.reduce((s, i) => s + i.itc, 0);
    anomalies.push({
      type: "invoice_payment_unpaid",
      severity: totalItc > 100000 ? "critical" : "high",
      description: `${input.unpaidInvoicesOver180Days.length} invoice(s) unpaid for >180 days. ITC of ₹${totalItc.toLocaleString("en-IN")} must be reversed per Section 16(2)(c).`,
      impact_inr: totalItc,
      recommended_action: "Pay vendors immediately OR reverse the ITC with interest. Department auto-flags this.",
      estimated_savings_inr: Math.round(totalItc * 0.18),
    });
  }

  // Rule 6: Section 16(4) FY deadline
  if (input.fyDeadlineApproaching && input.fyDeadlineApproaching.daysRemaining <= 60) {
    anomalies.push({
      type: "section_16_4_deadline",
      severity: input.fyDeadlineApproaching.daysRemaining <= 14 ? "critical" : "high",
      description: `Section 16(4) deadline for FY ${input.fyDeadlineApproaching.fy} is ${input.fyDeadlineApproaching.daysRemaining} days away. ITC of ₹${input.fyDeadlineApproaching.itcAtRiskInr.toLocaleString("en-IN")} could be permanently lost.`,
      impact_inr: input.fyDeadlineApproaching.itcAtRiskInr,
      recommended_action: "Claim pending ITC in next GSTR-3B. After deadline, this ITC is lost forever.",
      estimated_savings_inr: input.fyDeadlineApproaching.itcAtRiskInr,
    });
  }

  return anomalies.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

export function computeNoticeProbability(anomalies: Anomaly[]): number {
  // Heuristic: each anomaly adds risk based on severity
  const weights = { critical: 0.35, high: 0.20, medium: 0.10, low: 0.03 };
  let prob = 0.05; // base risk
  for (const a of anomalies) {
    prob += weights[a.severity];
  }
  return Math.min(prob, 0.95);
}
