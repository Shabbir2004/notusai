import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/llm";
import { RESEARCH_SYSTEM } from "@/lib/prompts/research-system";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const { query } = (await req.json()) as { query: string };
  if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const result = await generateText({
    system: RESEARCH_SYSTEM,
    user: query,
    premium: true,
    maxTokens: 3000,
    temperature: 0.3,
  });

  await supabase.from("research_queries").insert({
    firm_id: profile.firm_id,
    user_id: user.id,
    query,
    answer_md: result.text,
  });

  return NextResponse.json({ answer: result.text });
}
