import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: firm } = await supabase.from("firms").select("*").eq("id", profile?.firm_id || "").single();
  const { data: gmailIntegrations } = await supabase
    .from("email_integrations")
    .select("*")
    .eq("firm_id", profile?.firm_id || "")
    .eq("status", "active");

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {params.gmail_connected && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          ✓ Gmail connected. The system will check your inbox every 5 minutes for incoming GST notices and auto-draft replies.
        </div>
      )}
      {params.gmail_error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          ❌ Gmail connection failed: {params.gmail_error}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-bold">Firm</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Firm name" value={firm?.name || "—"} />
          <Row label="Plan" value={firm?.plan || "free"} />
          <Row label="Free credits remaining" value={String(firm?.free_credits_remaining ?? 0)} />
          <Row label="Paid drafts" value={String(firm?.total_paid_drafts || 0)} />
        </dl>
      </section>

      {/* GMAIL INTEGRATION — the magic */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">📧 Auto-detect notices from email</h2>
            <p className="mt-2 text-sm text-blue-900">
              Connect your Gmail. NotusAI checks your inbox every 5 minutes for incoming GST notices
              (ASMT-10, DRC-01, SCN, etc.), automatically reads the PDF, drafts a reply, and notifies you when ready.
            </p>
            <p className="mt-2 text-sm text-blue-900">
              <strong>No more manual paste. No more chasing notices in your inbox.</strong>
            </p>
          </div>
        </div>

        <div className="mt-4">
          {gmailIntegrations && gmailIntegrations.length > 0 ? (
            <div>
              <div className="rounded-lg border border-blue-300 bg-white p-4">
                {gmailIntegrations.map((g) => (
                  <div key={g.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{g.email_address}</div>
                      <div className="text-xs text-ink-500">
                        ✓ Active · Last sync: {g.last_sync_at ? new Date(g.last_sync_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"}
                      </div>
                    </div>
                    <form action="/api/integrations/gmail/disconnect" method="POST">
                      <input type="hidden" name="id" value={g.id} />
                      <button type="submit" className="rounded-md px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
                        Disconnect
                      </button>
                    </form>
                  </div>
                ))}
              </div>
              <Link
                href="/api/integrations/gmail/connect"
                className="mt-3 inline-block rounded-md text-sm text-blue-700 hover:text-blue-900"
              >
                + Connect another Gmail
              </Link>
            </div>
          ) : (
            <Link
              href="/api/integrations/gmail/connect"
              className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
            >
              Connect Gmail →
            </Link>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-bold">Other integrations</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <Integration label="Anthropic Claude" connected={!!process.env.ANTHROPIC_API_KEY} required />
          <Integration label="Gemini Vision (PDF OCR)" connected={!!process.env.GEMINI_API_KEY} required />
          <Integration label="Supabase DB" connected={!!process.env.NEXT_PUBLIC_SUPABASE_URL} required />
          <Integration label="Resend (email)" connected={!!process.env.RESEND_API_KEY} required />
          <Integration label="Razorpay (payments)" connected={!!process.env.RAZORPAY_KEY_ID} required />
          <Integration label="GSTN (Cygnet GSP)" connected={!!process.env.CYGNET_GSP_URL} note="Uses mock data if absent" />
          <Integration label="WhatsApp Business Cloud" connected={!!process.env.WHATSAPP_ACCESS_TOKEN} note="For vendor follow-up agents" />
          <Integration label="Exotel (voice)" connected={!!process.env.EXOTEL_ACCOUNT_SID} note="For voice escalation" />
          <Integration label="Sarvam (Indic TTS)" connected={!!process.env.SARVAM_API_KEY} note="For regional voice" />
          <Integration label="Google OAuth (Gmail)" connected={!!process.env.GOOGLE_CLIENT_ID} note="For Gmail integration" />
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink-100 pb-2">
      <dt className="text-ink-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Integration({ label, connected, required, note }: {
  label: string; connected: boolean; required?: boolean; note?: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <div>
        <span className="font-medium">{label}</span>
        {required && <span className="ml-2 text-xs text-red-600">required</span>}
        {note && <span className="ml-2 text-xs text-ink-500">— {note}</span>}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${connected ? "bg-green-100 text-green-900" : "bg-ink-100 text-ink-500"}`}>
        {connected ? "✓ Connected" : "Not configured"}
      </span>
    </li>
  );
}
