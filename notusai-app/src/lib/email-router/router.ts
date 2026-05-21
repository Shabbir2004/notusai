/**
 * Email router — main entry point.
 *
 * Pipeline:
 *   1. Quick keyword filter (free)
 *   2. AI classification (Claude Sonnet)
 *   3. Entity matching (DB lookups, fuzzy)
 *   4. Dispatch to specific handler:
 *      - notice            → autoDraftFromEmail
 *      - vendor_reply      → vendorEmailReactor
 *      - invoice           → ingestInvoiceBatch
 *      - tally_export      → ingestTallyExport
 *      - client_doc        → storeClientDoc
 *      - portal_alert      → autoDraftFromEmail (treat as notice)
 *      - internal/other    → mark ignored
 *
 * Records every email in gmail_processed_messages for idempotency + audit.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/send";
import type { GmailFullMessage } from "@/lib/integrations/email/gmail";
import { quickKeywordFilter, classifyEmail, type EmailClassification } from "./classifier";
import { matchClient, matchVendor, type MatchResult } from "./entity-matcher";
import { autoDraftFromEmail } from "@/lib/agents/auto-draft";
import { reactToVendorEmail } from "@/lib/agents/vendor-email-reactor";
import { ingestInvoiceBatch } from "@/lib/agents/invoice-ingestor";

export interface RouteResult {
  intent: string;
  matched: boolean;
  clientId?: string;
  vendorId?: string;
  noticeId?: string;
  invoiceCount?: number;
  followupId?: string;
  needsManualReview: boolean;
  reason?: string;
}

export async function routeEmail(opts: {
  firmId: string;
  userId: string;
  userEmail: string;
  integrationId: string;
  message: GmailFullMessage;
  accessToken: string;
}): Promise<RouteResult> {
  const supabase = createServiceClient();

  // Step 1: quick filter
  const quick = quickKeywordFilter(opts.message);
  if (!quick.isLikelyActionable) {
    const attachInfo = opts.message.attachments.length > 0
      ? `${opts.message.attachments.length} att (${opts.message.attachments.map(a => a.filename).join(", ")})`
      : "no att";
    console.log(
      `[router] DROP "${opts.message.subject.slice(0, 60)}" from ${opts.message.from.slice(0, 40)} · ${attachInfo} — no keyword match`,
    );
    return {
      intent: "other",
      matched: false,
      needsManualReview: false,
      reason: "Did not match any actionable keywords",
    };
  }
  console.log(
    `[router] KEEP "${opts.message.subject.slice(0, 60)}" — keyword route: ${quick.likelyIntent}`,
  );

  // Step 2: AI classify (~₹0.20 per email)
  let classification: EmailClassification;
  try {
    classification = await classifyEmail(opts.message);
    console.log(`[router] ${opts.message.subject.slice(0, 60)} → AI: ${classification.intent} (${classification.confidence}) quick: ${quick.likelyIntent}`);
  } catch (e) {
    console.error("Classification failed:", e);
    classification = {
      intent: "other",
      confidence: 0,
      reasoning: "Classifier error: " + (e instanceof Error ? e.message : String(e)),
      extracted: {},
    };
  }

  // SAFETY OVERRIDE 1: trust the deterministic keyword filter when AI is uncertain.
  // If keywords clearly indicate a notice/vendor reply/etc. but AI returned "other",
  // use the keyword-detected intent. Better false-positive than missed work.
  if (
    classification.intent === "other" &&
    quick.likelyIntent !== "unknown" &&
    quick.isLikelyActionable
  ) {
    console.log(`[router] OVERRIDE 1: AI said other, keyword filter says ${quick.likelyIntent} — using keyword`);
    classification.intent = quick.likelyIntent as typeof classification.intent;
    classification.confidence = Math.max(classification.confidence, 0.75);
    classification.reasoning = `Keyword filter matched ${quick.likelyIntent}; AI was uncertain (kept its extracted fields)`;
  }

  // SAFETY OVERRIDE 2: AI failed (confidence 0) OR returned "other" — but there's
  // a PDF/image attachment from a non-personal sender. Treat as invoice and let
  // OCR be the final arbiter (OCR returns null fields if it's not actually an invoice,
  // and the ingestor skips it).
  const hasInvoiceLikeAttachment = opts.message.attachments.some(
    (a) =>
      a.mimeType === "application/pdf" ||
      a.mimeType.startsWith("image/") ||
      a.filename.toLowerCase().endsWith(".pdf"),
  );
  if (
    classification.intent === "other" &&
    hasInvoiceLikeAttachment &&
    classification.confidence < 0.5
  ) {
    console.log(
      `[router] OVERRIDE 2: AI uncertain (${classification.confidence}) but PDF attached — trying invoice route. OCR will validate.`,
    );
    classification.intent = "invoice";
    classification.confidence = 0.6;
    classification.reasoning = `AI uncertain but has PDF attachment — defensive route to invoice (OCR will reject if not invoice)`;
  }

  // Step 3: try to match entities (client / vendor)
  let clientMatch: MatchResult = { confidence: "none", matchStrategy: "skipped" };
  let vendorMatch: MatchResult = { confidence: "none", matchStrategy: "skipped" };

  if (["notice", "invoice", "tally_export", "client_doc", "portal_alert"].includes(classification.intent)) {
    clientMatch = await matchClient({
      firmId: opts.firmId,
      gstin: classification.extracted.gstin,
      clientName: classification.extracted.client_name,
      senderEmail: opts.message.from,
      emailSubject: opts.message.subject,
    });
  }

  if (classification.intent === "vendor_reply") {
    vendorMatch = await matchVendor({
      firmId: opts.firmId,
      vendorGstin: classification.extracted.gstin,
      vendorName: classification.extracted.vendor_name,
      senderEmail: opts.message.from,
    });
  }

  // Step 4: dispatch
  let result: RouteResult = {
    intent: classification.intent,
    matched: false,
    needsManualReview: false,
  };

  try {
    switch (classification.intent) {
      case "notice":
      case "portal_alert": {
        // Drive auto-draft pipeline
        const draftResult = await autoDraftFromEmail({
          firmId: opts.firmId,
          userId: opts.userId,
          userEmail: opts.userEmail,
          integrationId: opts.integrationId,
          message: opts.message,
          accessToken: opts.accessToken,
        });

        // If we matched a client, link the notice to that client
        if (draftResult.success && draftResult.noticeId && clientMatch.clientId) {
          await supabase
            .from("notices")
            .update({
              client_id: clientMatch.clientId,
              gstin_id: clientMatch.gstinId,
            })
            .eq("id", draftResult.noticeId);
        }

        // Notify CA with match info
        if (draftResult.success && draftResult.noticeId) {
          await createNotification({
            firmId: opts.firmId,
            userId: opts.userId,
            type: "notice_drafted",
            severity: clientMatch.confidence === "high" ? "success" : "info",
            title: clientMatch.clientName
              ? `✓ Draft ready: ${classification.extracted.notice_type || "notice"} for ${clientMatch.clientName}`
              : `⚠ Draft ready but client not auto-matched — please link manually`,
            body: clientMatch.confidence === "high"
              ? `Auto-matched via ${clientMatch.matchStrategy}. Demand: ₹${(classification.extracted.amount || 0).toLocaleString("en-IN")}`
              : `Couldn't match this notice to any of your clients. Extracted: ${classification.extracted.gstin || classification.extracted.client_name || "[unknown]"}.`,
            link: `/app/notices/${draftResult.noticeId}`,
            entityType: "notice",
            entityId: draftResult.noticeId,
          });
        }

        result = {
          intent: classification.intent,
          matched: !!clientMatch.clientId,
          clientId: clientMatch.clientId,
          noticeId: draftResult.noticeId,
          needsManualReview: clientMatch.confidence !== "high" && draftResult.success,
          reason: draftResult.reason,
        };
        break;
      }

      case "vendor_reply": {
        const reactResult = await reactToVendorEmail({
          firmId: opts.firmId,
          message: opts.message,
          classification,
          vendorMatch,
        });

        result = {
          intent: "vendor_reply",
          matched: !!vendorMatch.vendorId,
          vendorId: vendorMatch.vendorId,
          followupId: vendorMatch.vendorFollowupId,
          needsManualReview: !reactResult.handled,
          reason: reactResult.reason,
        };
        break;
      }

      case "invoice": {
        const ingestResult = await ingestInvoiceBatch({
          firmId: opts.firmId,
          userId: opts.userId,
          message: opts.message,
          accessToken: opts.accessToken,
          clientMatch,
        });

        const totalIngested = ingestResult.invoicesCreated + ingestResult.invoicesStaged;
        result = {
          intent: "invoice",
          matched: ingestResult.invoicesCreated > 0,
          clientId: clientMatch.clientId,
          invoiceCount: totalIngested,
          needsManualReview: ingestResult.invoicesStaged > 0,
          reason: ingestResult.reason,
        };
        break;
      }

      case "tally_export": {
        // Store for manual review — full Tally CSV import is the existing UI flow
        await createNotification({
          firmId: opts.firmId,
          userId: opts.userId,
          type: "system",
          severity: "info",
          title: "📊 Tally export received via email",
          body: clientMatch.clientName
            ? `From ${clientMatch.clientName} — open Reconciliation Hub to process`
            : "Sender couldn't be auto-matched. Open inbox review.",
          link: "/app/reconciliation/new",
        });
        result = {
          intent: "tally_export",
          matched: !!clientMatch.clientId,
          clientId: clientMatch.clientId,
          needsManualReview: true,
        };
        break;
      }

      case "client_doc":
      case "internal":
      case "other":
      default:
        // Silent ignore for these
        result = {
          intent: classification.intent,
          matched: false,
          needsManualReview: false,
          reason: "Not auto-actionable",
        };
        break;
    }
  } catch (e) {
    console.error("Router dispatch error:", e);
    result.reason = e instanceof Error ? e.message : String(e);
    result.needsManualReview = true;
  }

  // Always record in audit log
  await supabase.from("gmail_processed_messages").insert({
    firm_id: opts.firmId,
    integration_id: opts.integrationId,
    message_id: opts.message.id,
    thread_id: opts.message.threadId,
    from_email: opts.message.from,
    subject: opts.message.subject,
    classified_as: result.intent,
    notice_id: result.noticeId || null,
  });

  return result;
}
