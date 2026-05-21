/**
 * Invoice ingestor — when an invoice email arrives, OCR each attachment
 * and create invoice rows.
 *
 * Critical behavior: we OCR even when the email-time client match failed.
 * Reasons:
 *   1. OCR'd buyer GSTIN is far more reliable than entity extracted from
 *      email body — re-match against OCR result before staging.
 *   2. New clients, GSTIN typos, vendor-sent emails would otherwise silently
 *      drop the invoice. Stage with client_id=null instead → surfaces in
 *      /app/pending → CA does one-click assign.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { extractInvoiceFromPdf } from "@/lib/ocr/gemini-vision";
import { getAttachment, type GmailFullMessage } from "@/lib/integrations/email/gmail";
import { createNotification } from "@/lib/notifications/send";
import { matchClient, matchVendor } from "@/lib/email-router/entity-matcher";
import type { MatchResult } from "@/lib/email-router/entity-matcher";

export async function ingestInvoiceBatch(opts: {
  firmId: string;
  userId: string;
  message: GmailFullMessage;
  accessToken: string;
  clientMatch: MatchResult;
}): Promise<{
  invoicesCreated: number;
  invoicesStaged: number;
  failures: number;
  reason?: string;
}> {
  const supabase = createServiceClient();

  const pdfAttachments = opts.message.attachments.filter(
    (a) =>
      /pdf|image/i.test(a.mimeType) ||
      a.filename.toLowerCase().endsWith(".pdf"),
  );

  if (pdfAttachments.length === 0) {
    return {
      invoicesCreated: 0,
      invoicesStaged: 0,
      failures: 0,
      reason: "No PDF/image attachments",
    };
  }

  let assignedCount = 0;     // invoices that landed on a real client
  let stagedCount = 0;       // invoices stored with client_id = null
  let failed = 0;
  const stagedBuyerGstins = new Set<string>();
  let firstClientName: string | null = opts.clientMatch.clientName || null;

  for (const att of pdfAttachments) {
    try {
      const { data } = await getAttachment({
        accessToken: opts.accessToken,
        messageId: opts.message.id,
        attachmentId: att.attachmentId,
      });

      const extracted = await extractInvoiceFromPdf({
        pdfBase64: data,
        mimeType: att.mimeType,
      });

      if (!extracted.invoice_number || !extracted.vendor_name) {
        // Not a usable invoice — skip
        failed++;
        continue;
      }

      // === RE-MATCH CLIENT using OCR'd buyer info (more reliable than email) ===
      let resolvedClientId: string | null = opts.clientMatch.clientId || null;
      let resolvedClientName: string | null = opts.clientMatch.clientName || null;

      if (!resolvedClientId && (extracted.buyer_gstin || extracted.buyer_name)) {
        const reMatch = await matchClient({
          firmId: opts.firmId,
          gstin: extracted.buyer_gstin || undefined,
          clientName: extracted.buyer_name || undefined,
          senderEmail: opts.message.from,
          emailSubject: opts.message.subject,
        });
        if (reMatch.clientId && reMatch.confidence === "high") {
          resolvedClientId = reMatch.clientId;
          resolvedClientName = reMatch.clientName || null;
        }
      }

      // === MATCH / AUTO-CREATE VENDOR ===
      const vendorMatch = await matchVendor({
        firmId: opts.firmId,
        vendorGstin: extracted.vendor_gstin || undefined,
        vendorName: extracted.vendor_name,
      });

      let vendorId = vendorMatch.vendorId;
      if (!vendorId && extracted.vendor_name) {
        const { data: newVendor } = await supabase
          .from("vendors")
          .insert({
            firm_id: opts.firmId,
            name: extracted.vendor_name,
            gstin: extracted.vendor_gstin,
            risk_score: 5.0,
          })
          .select("id")
          .single();
        vendorId = newVendor?.id;
      }

      // === INSERT INVOICE (assigned or staged) ===
      const { error } = await supabase.from("invoices").insert({
        firm_id: opts.firmId,
        client_id: resolvedClientId,            // may be null = unassigned
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date || null,
        vendor_id: vendorId,
        vendor_gstin: extracted.vendor_gstin,
        vendor_name: extracted.vendor_name,
        buyer_gstin: extracted.buyer_gstin,     // for staged → bulk-assign later
        buyer_name: extracted.buyer_name,
        amount: extracted.taxable_value || 0,
        cgst: extracted.cgst || 0,
        sgst: extracted.sgst || 0,
        igst: extracted.igst || 0,
        total_tax: extracted.total_tax || 0,
        hsn_code: extracted.hsn_code,
        source: "books",
        source_email_subject: opts.message.subject,
        source_email_from: opts.message.from,
        raw_data: extracted as unknown as Record<string, unknown>,
      });

      if (error) {
        console.error("Invoice insert failed:", error);
        failed++;
        continue;
      }

      if (resolvedClientId) {
        assignedCount++;
        firstClientName = resolvedClientName || firstClientName;
      } else {
        stagedCount++;
        if (extracted.buyer_gstin) stagedBuyerGstins.add(extracted.buyer_gstin);
      }
    } catch (e) {
      console.error("OCR failed for attachment", att.filename, e);
      failed++;
    }
  }

  // === NOTIFY CA ===
  if (assignedCount > 0 && firstClientName) {
    await createNotification({
      firmId: opts.firmId,
      userId: opts.userId,
      type: "system",
      severity: "success",
      title: `📥 ${assignedCount} invoice${assignedCount > 1 ? "s" : ""} ingested for ${firstClientName}`,
      body: `From "${opts.message.subject.slice(0, 80)}". Ready in /app/pending.`,
      link: "/app/pending",
      entityType: "client",
      entityId: opts.clientMatch.clientId || undefined,
    });
  }

  if (stagedCount > 0) {
    const gstinHint = stagedBuyerGstins.size > 0
      ? ` Buyer GSTIN${stagedBuyerGstins.size > 1 ? "s" : ""}: ${Array.from(stagedBuyerGstins).join(", ")}.`
      : "";
    await createNotification({
      firmId: opts.firmId,
      userId: opts.userId,
      type: "system",
      severity: "warning",
      title: `⚠️ ${stagedCount} invoice${stagedCount > 1 ? "s" : ""} need client assignment`,
      body: `OCR'd from "${opts.message.subject.slice(0, 80)}" but couldn't auto-match to any client.${gstinHint} Assign in /app/pending.`,
      link: "/app/pending",
    });
  }

  return {
    invoicesCreated: assignedCount,
    invoicesStaged: stagedCount,
    failures: failed,
    reason:
      assignedCount + stagedCount === 0
        ? "All attachments failed OCR (not usable invoices)"
        : undefined,
  };
}
