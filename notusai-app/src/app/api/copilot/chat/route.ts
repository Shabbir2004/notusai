import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { COPILOT_SYSTEM } from "@/lib/prompts/copilot-system";
import { generateText, getActiveProvider } from "@/lib/llm";

export const maxDuration = 60;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "query_clients",
    description: "Search clients by name, industry, status, or other filters.",
    input_schema: {
      type: "object",
      properties: {
        name_contains: { type: "string" },
        status: { type: "string", enum: ["active", "dormant", "offboarded"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "query_notices",
    description: "Search notices by client, type, status, deadline, or demand amount.",
    input_schema: {
      type: "object",
      properties: {
        notice_type: { type: "string" },
        status: { type: "string" },
        min_demand_inr: { type: "number" },
        deadline_within_days: { type: "number" },
      },
    },
  },
  {
    name: "query_anomalies",
    description: "Find open anomalies (pre-filing risks).",
    input_schema: {
      type: "object",
      properties: {
        min_severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        min_notice_probability: { type: "number" },
      },
    },
  },
  {
    name: "query_mismatches",
    description: "Find open GSTR-2B mismatches.",
    input_schema: {
      type: "object",
      properties: {
        min_amount: { type: "number" },
        severity: { type: "string" },
      },
    },
  },
  {
    name: "query_vendors",
    description: "Find vendors by risk profile.",
    input_schema: {
      type: "object",
      properties: {
        min_risk_score: { type: "number" },
        max_filing_punctuality: { type: "number" },
      },
    },
  },
];

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const { messages } = (await req.json()) as { messages: IncomingMessage[] };

  const active = getActiveProvider();

  // Anthropic supports rich multi-turn tool use; Gemini gets a single-shot fallback
  if (active.provider === "anthropic") {
    return runAnthropicToolLoop(profile.firm_id, messages);
  }

  return runGeminiSimple(profile.firm_id, messages);
}

// ============================================
// Anthropic tool-use loop (rich)
// ============================================
async function runAnthropicToolLoop(firmId: string, messages: IncomingMessage[]) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let turn = 0; turn < 5; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: COPILOT_SYSTEM,
      tools: TOOLS,
      messages: apiMessages,
    });

    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      return NextResponse.json({ reply: text });
    }

    if (response.stop_reason === "tool_use") {
      apiMessages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(firmId, block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }
      }
      apiMessages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  return NextResponse.json({ reply: "I couldn't complete this query. Try simpler phrasing." });
}

// ============================================
// Gemini single-shot with pre-fetched DB snapshot
// ============================================
async function runGeminiSimple(firmId: string, messages: IncomingMessage[]) {
  const supabase = createServiceClient();

  // Pre-fetch a compact snapshot of firm data — give all to Gemini in one shot
  const [clientsRes, noticesRes, anomaliesRes, mismatchesRes, vendorsRes] = await Promise.all([
    supabase.from("clients").select("id, name, industry, status").eq("firm_id", firmId).limit(50),
    supabase
      .from("notices")
      .select("id, notice_type, status, deadline, demand_amount, clients(name)")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("anomalies")
      .select("id, type, severity, notice_probability, message, clients(name)")
      .eq("firm_id", firmId)
      .eq("status", "open")
      .limit(20),
    supabase
      .from("mismatches")
      .select("id, vendor_name, amount, severity, status")
      .eq("firm_id", firmId)
      .eq("status", "open")
      .limit(20),
    supabase
      .from("vendors")
      .select("id, name, risk_score, filing_punctuality, late_filings_count")
      .eq("firm_id", firmId)
      .order("risk_score", { ascending: false })
      .limit(20),
  ]);

  const context = `
[YOUR FIRM'S CURRENT DATA — use this to answer the user's question]

CLIENTS (${clientsRes.data?.length || 0}):
${JSON.stringify(clientsRes.data || [], null, 2)}

RECENT NOTICES (${noticesRes.data?.length || 0}):
${JSON.stringify(noticesRes.data || [], null, 2)}

OPEN ANOMALIES (${anomaliesRes.data?.length || 0}):
${JSON.stringify(anomaliesRes.data || [], null, 2)}

OPEN MISMATCHES (${mismatchesRes.data?.length || 0}):
${JSON.stringify(mismatchesRes.data || [], null, 2)}

TOP VENDORS BY RISK (${vendorsRes.data?.length || 0}):
${JSON.stringify(vendorsRes.data || [], null, 2)}
`;

  const conversationText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const result = await generateText({
    system: COPILOT_SYSTEM + "\n\n" + context,
    user: conversationText,
    maxTokens: 2048,
    temperature: 0.4,
  });

  return NextResponse.json({ reply: result.text });
}

// ============================================
// Tool execution (Anthropic path)
// ============================================
async function executeTool(
  firmId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const supabase = createServiceClient();

  try {
    switch (name) {
      case "query_clients": {
        let q = supabase.from("clients").select("id, name, industry, status").eq("firm_id", firmId);
        if (args.name_contains) q = q.ilike("name", `%${args.name_contains}%`);
        if (args.status) q = q.eq("status", args.status as string);
        q = q.limit((args.limit as number) || 50);
        const { data } = await q;
        return data || [];
      }
      case "query_notices": {
        let q = supabase
          .from("notices")
          .select("id, client_id, notice_type, status, deadline, demand_amount, clients(name)")
          .eq("firm_id", firmId);
        if (args.notice_type) q = q.eq("notice_type", args.notice_type as string);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.min_demand_inr) q = q.gte("demand_amount", args.min_demand_inr as number);
        if (args.deadline_within_days) {
          const future = new Date(Date.now() + (args.deadline_within_days as number) * 86400000).toISOString().slice(0, 10);
          q = q.lte("deadline", future);
        }
        q = q.limit(50);
        const { data } = await q;
        return data || [];
      }
      case "query_anomalies": {
        let q = supabase
          .from("anomalies")
          .select("id, client_id, type, severity, notice_probability, message, clients(name)")
          .eq("firm_id", firmId)
          .eq("status", "open");
        if (args.min_severity) {
          const order = ["low", "medium", "high", "critical"];
          const min = args.min_severity as string;
          const allowed = order.slice(order.indexOf(min));
          q = q.in("severity", allowed);
        }
        if (args.min_notice_probability) q = q.gte("notice_probability", args.min_notice_probability as number);
        q = q.limit(50);
        const { data } = await q;
        return data || [];
      }
      case "query_mismatches": {
        let q = supabase
          .from("mismatches")
          .select("id, vendor_name, amount, severity, ai_suggestion")
          .eq("firm_id", firmId)
          .eq("status", "open");
        if (args.min_amount) q = q.gte("amount", args.min_amount as number);
        if (args.severity) q = q.eq("severity", args.severity as string);
        q = q.limit(50);
        const { data } = await q;
        return data || [];
      }
      case "query_vendors": {
        let q = supabase
          .from("vendors")
          .select("id, name, gstin, risk_score, filing_punctuality, late_filings_count")
          .eq("firm_id", firmId);
        if (args.min_risk_score) q = q.gte("risk_score", args.min_risk_score as number);
        if (args.max_filing_punctuality) q = q.lte("filing_punctuality", args.max_filing_punctuality as number);
        q = q.order("risk_score", { ascending: false }).limit(30);
        const { data } = await q;
        return data || [];
      }
      default:
        return { error: "Unknown tool" };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
