/**
 * Auto-draft agent.
 * When an incoming email is classified as a GST notice, this agent:
 *   1. Downloads the attachment
 *   2. OCRs the PDF to extract structured data
 *   3. Creates a notice row
 *   4. Drafts the reply with Claude
 *   5. Notifies the CA (in-app + email)
 *
 * Runs as a background job from the gmail-sync cron.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { extractNoticeFromPdf } from "@/lib/ocr/gemini-vision";
import { generateNoticeDraft } from "@/lib/anthropic";
import { sendDraftReadyEmail } from "@/lib/resend";
import { createPaymentLink } from "@/lib/razorpay";
import { createNotification } from "@/lib/notifications/send";
import { classifyTier } from "@/lib/utils";
import { getAttachment, getFullMessage, type GmailFullMessage } from "@/lib/integrations/email/gmail";

export interface AutoDraftInput {
  firmId: string;
  userId: string;
  userEmail: string;
  integrationId: string;
  message: GmailFullMessage;
  accessToken: string;
}

export async function autoDraftFromEmail(input: AutoDraftInput): Promise<{
  success: boolean;
  noticeId?: string;
  reason?: string;
}> {
  const supabase = createServiceClient();

  // Find a PDF or image attachment
  const noticeAttachment = input.message.attachments.find((a) =>
    /pdf|image\/(jpeg|jpg|png)/i.test(a.mimeType),
  );

  // If no attachment, try to use the email body as notice text
  let pdfBase64: string | null = null;
  let mimeType = "application/pdf";
  let useTextOnly = false;

  if (noticeAttachment) {
    const att = await getAttachment({
      accessToken: input.accessToken,
      messageId: input.message.id,
      attachmentId: noticeAttachment.attachmentId,
    });
    pdfBase64 = att.data;
    mimeType = noticeAttachment.mimeType;
  } else {
    useTextOnly = true;
  }

  // Get user profile + firm
  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", input.userId)
    .single();
  if (!profile?.firm_id) return { success: false, reason: "No firm" };

  const { data: firm } = await supabase
    .from("firms")
    .select("free_credits_remaining, name")
    .eq("id", profile.firm_id)
    .single();
  const isFree = (firm?.free_credits_remaining ?? 0) > 0;

  // OCR if PDF, else use body text
  let extracted;
  if (!useTextOnly && pdfBase64) {
    try {
      extracted = await extractNoticeFromPdf({ pdfBase64, mimeType });
    } catch (e) {
      console.error("OCR failed, falling back to email body:", e);
      useTextOnly = true;
    }
  }

  let noticeText = useTextOnly ? input.message.body : extracted?.full_text || "";
  let noticeType = extracted?.notice_type || "Other";
  let clientName = extracted?.client_name || "Unknown client";
  let gstin = extracted?.gstin || undefined;
  let demandAmount = extracted?.demand_amount?.toString() || undefined;
  let period = extracted?.period || undefined;
  let deadline = extracted?.deadline || undefined;
  let noticeNumber = extracted?.notice_number || undefined;
  let authority = extracted?.authority || undefined;

  // If still no notice text, fail gracefully
  if (!noticeText || noticeText.length < 50) {
    return { success: false, reason: "Could not extract notice text from email" };
  }

  // Tier
  const demandRupees = parseInt((demandAmount || "0").replace(/[₹,\s]/g, ""), 10) || 0;
  const { tier, price } = classifyTier(demandRupees, noticeType);

  // Create notice row
  const { data: notice, error: insertErr } = await supabase
    .from("notices")
    .insert({
      firm_id: profile.firm_id,
      user_id: input.userId,
      notice_type: noticeType,
      notice_number: noticeNumber,
      notice_date: extracted?.notice_date || null,
      authority,
      period,
      demand_amount: demandRupees || null,
      deadline: deadline || null,
      notice_text: noticeText,
      tier,
      price_inr: price,
      was_free: isFree,
      status: "drafting",
      key_facts: `[Auto-detected from email "${input.message.subject}" — from ${input.message.from}]`,
    })
    .select()
    .single();

  if (insertErr || !notice) {
    return { success: false, reason: "Could not create notice: " + insertErr?.message };
  }

  // Draft with Claude
  try {
    const result = await generateNoticeDraft({
      clientName,
      gstin,
      noticeType,
      period,
      noticeDate: extracted?.notice_date || undefined,
      demandAmount,
      authority,
      noticeText,
      tone: "balanced",
      premium: tier === "complex",
    });

    // Razorpay link if not free
    let paymentLinkUrl: string | null = null;
    if (!isFree) {
      try {
        const link = await createPaymentLink({
          amountInr: price,
          description: `NotusAI - ${noticeType} reply for ${clientName}`,
          customerName: firm?.name || input.userEmail.split("@")[0],
          customerEmail: input.userEmail,
          noticeId: notice.id,
        });
        paymentLinkUrl = link.short_url;
      } catch (e) {
        console.error("Razorpay link failed:", e);
      }
    }

    await supabase
      .from("notices")
      .update({
        draft_md: result.draftMd,
        status: "ready",
        drafted_at: new Date().toISOString(),
        llm_model: result.model,
        tokens_input: result.tokensInput,
        tokens_output: result.tokensOutput,
        cost_inr: result.costInr,
        razorpay_payment_link: paymentLinkUrl,
      })
      .eq("id", notice.id);

    // Decrement credit if was free
    if (isFree) {
      await supabase
        .from("firms")
        .update({ free_credits_remaining: (firm?.free_credits_remaining ?? 1) - 1 })
        .eq("id", profile.firm_id);
    }

    // In-app notification
    await createNotification({
      firmId: profile.firm_id,
      userId: input.userId,
      type: "notice_drafted",
      severity: "success",
      title: `✓ Draft ready: ${noticeType} for ${clientName}`,
      body: `Auto-drafted from email "${input.message.subject}". Demand: ₹${demandRupees.toLocaleString("en-IN")}.`,
      link: `/app/notices/${notice.id}`,
      entityType: "notice",
      entityId: notice.id,
    });

    // Email notification
    try {
      await sendDraftReadyEmail({
        to: input.userEmail,
        clientName,
        draftLink: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/notices/${notice.id}`,
        paymentLink: paymentLinkUrl,
        isFree,
        priceInr: price,
      });
    } catch (e) {
      console.error("Email failed:", e);
    }

    return { success: true, noticeId: notice.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("notices").update({ status: "failed", failure_reason: msg }).eq("id", notice.id);
    return { success: false, reason: msg, noticeId: notice.id };
  }
}
