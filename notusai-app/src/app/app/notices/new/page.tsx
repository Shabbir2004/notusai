import { NoticeForm } from "@/components/NoticeForm";
import { createClient } from "@/lib/supabase/server";

export default async function NewNoticePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  const { data: firm } = await supabase.from("firms").select("free_credits_remaining").eq("id", profile?.firm_id || "").single();
  const { data: clients } = await supabase.from("clients").select("id, name");

  const hasFreeCredit = (firm?.free_credits_remaining ?? 0) > 0;

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">New notice</h1>
      <p className="mt-2 text-ink-600">
        {hasFreeCredit
          ? `✨ ${firm.free_credits_remaining} free credit(s) remaining. Paste the notice text and answer 6 quick questions.`
          : "From this draft, pricing kicks in — ₹999/₹1,999/₹4,999 based on complexity. You'll get a payment link after the draft is ready."}
      </p>

      <div className="mt-8 max-w-2xl rounded-xl border border-ink-200 bg-white p-6">
        <NoticeForm clients={clients || []} />
      </div>
    </div>
  );
}
