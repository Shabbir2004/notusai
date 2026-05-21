/**
 * WhatsApp webhook (Meta Cloud API).
 *
 * Setup at Meta Developer Console:
 *  - Webhook URL: https://your-app.vercel.app/api/webhooks/whatsapp
 *  - Verify token: same as WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
 *  - Subscribe to: messages
 *
 * Verifies inbound, parses messages, hands off to whatsapp-reactor agent.
 */

import { NextResponse } from "next/server";
import { parseWhatsappWebhook } from "@/lib/integrations/whatsapp";
import { reactToInboundWhatsapp } from "@/lib/agents/whatsapp-reactor";

// Verification challenge (one-time setup from Meta)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verify_token mismatch" }, { status: 403 });
}

// Inbound message handler
export async function POST(req: Request) {
  const body = await req.json();
  const messages = parseWhatsappWebhook(body);

  for (const msg of messages) {
    if (msg.type !== "text" || !msg.text) continue;
    try {
      await reactToInboundWhatsapp({
        fromPhone: msg.from,
        body: msg.text,
        messageId: `wa-${Date.now()}-${msg.from}`,
      });
    } catch (e) {
      console.error("WhatsApp reactor error:", e);
    }
  }

  return NextResponse.json({ received: true });
}
