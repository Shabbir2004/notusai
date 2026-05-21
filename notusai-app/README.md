# NotusAI

The AI tax-litigation OS for Indian CA firms. Full Next.js app implementing all 10 modules from NOTUS_PLAN.md.

## Quick start

```powershell
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open http://localhost:3000

## Documentation

- **[SETUP.md](./SETUP.md)** — step-by-step deployment guide (90 min from zero to live)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — system design, module mapping, tech decisions
- **[docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md)** — every external service, with mocks for absent ones
- **[docs/ROADMAP.md](./docs/ROADMAP.md)** — 12-month deployment & growth roadmap

## What's built (10 modules)

1. **Onboarding** — Magic-link auth, auto-firm creation, multi-tenant
2. **Smart Inbox** — Morning dashboard at `/app` (urgent notices, anomalies, mismatches)
3. **Notice Engine** — Draft ASMT-10 / DRC-01 / Section 73/74 SCN replies with CGST citations + case law
4. **Reconciliation Hub** — GSTR-2B vs Tally CSV books matching with fuzzy logic
5. **Anomaly Engine** — Pre-filing notice probability scoring with recommended actions
6. **Litigation OS** — Full state machine: received → drafted → filed → DRC-01 → DRC-07 → appeals → tribunal
7. **Vendor Agent** — Autonomous email → WhatsApp → voice escalation for missing GSTR-1 entries
8. **Client Portal** — Signed-link portal for end clients (read-only view of their notices)
9. **CA Copilot** — Natural language assistant with tool use (queries firm data)
10. **AI Tax Research** — Harvey-grade Indian tax research with citations

## Stack

- **Next.js 15** (App Router, TypeScript, React 19)
- **Supabase** — Postgres + Auth + Storage + Realtime
- **Anthropic Claude** — Sonnet 4.6 default, Opus 4.7 for complex/research
- **Tailwind CSS** — design system
- **Razorpay** — payments (Indian UPI/cards/netbanking)
- **Resend** — transactional email
- **WhatsApp Cloud API** — vendor + client outreach
- **Exotel + Sarvam** — voice agent in 12 Indian languages
- **Vercel** — hosting (free tier)

## Cost summary

| Stage | Monthly cost |
|---|---|
| Dev / local | ₹0 |
| MVP launch | ₹2,000 (one-time Anthropic credit) |
| First 100 customers | ₹3K-8K LLM cost monthly (paid by revenue) |
| 1,000 customers | ₹40K-80K LLM, Supabase Pro, custom domain |

## Project structure

```
notusai-app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Landing
│   │   ├── login/                    # Magic-link auth
│   │   ├── auth/callback/            # Auth flow
│   │   ├── app/                      # Authenticated workspace
│   │   │   ├── page.tsx              # Smart Inbox
│   │   │   ├── clients/              # Client management
│   │   │   ├── notices/              # Notice drafting + viewing
│   │   │   ├── litigation/           # Litigation calendar
│   │   │   ├── reconciliation/       # GSTR-2B recon
│   │   │   ├── anomalies/            # Pre-filing risk alerts
│   │   │   ├── vendors/              # Vendor risk profiling
│   │   │   ├── copilot/              # Conversational AI
│   │   │   ├── research/             # AI tax research
│   │   │   └── settings/             # Firm + integration config
│   │   ├── client-portal/[token]/    # Client-facing portal
│   │   └── api/                      # Backend API routes
│   │       ├── notice/draft/
│   │       ├── reconciliation/run/
│   │       ├── anomaly/score/
│   │       ├── vendor/followup/
│   │       ├── copilot/chat/
│   │       ├── research/search/
│   │       ├── client/create/
│   │       └── webhooks/razorpay/
│   ├── components/                   # Reusable UI
│   └── lib/
│       ├── prompts/                  # AI prompts (your IP)
│       ├── integrations/             # GSTN, Tally, WhatsApp, Voice
│       ├── agents/                   # Multi-step workflows
│       ├── reconciliation/           # Matching engine
│       ├── anomaly/                  # Rule-based anomaly detector
│       ├── litigation/               # State machine + hearing brief
│       └── supabase/                 # DB + auth clients
├── supabase/
│   └── schema.sql                    # Full multi-tenant schema (19 tables, RLS)
└── docs/                             # Architecture, integrations, roadmap
```

## The most important files (in order of importance)

1. **`src/lib/prompts/notice-drafter.ts`** — the system prompt for notice replies. Iterate this every week. This is your moat.
2. **`supabase/schema.sql`** — multi-tenant database with all RLS policies.
3. **`src/app/api/notice/draft/route.ts`** — the magic moment: notice in → draft out.
4. **`src/lib/agents/vendor-followup.ts`** — multi-channel autonomous escalation.
5. **`src/lib/reconciliation/matcher.ts`** — fuzzy GSTR-2B vs books matching.

## License

Private — do not redistribute. Internal IP of NotusAI / Shabbir Abbas.
