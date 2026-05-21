import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

export async function sendDraftReadyEmail(opts: {
  to: string;
  clientName: string;
  draftLink: string;
  paymentLink: string | null;
  isFree: boolean;
  priceInr: number;
}) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "NotusAI <onboarding@resend.dev>";
  const subject = `Your draft reply for ${opts.clientName} is ready`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1917;">
  <div style="border: 1px solid #e7e5e4; border-radius: 12px; padding: 32px;">
    <h2 style="margin: 0 0 16px; color: #1c1917;">Your draft is ready ✓</h2>
    <p>Your formal reply for <strong>${escapeHtml(opts.clientName)}</strong>'s notice has been drafted and includes specific CGST Act sections, CBIC circulars, and case-law citations.</p>

    <div style="margin: 24px 0;">
      <a href="${opts.draftLink}" style="display: inline-block; background: #1c1917; color: #fafaf9; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View &amp; Download Draft</a>
    </div>

    ${
      opts.isFree
        ? `<p style="background: #f5f5f4; padding: 16px; border-radius: 8px; font-size: 14px;">
            ✨ This was your free first draft. From your next notice onwards, our pricing is ₹999 (simple) / ₹1,999 (medium) / ₹4,999 (complex).
           </p>`
        : opts.paymentLink
          ? `<p style="margin: 24px 0; font-size: 15px;">Complete payment to unlock the full draft:</p>
             <div><a href="${opts.paymentLink}" style="display: inline-block; background: #f59e0b; color: #1c1917; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Pay ₹${opts.priceInr} via Razorpay</a></div>`
          : ""
    }

    <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 24px 0;" />
    <p style="font-size: 13px; color: #78716c;">
      <strong>Important:</strong> This is an AI-assisted draft. Please review every citation against indiankanoon.org before filing. Your professional review and signature are required.
    </p>
    <p style="font-size: 13px; color: #78716c;">— NotusAI</p>
  </div>
</body>
</html>`;

  const result = await getResend().emails.send({
    from: fromEmail,
    to: opts.to,
    subject,
    html,
  });

  return result;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
