/**
 * Entity matcher — given an extracted entity (GSTIN, business name, vendor name,
 * sender email), find the matching client/vendor in the firm's database.
 *
 * Strategies (tried in order):
 *   1. GSTIN exact match — highest confidence
 *   2. Sender email matches client.primary_contact_email — high
 *   3. Business name exact match (case-insensitive) — high
 *   4. Business name fuzzy match (Levenshtein 85%+) — medium
 *   5. Vendor name fuzzy match against active follow-up vendors — medium
 *   6. Subject line contains client name — medium-low
 *   7. None — escalate to manual review
 */

import { createServiceClient } from "@/lib/supabase/server";

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface MatchResult {
  clientId?: string;
  clientName?: string;
  gstinId?: string;
  gstin?: string;
  vendorId?: string;
  vendorName?: string;
  vendorFollowupId?: string; // if matched to an active follow-up
  confidence: MatchConfidence;
  matchStrategy: string;
  candidates?: Array<{ id: string; name: string; score: number }>; // for ambiguous
}

export async function matchClient(opts: {
  firmId: string;
  gstin?: string;
  clientName?: string;
  senderEmail?: string;
  emailSubject?: string;
}): Promise<MatchResult> {
  const supabase = createServiceClient();

  // Strategy 1: GSTIN exact match (highest confidence)
  if (opts.gstin && /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z]{1}\d{1}$/.test(opts.gstin)) {
    const { data } = await supabase
      .from("gstins")
      .select("id, gstin, client_id, clients(id, name)")
      .eq("firm_id", opts.firmId)
      .eq("gstin", opts.gstin)
      .maybeSingle();

    if (data) {
      const c = (data as { clients?: { id: string; name: string } }).clients;
      return {
        clientId: c?.id || data.client_id,
        clientName: c?.name,
        gstinId: data.id,
        gstin: data.gstin,
        confidence: "high",
        matchStrategy: "gstin_exact",
      };
    }
  }

  // Strategy 2: sender email matches client contact email
  if (opts.senderEmail) {
    const cleanEmail = extractEmailAddress(opts.senderEmail);
    if (cleanEmail) {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("firm_id", opts.firmId)
        .eq("primary_contact_email", cleanEmail)
        .maybeSingle();

      if (data) {
        return {
          clientId: data.id,
          clientName: data.name,
          confidence: "high",
          matchStrategy: "sender_email_exact",
        };
      }
    }
  }

  // Strategy 3 & 4: business name match
  if (opts.clientName) {
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("firm_id", opts.firmId);

    if (allClients && allClients.length > 0) {
      const target = normalizeBizName(opts.clientName);

      // Exact match
      const exact = allClients.find((c) => normalizeBizName(c.name) === target);
      if (exact) {
        return {
          clientId: exact.id,
          clientName: exact.name,
          confidence: "high",
          matchStrategy: "name_exact",
        };
      }

      // Fuzzy match (scored)
      const scored = allClients
        .map((c) => ({ ...c, score: nameScore(target, normalizeBizName(c.name)) }))
        .filter((c) => c.score >= 0.6)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0 && scored[0].score >= 0.85) {
        return {
          clientId: scored[0].id,
          clientName: scored[0].name,
          confidence: "medium",
          matchStrategy: "name_fuzzy",
          candidates: scored.slice(0, 3),
        };
      }

      if (scored.length > 0 && scored[0].score >= 0.6) {
        return {
          clientId: scored[0].id,
          clientName: scored[0].name,
          confidence: "low",
          matchStrategy: "name_fuzzy_weak",
          candidates: scored.slice(0, 3),
        };
      }
    }
  }

  // Strategy 5: subject line contains client name (last resort)
  if (opts.emailSubject) {
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("firm_id", opts.firmId);

    const subjectLower = opts.emailSubject.toLowerCase();
    const match = (allClients || []).find((c) =>
      subjectLower.includes(c.name.toLowerCase()),
    );
    if (match) {
      return {
        clientId: match.id,
        clientName: match.name,
        confidence: "low",
        matchStrategy: "subject_contains_name",
      };
    }
  }

  return {
    confidence: "none",
    matchStrategy: "no_match",
  };
}

export async function matchVendor(opts: {
  firmId: string;
  vendorGstin?: string;
  vendorName?: string;
  senderEmail?: string;
  senderPhone?: string;
}): Promise<MatchResult> {
  const supabase = createServiceClient();

  // Strategy 1: vendor GSTIN exact
  if (opts.vendorGstin) {
    const { data } = await supabase
      .from("vendors")
      .select("id, name, gstin")
      .eq("firm_id", opts.firmId)
      .eq("gstin", opts.vendorGstin)
      .maybeSingle();
    if (data) {
      return {
        vendorId: data.id,
        vendorName: data.name,
        confidence: "high",
        matchStrategy: "vendor_gstin_exact",
      };
    }
  }

  // Strategy 2: active vendor_followup linked to sender email
  if (opts.senderEmail) {
    const cleanEmail = extractEmailAddress(opts.senderEmail);
    const { data } = await supabase
      .from("vendor_followups")
      .select("id, vendor_id, vendors(id, name)")
      .eq("firm_id", opts.firmId)
      .in("status", ["pending", "sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(20);

    // Check if any followup's vendor email matches
    // (this would require storing vendor email on the follow-up)
    if (data && data.length > 0) {
      // Match by any vendor whose name contains a token from email's local part
      const localPart = cleanEmail?.split("@")[0] || "";
      const matched = data.find((f) => {
        const v = (f as { vendors?: { name: string } }).vendors;
        if (!v) return false;
        return v.name.toLowerCase().includes(localPart.toLowerCase());
      });
      if (matched) {
        const v = (matched as { vendors?: { id: string; name: string } }).vendors;
        return {
          vendorId: matched.vendor_id,
          vendorName: v?.name,
          vendorFollowupId: matched.id,
          confidence: "medium",
          matchStrategy: "active_followup_email",
        };
      }
    }
  }

  // Strategy 3: fuzzy vendor name
  if (opts.vendorName) {
    const { data: allVendors } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("firm_id", opts.firmId);

    if (allVendors && allVendors.length > 0) {
      const target = normalizeBizName(opts.vendorName);
      const exact = allVendors.find((v) => normalizeBizName(v.name) === target);
      if (exact) {
        return {
          vendorId: exact.id,
          vendorName: exact.name,
          confidence: "high",
          matchStrategy: "vendor_name_exact",
        };
      }

      const scored = allVendors
        .map((v) => ({ ...v, score: nameScore(target, normalizeBizName(v.name)) }))
        .filter((v) => v.score >= 0.7)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0 && scored[0].score >= 0.85) {
        return {
          vendorId: scored[0].id,
          vendorName: scored[0].name,
          confidence: "medium",
          matchStrategy: "vendor_name_fuzzy",
          candidates: scored.slice(0, 3),
        };
      }
    }
  }

  return { confidence: "none", matchStrategy: "no_vendor_match" };
}

// ============================================
// Helpers
// ============================================

function extractEmailAddress(rawFrom: string): string | null {
  // "Name <email@domain.com>" → "email@domain.com"
  const match = rawFrom.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (rawFrom.includes("@")) return rawFrom.toLowerCase().trim();
  return null;
}

function normalizeBizName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|industries|enterprises|corp|corporation|trading|company|co|m\/s)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Simple character-level similarity (Sørensen–Dice on bigrams).
 * Returns 0-1.
 */
function nameScore(a: string, b: string): number {
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
