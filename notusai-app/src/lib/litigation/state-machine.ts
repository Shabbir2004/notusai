/**
 * Litigation OS — state machine for notice lifecycle.
 *
 * Each notice creates a litigation_case. The case moves through stages.
 * Each transition is logged with timestamp + reason + outcome.
 */

export type LitigationStage =
  | "received"           // Notice arrived, not yet replied
  | "drafted"            // Reply drafted but not filed
  | "filed"              // Reply filed on portal
  | "dept_reviewing"     // Department evaluating reply
  | "closed_favorable"   // Closed without DRC-01 — favorable for assessee
  | "escalated_drc01"    // Department issued DRC-01 (proposed demand)
  | "drc01_filed"        // Reply to DRC-01 filed
  | "escalated_drc07"    // Order under Section 73/74 issued
  | "appeal_filed"       // Appeal to Commissioner (Appeals)
  | "hearing_scheduled"
  | "order_received"
  | "tribunal_appeal"
  | "hc_appeal"
  | "sc_appeal"
  | "closed_adverse"
  | "closed_partial";

export interface StageTransition {
  from: LitigationStage;
  to: LitigationStage;
  conditions?: string;
  next_action: string;
}

export const ALLOWED_TRANSITIONS: StageTransition[] = [
  { from: "received", to: "drafted", next_action: "File reply on GST portal" },
  { from: "drafted", to: "filed", next_action: "Await department response" },
  { from: "filed", to: "dept_reviewing", next_action: "Track for any follow-up notice" },
  { from: "dept_reviewing", to: "closed_favorable", next_action: "Case closed. Save outcome for moat dataset." },
  { from: "dept_reviewing", to: "escalated_drc01", next_action: "Draft reply to DRC-01 within 30 days" },
  { from: "escalated_drc01", to: "drc01_filed", next_action: "Await final order" },
  { from: "drc01_filed", to: "closed_favorable", next_action: "Closed. Document for case-law dataset." },
  { from: "drc01_filed", to: "escalated_drc07", next_action: "Pay demand OR file appeal within 90 days" },
  { from: "escalated_drc07", to: "appeal_filed", next_action: "Await hearing date" },
  { from: "appeal_filed", to: "hearing_scheduled", next_action: "Prepare hearing brief" },
  { from: "hearing_scheduled", to: "order_received", next_action: "Review order, decide on next appeal" },
  { from: "order_received", to: "closed_favorable", next_action: "Closed. Document for case-law dataset." },
  { from: "order_received", to: "closed_partial", next_action: "Closed. Document for case-law dataset." },
  { from: "order_received", to: "closed_adverse", next_action: "Either pay or escalate to Tribunal" },
  { from: "closed_adverse", to: "tribunal_appeal", next_action: "File appeal to GST Tribunal" },
  { from: "tribunal_appeal", to: "hearing_scheduled", next_action: "Prepare Tribunal brief" },
  { from: "tribunal_appeal", to: "hc_appeal", next_action: "Coordinate with senior counsel" },
  { from: "hc_appeal", to: "sc_appeal", next_action: "Coordinate with SC counsel" },
];

export function canTransition(from: LitigationStage, to: LitigationStage): boolean {
  return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function nextSuggestedActions(currentStage: LitigationStage): string[] {
  return ALLOWED_TRANSITIONS.filter((t) => t.from === currentStage).map((t) => t.next_action);
}

export function stageLabel(stage: LitigationStage): string {
  const labels: Record<LitigationStage, string> = {
    received: "Received",
    drafted: "Draft ready",
    filed: "Reply filed",
    dept_reviewing: "Dept reviewing",
    closed_favorable: "Closed (favorable)",
    escalated_drc01: "DRC-01 issued",
    drc01_filed: "DRC-01 reply filed",
    escalated_drc07: "DRC-07 issued",
    appeal_filed: "Appeal filed",
    hearing_scheduled: "Hearing scheduled",
    order_received: "Order received",
    tribunal_appeal: "Tribunal appeal",
    hc_appeal: "HC appeal",
    sc_appeal: "SC appeal",
    closed_adverse: "Closed (adverse)",
    closed_partial: "Closed (partial)",
  };
  return labels[stage] || stage;
}

export function isOpenStage(stage: LitigationStage): boolean {
  return !["closed_favorable", "closed_adverse", "closed_partial"].includes(stage);
}
