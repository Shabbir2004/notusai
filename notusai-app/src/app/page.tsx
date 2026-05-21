import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-sm font-extrabold text-ink-50">N</div>
            <span className="text-lg font-bold">NotusAI</span>
          </div>
          <Link
            href={user ? "/app" : "/login"}
            className="rounded-md bg-ink-900 px-3 py-1.5 text-sm text-ink-50 hover:opacity-85"
          >
            {user ? "Open app" : "Sign in"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6">
        <section className="py-20">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            The AI tax-litigation OS for Indian CA firms.
          </h1>
          <p className="mt-5 text-lg text-ink-600">
            Draft notice replies, run GSTR-2B reconciliation, predict notice probability before filing,
            auto-chase non-compliant vendors, manage every litigation case end-to-end —
            all in one workspace. <strong>3 free drafts. ₹999/notice after.</strong>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={user ? "/app" : "/login"}
              className="inline-block rounded-lg bg-ink-900 px-6 py-3 font-semibold text-ink-50 hover:opacity-85"
            >
              {user ? "Open app →" : "Get 3 free drafts →"}
            </Link>
            <Link
              href="#features"
              className="inline-block rounded-lg border border-ink-300 px-6 py-3 font-semibold"
            >
              See features
            </Link>
          </div>
        </section>

        <section id="features" className="border-t border-ink-200 py-16">
          <h2 className="mb-8 text-2xl font-bold">10 modules. One workspace.</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Feature icon="📥" title="Smart Inbox" body="Morning dashboard — urgent notices, anomalies, mismatches, hearings — all in one view." />
            <Feature icon="📄" title="Notice Engine" body="Drafts ASMT-10, DRC-01, Section 73/74 SCN replies with CGST citations + case law in < 5 min." />
            <Feature icon="🔁" title="Reconciliation Hub" body="GSTR-2B vs Tally books matching with fuzzy logic. ITC at risk surfaced instantly." />
            <Feature icon="🔮" title="Anomaly Engine" body="Pre-filing probability score. Predict notices before they happen. Recommend corrective actions." />
            <Feature icon="⚖️" title="Litigation OS" body="Full lifecycle: notice → reply → DRC-01 → DRC-07 → appeals → tribunal. Hearing brief auto-generated." />
            <Feature icon="🤖" title="Vendor Agent" body="Autonomous follow-up: email → WhatsApp → voice call in regional language. Multi-step state machine." />
            <Feature icon="📞" title="Client Portal" body="Signed-link portal for clients to upload docs, see status. WhatsApp auto-chase before deadlines." />
            <Feature icon="💬" title="CA Copilot" body="Natural language: 'show all clients with mismatch over ₹1L.' Full firm data access via tool use." />
            <Feature icon="🔍" title="AI Tax Research" body="Harvey-grade for Indian tax. CGST/IGST Acts, CBIC circulars, HC/CESTAT/SC rulings. Cited." />
            <Feature icon="📊" title="Vendor Risk" body="Cross-firm risk scoring. Filing punctuality, late-filing patterns. Switch out bad vendors." />
          </div>
        </section>

        <section className="my-16 rounded-xl bg-ink-900 p-12 text-center text-ink-50">
          <h2 className="text-2xl font-bold">3 free drafts. Then ₹999/notice.</h2>
          <p className="mt-3 text-ink-300">No subscription. No commitment. No credit card.</p>
          <Link
            href={user ? "/app" : "/login"}
            className="mt-6 inline-block rounded-lg bg-ink-50 px-6 py-3 font-semibold text-ink-900"
          >
            {user ? "Open app →" : "Get started free →"}
          </Link>
        </section>
      </main>

      <footer className="border-t border-ink-200 py-8 text-center text-sm text-ink-500">
        NotusAI · Built in India for Indian CAs
      </footer>
    </>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-2 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-ink-600">{body}</p>
    </div>
  );
}
