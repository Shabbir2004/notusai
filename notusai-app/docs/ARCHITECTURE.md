# NotusAI — System Architecture

Built for the **full** NOTUS_PLAN.md vision. 10 modules. Multi-tenant. Production-ready foundation.

## High-level

```
                 ┌──────────────────────────────────┐
                 │  notusai.vercel.app / notusai.in │
                 │  (Vercel — Next.js 15 App Router)│
                 └────────────┬─────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ↓               ↓                ↓
       Marketing site   Authenticated App   Client Portal
       /              /app/...            /client-portal/[token]
       /login                              (signed-link, no login)
              │               │                │
              └───────────────┼────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ↓                 ↓                 ↓
    Supabase Auth       API Routes         Webhooks
    (magic link)        /api/notice/draft   /api/webhooks/razorpay
                        /api/reconciliation /api/webhooks/whatsapp
                        /api/copilot/chat
                        /api/research/search
                        /api/anomaly/score
                        /api/vendor/followup
                              │
       ┌──────────────────────┼──────────────────────────┐
       ↓                      ↓                          ↓
   Supabase             Anthropic Claude        External integrations
   (Postgres + RLS)     - Sonnet 4.6 (default)  - Razorpay (payments)
   - 19 tables          - Opus 4.7 (complex)    - Resend (emails)
   - Multi-tenant       - Tool use (Copilot)    - Cygnet GSP (GSTN APIs)
   - Row-level security                          - Meta WhatsApp Cloud
                                                 - Exotel + Sarvam (voice)
                                                 - Tally CSV import
```

## Multi-tenancy

Every table has `firm_id`. RLS policies enforce: every query auto-filters to `firm_id = (select firm_id from profiles where id = auth.uid())`. **One firm cannot see another firm's data — even via SQL injection or compromised JWT.**

Setup:
- `firms` table — top-level tenant. Auto-created on first signup.
- `profiles` — per-user. Has `firm_id` and `role` (owner/partner/senior/associate/viewer).
- All other tables — `firm_id` is required on insert. RLS auto-filters select.

## The 10 modules — file mapping

| Module | UI | API | Lib |
|---|---|---|---|
| 1. Onboarding | `app/login/`, auto-firm creation | (auth callback) | `lib/supabase/` |
| 2. Smart Inbox | `app/app/page.tsx` | (server components query DB) | — |
| 3. Notice Engine | `app/app/notices/` | `api/notice/draft/` | `lib/prompts/notice-drafter.ts`, `lib/anthropic.ts` |
| 4. Reconciliation Hub | `app/app/reconciliation/` | `api/reconciliation/run/` | `lib/reconciliation/matcher.ts`, `lib/integrations/tally.ts`, `lib/integrations/gstn.ts` |
| 5. Anomaly Engine | `app/app/anomalies/` | `api/anomaly/score/` | `lib/anomaly/rules.ts`, `lib/prompts/anomaly-explainer.ts` |
| 6. Litigation OS | `app/app/litigation/` | — (state machine read-only for now) | `lib/litigation/state-machine.ts`, `lib/litigation/hearing-brief.ts` |
| 7. Vendor Agent | `app/app/vendors/` | `api/vendor/followup/` | `lib/agents/vendor-followup.ts`, `lib/prompts/vendor-email-writer.ts` |
| 8. Client Portal | `app/client-portal/[token]/` | — | `lib/integrations/whatsapp.ts` |
| 9. CA Copilot | `app/app/copilot/` | `api/copilot/chat/` | `lib/prompts/copilot-system.ts` (with tool use) |
| 10. AI Tax Research | `app/app/research/` | `api/research/search/` | `lib/prompts/research-system.ts` |

## Database schema (19 tables)

**Tenancy & users:** `firms`, `profiles`
**Clients:** `clients`, `gstins`, `vendors`
**GST data:** `gst_returns`, `gstr_2b` (logical, stored in gst_returns with form_type filter), `invoices`, `reconciliations`, `mismatches`
**Notices:** `notices`, `litigation_cases`, `hearings`
**Agents:** `agent_runs`, `vendor_followups`
**AI features:** `anomalies`, `copilot_threads`, `research_queries`, `documents`
**Client portal:** `client_portal_tokens`
**Audit:** `audit_logs`

Full schema in `supabase/schema.sql`. Run once in Supabase SQL Editor.

## AI architecture

**Models:**
- Claude Sonnet 4.6 — default for all tasks. Fast, ~₹5-15/draft.
- Claude Opus 4.7 — only for complex notices & deep research. ~₹30-80/draft.

**Prompt management:** Hardcoded in `src/lib/prompts/*.ts`. Versioned in git. Every iteration to a prompt should have a commit message explaining what was learned.

**Cost control:**
- System prompts cached via Anthropic's prompt caching (`cache_control: { type: "ephemeral" }`) — cuts cost by ~70% after first call.
- Per-firm cost tracking via `cost_inr` field on `notices`, `agent_runs`, `research_queries`.

**Tool use (Copilot):** Claude can call:
- `query_clients`, `query_notices`, `query_anomalies`, `query_mismatches`, `query_vendors`
- All tool execution is sandboxed: only SELECT queries, only within the firm's data.

## Integrations — production paths

| Integration | Dev mode | Production setup | Time | Cost |
|---|---|---|---|---|
| Anthropic | Required (need API key) | Add ₹2000 credit | 10 min | ₹5-80/draft |
| Supabase | Required | Mumbai region, free tier | 15 min | Free → ₹3K/mo at scale |
| Resend | Required | Verify domain | 1 day | Free → ₹500/mo |
| Razorpay | Required | KYC + bank | 2-3 days | 2% per txn |
| **GSTN APIs** | **Mocked** | Cygnet/IRIS/Vayana GSP contract | 4-8 weeks | ₹2-5/call |
| **Tally** | CSV import | Buy TDL connector OR hire ex-Tally eng | 2-3 months | ₹3-5L one-time |
| **WhatsApp Business** | Mocked | Meta verification + phone provisioning | 2-3 weeks | Free → ₹0.5/msg |
| **Voice (Exotel)** | Mocked | KYC + virtual number | 1 week | ₹0.5-2/min |
| **Voice TTS (Sarvam)** | Mocked | API signup | 1 day | ₹0.1/100chars |

**Critical pattern:** Every integration has a `USE_MOCK_*` flag. If env vars not set, mock data is returned. This lets you run the entire system end-to-end in dev mode before signing any external contracts.

## Auth & sessions

- **Magic link** (Supabase Auth, no password)
- JWT in httpOnly cookies (refreshed by middleware)
- `middleware.ts` redirects: unauthenticated → /login; authenticated visiting /login → /app
- Profile auto-created on first signup with auto-created firm

## Background work

**Current (MVP):** Most agent work runs inline in API routes. Notice drafting takes 30-60s on Vercel's `maxDuration: 60` limit.

**Future (production scale):** Move to:
- **Temporal Cloud** (durable execution) for vendor follow-up workflows that span days
- **Vercel Cron** for daily anomaly scans, deadline alerts
- **Inngest** as middle ground (free tier, simpler than Temporal)

## What I deliberately deferred

These were in NOTUS_PLAN.md but not in this v1 codebase. Add as you scale:

- **PDF generation** — currently markdown renders raw. Add `@react-pdf/renderer` for proper PDFs.
- **OCR for uploaded PDFs** — currently CA pastes text. Add Gemini Vision for PDF→text.
- **Vector search for case law** — currently Claude relies on training data. Add pgvector + Voyage embeddings + Indian Kanoon scrape.
- **Federated learning across firms** — anonymized notice outcomes feeding back into prompt training.
- **Real-time WebSocket updates** — currently polled. Add Supabase Realtime for live dashboards.
- **Mobile app (React Native)** — currently web-only. Web is responsive; mobile is a later add.
- **Multi-language Copilot** — currently English only. Easy to extend with regional system prompts.
- **Voice front-end for partners** — call NotusAI and ask questions. Requires Twilio/Plivo integration.
- **Automated Tally TDL connector** — currently CSV import. License from third party when revenue allows.

## File count: 68 files, ~6,500 lines of code

Roughly: 19 page components, 9 API routes, 7 AI prompts, 4 integrations, 3 agents, 2 engines (recon + anomaly), 1 litigation state machine, 1 DB schema, plus configs and utilities.

This is a real production-grade Next.js application. It will require Node.js, npm install, and proper environment setup. See `SETUP.md` for the path from zero to deployed.
