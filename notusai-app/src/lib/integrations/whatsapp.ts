/**
 * WhatsApp Business Cloud API (Meta).
 *
 * To use:
 * 1. Create a Meta Business account (business.facebook.com)
 * 2. Set up WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
 * 3. Verify your business (KYC)
 * 4. Create a phone number ID and get permanent access token
 * 5. Set env vars: WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_WEBHOOK_SECRET
 *
 * Costs: free first 1,000 conversations/month, then ~₹0.5-1 per service message.
 */

const USE_MOCK = !process.env.WHATSAPP_ACCESS_TOKEN;

export async function sendWhatsappText(opts: {
  toPhone: string; // e.g., "919876543210"
  text: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (USE_MOCK) {
    console.log("[MOCK WhatsApp] To:", opts.toPhone, "Message:", opts.text.slice(0, 100));
    return { success: true, messageId: "mock-" + Date.now() };
  }

  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    return { success: false, error: "WhatsApp not configured" };
  }

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.toPhone,
      type: "text",
      text: { body: opts.text },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return { success: false, error };
  }
  const data = await res.json();
  return { success: true, messageId: data.messages?.[0]?.id };
}

export async function sendWhatsappDocument(opts: {
  toPhone: string;
  documentUrl: string;
  filename: string;
  caption?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (USE_MOCK) {
    console.log("[MOCK WhatsApp Doc] To:", opts.toPhone, "Doc:", opts.filename);
    return { success: true, messageId: "mock-doc-" + Date.now() };
  }

  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.toPhone,
      type: "document",
      document: { link: opts.documentUrl, filename: opts.filename, caption: opts.caption },
    }),
  });
  if (!res.ok) return { success: false, error: await res.text() };
  const data = await res.json();
  return { success: true, messageId: data.messages?.[0]?.id };
}

export interface WhatsappWebhookMessage {
  from: string;
  text?: string;
  type: "text" | "image" | "document" | "audio";
  mediaUrl?: string;
  timestamp: number;
}

export function parseWhatsappWebhook(body: unknown): WhatsappWebhookMessage[] {
  const msgs: WhatsappWebhookMessage[] = [];
  try {
    const entries = (body as { entry?: Array<{ changes?: Array<{ value?: { messages?: unknown[] } }> }> }).entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const m of messages as Array<Record<string, unknown>>) {
          const type = (m.type as string) || "text";
          msgs.push({
            from: m.from as string,
            text: (m.text as { body?: string })?.body,
            type: type as WhatsappWebhookMessage["type"],
            mediaUrl: (m.image as { link?: string })?.link || (m.document as { link?: string })?.link,
            timestamp: parseInt((m.timestamp as string) || "0", 10) * 1000,
          });
        }
      }
    }
  } catch (e) {
    console.error("Failed to parse WhatsApp webhook:", e);
  }
  return msgs;
}
