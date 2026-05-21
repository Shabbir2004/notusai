/**
 * Unified LLM provider abstraction.
 *
 * Supports:
 *   - Google Gemini (FREE tier — 1,500 requests/day, 1M tokens/day)
 *   - Anthropic Claude (paid — better legal reasoning but $$ per call)
 *
 * Auto-detects which to use:
 *   1. If LLM_PROVIDER=gemini in env → Gemini
 *   2. If LLM_PROVIDER=anthropic in env → Anthropic
 *   3. Else: prefer Gemini (free) if GEMINI_API_KEY set
 *   4. Else: Anthropic if ANTHROPIC_API_KEY set
 *   5. Else: throw
 */

import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "gemini";

const MODELS = {
  anthropic: {
    default: "claude-sonnet-4-6",
    premium: "claude-opus-4-7",
  },
  gemini: {
    default: "gemini-2.5-flash",
    premium: "gemini-2.5-pro",
  },
};

// Pricing in USD per 1M tokens (approx)
const PRICING = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.5-pro": { input: 1.25, output: 5.0 },
};

const USD_TO_INR = 84;

// ============================================
// Public API
// ============================================

export interface GenerateTextOpts {
  system: string;
  user: string;
  premium?: boolean;
  provider?: Provider;
  maxTokens?: number;
  jsonMode?: boolean;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  provider: Provider;
  tokensInput: number;
  tokensOutput: number;
  costInr: number;
}

export async function generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
  const provider = detectProvider(opts.provider);
  if (provider === "anthropic") return generateWithAnthropic(opts);
  return generateWithGemini(opts);
}

export function getActiveProvider(): { provider: Provider | null; model: string; reason: string } {
  try {
    const p = detectProvider();
    return {
      provider: p,
      model: MODELS[p].default,
      reason: process.env.LLM_PROVIDER
        ? `forced by LLM_PROVIDER=${process.env.LLM_PROVIDER}`
        : p === "gemini"
          ? "auto (Gemini free tier preferred)"
          : "auto (only Anthropic key available)",
    };
  } catch {
    return { provider: null, model: "none", reason: "no provider configured" };
  }
}

// ============================================
// Provider detection
// ============================================

function detectProvider(override?: Provider): Provider {
  if (override) return override;

  const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
  if (envProvider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY not set");
    }
    return "anthropic";
  }
  if (envProvider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("LLM_PROVIDER=gemini but GEMINI_API_KEY not set");
    }
    return "gemini";
  }

  // Auto-detect: prefer Gemini if available (free tier wins)
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";

  throw new Error(
    "No LLM provider configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env.local",
  );
}

// ============================================
// Anthropic implementation
// ============================================

async function generateWithAnthropic(opts: GenerateTextOpts): Promise<GenerateTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const client = new Anthropic({ apiKey });
  const model = opts.premium ? MODELS.anthropic.premium : MODELS.anthropic.default;

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens || 4096,
    temperature: opts.temperature,
    system: [
      {
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: opts.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const rates = PRICING[model as keyof typeof PRICING];
  const costUsd =
    (response.usage.input_tokens / 1_000_000) * rates.input +
    (response.usage.output_tokens / 1_000_000) * rates.output;
  const costInr = Math.round(costUsd * USD_TO_INR * 100) / 100;

  return {
    text,
    model,
    provider: "anthropic",
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    costInr,
  };
}

// ============================================
// Gemini implementation
// ============================================

async function generateWithGemini(opts: GenerateTextOpts): Promise<GenerateTextResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = opts.premium ? MODELS.gemini.premium : MODELS.gemini.default;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens || 4096,
    },
  };

  if (opts.jsonMode) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("\n") || "";

  const usage = data.usageMetadata || {};
  const rates = PRICING[model as keyof typeof PRICING];
  const costUsd =
    ((usage.promptTokenCount || 0) / 1_000_000) * rates.input +
    ((usage.candidatesTokenCount || 0) / 1_000_000) * rates.output;
  const costInr = Math.round(costUsd * USD_TO_INR * 100) / 100;

  return {
    text,
    model,
    provider: "gemini",
    tokensInput: usage.promptTokenCount || 0,
    tokensOutput: usage.candidatesTokenCount || 0,
    costInr,
  };
}
