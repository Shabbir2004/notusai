/**
 * Match a vendor (from NotusAI invoices) to a ledger in CA's Tally.
 *
 * Strategy (tried in order):
 *   1. GSTIN exact match → HIGH confidence
 *   2. Ledger name exact match (case-insensitive) → HIGH
 *   3. Fuzzy name match ≥85% → MEDIUM
 *   4. Fuzzy name match 70-85% → LOW (needs CA approval)
 *   5. No match → NEW (suggest creating ledger)
 */

import { createServiceClient } from "@/lib/supabase/server";

export type MatchConfidence = "high" | "medium" | "low" | "new";

export interface VendorMatchResult {
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  matchedLedgerId: string | null;
  matchedLedgerName: string | null;
  confidence: MatchConfidence;
  strategy: string;
  alternatives?: Array<{ id: string; name: string; score: number }>;
}

/**
 * For a given client + list of vendors, find the best Tally ledger for each.
 * Returns proposals that the CA can approve in bulk.
 */
export async function proposeVendorLedgerMatches(opts: {
  firmId: string;
  clientId: string;
}): Promise<VendorMatchResult[]> {
  const supabase = createServiceClient();

  // Load CA's Tally ledgers for this client
  const { data: ledgers } = await supabase
    .from("tally_ledgers")
    .select("id, name, gstin, parent_group, is_party_ledger")
    .eq("client_id", opts.clientId);

  if (!ledgers || ledgers.length === 0) {
    throw new Error("No Tally ledgers found for this client. Sync ledgers first.");
  }

  // Restrict matching to party-eligible ledgers (Sundry Creditors etc.)
  const partyLedgers = ledgers.filter(
    (l) => l.is_party_ledger || /creditor|debtor/i.test(l.parent_group || ""),
  );
  const ledgersToMatch = partyLedgers.length > 0 ? partyLedgers : ledgers;

  // Get all vendors that have at least one invoice for this client
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, gstin")
    .eq("firm_id", opts.firmId)
    .filter("id", "in", `(${await getInvoiceVendorIds(opts.clientId)})`);

  const results: VendorMatchResult[] = [];

  for (const vendor of vendors || []) {
    const result = matchOneVendor(vendor, ledgersToMatch);
    results.push(result);
  }

  return results;
}

function matchOneVendor(
  vendor: { id: string; name: string; gstin: string | null },
  ledgers: Array<{ id: string; name: string; gstin: string | null }>,
): VendorMatchResult {
  // Strategy 1: GSTIN exact match
  if (vendor.gstin) {
    const exact = ledgers.find((l) => l.gstin === vendor.gstin);
    if (exact) {
      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorGstin: vendor.gstin,
        matchedLedgerId: exact.id,
        matchedLedgerName: exact.name,
        confidence: "high",
        strategy: "gstin_exact",
      };
    }
  }

  // Strategy 2: name exact (normalized)
  const targetNorm = normalize(vendor.name);
  const exactName = ledgers.find((l) => normalize(l.name) === targetNorm);
  if (exactName) {
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorGstin: vendor.gstin,
      matchedLedgerId: exactName.id,
      matchedLedgerName: exactName.name,
      confidence: "high",
      strategy: "name_exact",
    };
  }

  // Strategy 3 & 4: fuzzy
  const scored = ledgers
    .map((l) => ({
      id: l.id,
      name: l.name,
      score: bigramSimilarity(targetNorm, normalize(l.name)),
    }))
    .filter((l) => l.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorGstin: vendor.gstin,
      matchedLedgerId: null,
      matchedLedgerName: null,
      confidence: "new",
      strategy: "no_match_create_new",
    };
  }

  const best = scored[0];
  const confidence: MatchConfidence = best.score >= 0.85 ? "medium" : "low";

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorGstin: vendor.gstin,
    matchedLedgerId: best.id,
    matchedLedgerName: best.name,
    confidence,
    strategy: confidence === "medium" ? "name_fuzzy_strong" : "name_fuzzy_weak",
    alternatives: scored.slice(0, 3),
  };
}

async function getInvoiceVendorIds(clientId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("invoices")
    .select("vendor_id")
    .eq("client_id", clientId)
    .not("vendor_id", "is", null);
  const ids = (data || []).map((r) => r.vendor_id).filter(Boolean) as string[];
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return "''"; // empty
  return unique.map((id) => `'${id}'`).join(",");
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|industries|enterprises|corp|corporation|trading|company|co|m\/s|the)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const aBg = bigrams(a);
  const bBg = bigrams(b);
  let common = 0;
  for (const g of aBg) if (bBg.has(g)) common++;
  return (2 * common) / (aBg.size + bBg.size);
}
