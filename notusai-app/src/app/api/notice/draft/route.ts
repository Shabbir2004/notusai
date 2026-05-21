import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateNoticeDraft } from "@/lib/anthropic";
import { sendDraftReadyEmail } from "@/lib/resend";
import { createPaymentLink } from "@/lib/razorpay";
import { classifyTier } from "@/lib/utils";

export const maxDuration = 60;

interface DraftRequest {
  clientId?: string;
  clientName: string;
  gstin?: string;
  noticeType: string;
  period?: string;
  deadline?: string;
  demandAmount?: string;
  keyFacts?: string;
  tone?: string;
  noticeText: string;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json()) as DraftRequest;
  if (!body.clientName || !body.noticeText || !body.noticeType) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm found." }, { status: 400 });

  const { data: firm } = await supabase.from("firms").select("free_credits_remaining, name").eq("id", profile.firm_id).single();
  const isFree = (firm?.free_credits_remaining ?? 0) > 0;

  const demandRupees = parseInt((body.demandAmount || "0").replace(/[₹,\s]/g, ""), 10) || 0;
  const { tier, price } = classifyTier(demandRupees, body.noticeType);

  const { data: notice, error: insertErr } = await supabase
    .from("notices")
    .insert({
      firm_id: profile.firm_id,
      user_id: user.id,
      client_id: body.clientId || null,
      client_name: undefined, // Not in notices table; we use client_id ref
      notice_type: body.noticeType,
      period: body.period,
      deadline: body.deadline || null,
      demand_amount: demandRupees || null,
      key_facts: body.keyFacts,
      tone: body.tone || "balanced",
      notice_text: body.noticeText,
      tier,
      price_inr: price,
      was_free: isFree,
      status: "drafting",
    })
    .select()
    .single();

  if (insertErr || !notice) {
    return NextResponse.json({ error: insertErr?.message || "Could not create notice" }, { status: 500 });
  }

  try {
    const result = await generateNoticeDraft({
      clientName: body.clientName,
      gstin: body.gstin,
      noticeType: body.noticeType,
      period: body.period,
      noticeDate: body.deadline,
      demandAmount: body.demandAmount,
      noticeText: body.noticeText,
      keyFacts: body.keyFacts,
      tone: body.tone || "balanced",
      premium: tier === "complex",
    });

    let paymentLinkUrl: string | null = null;
    if (!isFree) {
      try {
        const link = await createPaymentLink({
          amountInr: price,
          description: `NotusAI - ${body.noticeType} reply for ${body.clientName}`,
          customerName: firm?.name || user.email!.split("@")[0],
          customerEmail: user.email!,
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

    if (isFree) {
      await supabase
        .from("firms")
        .update({ free_credits_remaining: (firm?.free_credits_remaining ?? 1) - 1 })
        .eq("id", profile.firm_id);
    }

    try {
      await sendDraftReadyEmail({
        to: user.email!,
        clientName: body.clientName,
        draftLink: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/notices/${notice.id}`,
        paymentLink: paymentLinkUrl,
        isFree,
        priceInr: price,
      });
    } catch (e) {
      console.error("Email send failed:", e);
    }

    return NextResponse.json({ noticeId: notice.id, status: "ready" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("notices").update({ status: "failed", failure_reason: msg }).eq("id", notice.id);
    return NextResponse.json({ error: "Drafting failed: " + msg, noticeId: notice.id }, { status: 500 });
  }
}
