import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

/**
 * Razorpay webhook handler.
 * Configure at: https://dashboard.razorpay.com/app/webhooks
 * Subscribe to: payment_link.paid event
 * URL: https://your-app.vercel.app/api/webhooks/razorpay
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("RAZORPAY_WEBHOOK_SECRET not set — webhook not verified");
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (secret && signature) {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  const event = JSON.parse(rawBody);

  if (event.event === "payment_link.paid") {
    const link = event.payload?.payment_link?.entity;
    const payment = event.payload?.payment?.entity;
    const noticeId = link?.notes?.notice_id;
    const paymentId = payment?.id;

    if (noticeId) {
      const supabase = createServiceClient();
      const { data: notice } = await supabase
        .from("notices")
        .update({
          paid: true,
          razorpay_payment_id: paymentId,
          paid_at: new Date().toISOString(),
        })
        .eq("id", noticeId)
        .select("firm_id")
        .single();

      if (notice?.firm_id) {
        await supabase.rpc("increment_paid_drafts", { p_firm_id: notice.firm_id });
        // If RPC doesn't exist, fall back to direct update (less safe under concurrency)
        // await supabase.from("firms").update({ total_paid_drafts: { increment: 1 } }).eq("id", notice.firm_id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
