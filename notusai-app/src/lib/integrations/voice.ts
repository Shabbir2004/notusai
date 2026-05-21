/**
 * Voice agent integration: Exotel (telephony) + Sarvam AI (Indic TTS/ASR).
 *
 * Use cases:
 * - Outbound calls to vendors for GSTR-1 reconciliation follow-ups (in Hindi/regional)
 * - Outbound calls to clients for document chase
 *
 * To use:
 * 1. Sign up at exotel.com — KYC required (~2 days for approval)
 * 2. Get virtual number, API key, account SID
 * 3. Sign up at sarvam.ai for TTS/STT (or ElevenLabs as fallback)
 * 4. Set env: EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_VIRTUAL_NUMBER, SARVAM_API_KEY
 *
 * Cost: ~₹0.50-2 per minute outbound depending on circle.
 */

const USE_MOCK = !process.env.EXOTEL_ACCOUNT_SID;

export interface VoiceCallResult {
  callSid: string;
  status: string;
  duration?: number;
  transcript?: string;
  recordingUrl?: string;
}

export async function placeOutboundCall(opts: {
  toPhone: string;
  script: string; // The text that will be spoken
  language: "hi" | "en" | "mr" | "ta" | "gu" | "te" | "bn" | "kn";
  recordCall?: boolean;
}): Promise<VoiceCallResult> {
  if (USE_MOCK) {
    console.log("[MOCK Voice] Call to", opts.toPhone, "Lang:", opts.language, "Script:", opts.script.slice(0, 100));
    return {
      callSid: "mock-call-" + Date.now(),
      status: "completed",
      duration: 45,
      transcript: "[mock transcript] vendor confirmed they will amend GSTR-1 by Friday",
    };
  }

  const sid = process.env.EXOTEL_ACCOUNT_SID!;
  const key = process.env.EXOTEL_API_KEY!;
  const token = process.env.EXOTEL_API_TOKEN!;
  const fromNumber = process.env.EXOTEL_VIRTUAL_NUMBER!;

  // First generate TTS audio from script using Sarvam
  // (This is simplified — in production, host audio on R2/CDN and pass URL to Exotel)
  const _ttsUrl = await synthesizeSpeech(opts.script, opts.language);

  // Then trigger Exotel call
  const auth = Buffer.from(`${key}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: opts.toPhone,
        CallerId: fromNumber,
        // In production, use TwiML-style flow with the TTS audio URL
        Record: opts.recordCall ? "true" : "false",
      }),
    },
  );

  if (!res.ok) throw new Error(`Exotel error: ${res.status}`);
  const data = await res.json();
  return {
    callSid: data.Call?.Sid || "unknown",
    status: data.Call?.Status || "queued",
  };
}

async function synthesizeSpeech(text: string, language: string): Promise<string> {
  // Sarvam AI TTS — multilingual Indic
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    console.log("[MOCK Sarvam TTS]", text.slice(0, 60));
    return "https://mock-tts-url/audio.mp3";
  }
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "API-Subscription-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: mapToSarvamLang(language),
      speaker: "meera",
      pace: 1.0,
    }),
  });
  if (!res.ok) throw new Error(`Sarvam TTS error: ${res.status}`);
  const data = await res.json();
  return data.audios?.[0] || "";
}

function mapToSarvamLang(l: string): string {
  const map: Record<string, string> = {
    hi: "hi-IN",
    en: "en-IN",
    mr: "mr-IN",
    ta: "ta-IN",
    gu: "gu-IN",
    te: "te-IN",
    bn: "bn-IN",
    kn: "kn-IN",
  };
  return map[l] || "hi-IN";
}
