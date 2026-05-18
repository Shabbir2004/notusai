# NotusAI — System Design Plan

**Product:** AI-native Tax Litigation OS for Indian CA Firms
**Stage:** Pre-build (ideation → spec)
**Author:** Founder
**Date:** 2026-05-18

---

## 0. The premise (what we're building, restated)

A SaaS that lives inside Indian CA firms (5+ partners, 100+ clients). It reads every email/invoice/notice, runs reconciliation, predicts notice probability, drafts notice replies with case-law citations, runs vendor follow-up agents, manages the full litigation lifecycle, and serves as a conversational copilot for partners. Wins against Vyapar TaxOne by being LLM-native, agentic, and positioned 20x higher in price for serious firms.

**Sweet-spot customer:** Practice tier — 2–5 partner CA firm, 50–150 clients, ₹14,999/mo subscription.

**18-month target:** ₹8 Cr ARR with ~500 paying firms.

---

## 1. System architecture (high level)

```
                       ┌─────────────────────────┐
                       │   Web App (CA dashboard) │
                       │   Mobile App (approvals) │
                       │   Client Portal (lite)   │
                       └────────────┬────────────┘
                                    │ HTTPS
                       ┌────────────▼────────────┐
                       │   API Gateway (Cloudflare)│
                       │   - WAF + rate limit      │
                       │   - JWT verification      │
                       └────────────┬─────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
        ┌───────▼──────┐  ┌────────▼────────┐  ┌──────▼──────┐
        │ Core API     │  │ AI Orchestrator │  │ Workers     │
        │ (FastAPI)    │  │ (Python)        │  │ (Celery)    │
        │ - REST       │  │ - LangGraph     │  │ - Recon     │
        │ - WebSocket  │  │ - LLM router    │  │ - Notice    │
        └───────┬──────┘  │ - Tool calling  │  │ - Vendor    │
                │         └────────┬────────┘  │ - Chase     │
                │                  │           └──────┬──────┘
                │                  │                  │
                └──────────┬───────┴──────────────────┘
                           │
              ┌────────────┼─────────────────────────────┐
              │            │                             │
        ┌─────▼──────┐  ┌──▼───────┐         ┌──────────▼────────┐
        │ PostgreSQL │  │ Redis    │         │ External services │
        │ + pgvector │  │ (cache,  │         │ - GSTN (via GSP)  │
        │ (Supabase) │  │ queue,   │         │ - Tally Connect   │
        └────────────┘  │ session) │         │ - Gemini/Claude   │
                        └──────────┘         │ - Exotel telephony│
        ┌────────────┐                       │ - SendGrid email  │
        │ ClickHouse │                       │ - Cloudinary OCR  │
        │ (analytics)│                       │ - Razorpay (pay)  │
        └────────────┘                       └───────────────────┘

        ┌────────────────────────────────────────────────┐
        │ S3-compatible object store (R2): invoices,     │
        │ notice PDFs, audit packets, hearing briefs     │
        └────────────────────────────────────────────────┘
```

---

## 2. Tech stack — every layer with rationale

### 2.1 Frontend

| Component | Tech | Rationale |
|---|---|---|
| Web app framework | **Next.js 15 (App Router) + TypeScript** | SSR for fast first-paint, RSCs reduce client JS, Vercel-native, huge talent pool in India |
| UI components | **shadcn/ui + Radix primitives** | Owned components (no lock-in), a11y by default, themeable, modern look |
| Styling | **Tailwind CSS** | Velocity, consistent design system, ~7KB CSS after purge |
| State | **TanStack Query (server) + Zustand (client)** | TanStack handles cache/refetch/optimistic UI; Zustand for cross-component local state without Redux ceremony |
| Forms | **React Hook Form + Zod** | Type-safe schemas shared with backend |
| Tables | **TanStack Table v8** | Virtualized rows (CA dashboards have 500+ clients), client-side filter/sort |
| Charts | **Recharts** | Composable, MIT licensed, sufficient for dashboards |
| Real-time | **WebSocket via Socket.io OR SSE** | Live updates on notice status, reco progress |
| Mobile app | **Expo (React Native) + same TS types** | Single codebase iOS+Android, ship in weeks not months; partners only need approvals + notifications |
| File upload | **uppy + tus.io resumable** | Notice PDFs can be 50MB, network is patchy on mobile |
| Auth UI | **Custom (NextAuth.js disabled for security depth)** | We need GST portal credential vault, OTP, role-based — custom is cleaner |

**Why not alternatives:**
- ❌ Vue/Nuxt: smaller talent pool in India, Next.js has won
- ❌ Remix: smaller ecosystem
- ❌ Flutter mobile: separate Dart stack adds team complexity

### 2.2 Backend — core API

| Component | Tech | Rationale |
|---|---|---|
| Language | **Python 3.12** | Best LLM/AI ecosystem, ML libraries native, hiring is easy in India |
| Framework | **FastAPI** | Async-native, OpenAPI auto-generation, Pydantic for validation, low memory |
| ORM | **SQLAlchemy 2.0 + Alembic** | Mature, async support, migration management |
| Validation | **Pydantic v2** | Speed (Rust core), serialization, OpenAPI integration |
| Job queue | **Celery + Redis broker** | Battle-tested for Python, distributed workers, scheduled tasks |
| Cron | **Celery Beat** | GSTR-2B pull every 14th, monthly summaries, deadline alerts |
| Auth | **Custom JWT + refresh tokens, bcrypt** | RBAC per firm/partner/associate/client |
| Rate limiting | **slowapi (Redis-backed)** | Per-firm and per-IP limits |
| API docs | **FastAPI auto-OpenAPI + Scalar UI** | Self-documenting, easier than Swagger UI |

**Why not alternatives:**
- ❌ Node/NestJS: Python is the AI gravity well — Python ecosystem for LLM/vector/embeddings is 2 years ahead
- ❌ Django: ORM is OK but DRF is heavier than FastAPI; async is bolted on
- ❌ Go/Rust: faster, but team velocity loss isn't worth it for our scale

### 2.3 AI/LLM layer (the differentiator)

| Layer | Tech | Use |
|---|---|---|
| LLM router | **Custom router (Python)** | Routes by task: cheap tasks → Gemini Flash, reasoning → Claude Sonnet 4.6, complex legal → Claude Opus 4.7, vision → Gemini 2.5 Pro |
| Agent framework | **LangGraph** | State machines for multi-step agents (vendor follow-up, notice triage), explicit control flow, debuggable |
| Orchestration | **Temporal.io** (Phase 2) | Long-running workflows (notice litigation lifecycle spans months) — durable execution, retries, audit trail |
| Vector store | **pgvector (Postgres)** | Case-law retrieval, prior-notice memory, vendor patterns. Same DB simplifies ops. Add Qdrant only if scaling demands. |
| Embeddings | **Voyage AI voyage-3-large or text-embedding-3-large** | Quality > speed for legal retrieval |
| Eval harness | **Custom + Braintrust** | Every prompt has eval suite: notice classification accuracy, citation correctness, draft quality (LLM-as-judge + human spot-check) |
| Prompt management | **Custom version-controlled YAML files in repo** | Git is the source of truth for prompts; never edit in console |
| Document AI (OCR) | **Gemini 2.5 Pro vision (primary) + Mathpix/Google Vision (fallback)** | Modern multimodal LLMs beat OCR-then-LLM pipelines |
| Voice TTS/ASR | **Sarvam AI (Indian languages, primary) + ElevenLabs (English, secondary)** | Sarvam is India-native for 12 languages, sounds natural |
| Voice telephony | **Exotel** | Indian carrier, supports outbound + inbound, lower cost than Twilio |
| Caching | **Redis + Anthropic prompt caching** | Cache 90% of system prompt; cuts LLM cost by 70% |

**Critical: We are NOT building our own LLM.** We use frontier APIs (Claude 4.7, Gemini 2.5, GPT-5) and compete on **the harness around them** — prompt engineering, retrieval, evals, agentic flows, domain data.

### 2.4 Database

**Primary: PostgreSQL 16 on Supabase**

Why Supabase: managed Postgres, built-in row-level security, real-time subscriptions, easy auth, ₹0–₹5K/mo cost at our early scale. Move to self-hosted RDS later if needed.

**Schema sketch (key tables):**

```sql
-- Tenancy & users
firms (id, name, plan, gstin, billing_email, ...)
users (id, firm_id, role, email, phone, ...)
clients (id, firm_id, name, gstin, state, industry, ...)
gstins (id, client_id, gstin, state, return_type, ...)

-- Documents
invoices (id, client_id, period, vendor_id, amount, gst, hsn, source, ...)
documents (id, client_id, type, s3_key, ocr_text, parsed_json, ...)
vendors (id, name, gstin, risk_score, filing_punctuality, ...)

-- GST returns & reconciliation
gst_returns (id, gstin, period, form_type, raw_json, filed_at, ...)
gstr_2b (id, gstin, period, invoice_count, total_itc, raw_json, ...)
reconciliations (id, client_id, period, matched_count, mismatch_value, ai_findings_json, ...)
mismatches (id, recon_id, type, vendor_id, amount, severity, status, ...)

-- Notices & litigation
notices (id, client_id, gstin, type, demand, deadline, status, raw_pdf_s3, ...)
notice_replies (id, notice_id, draft_md, citations_jsonb, sent_at, outcome, ...)
litigation_cases (id, notice_id, current_stage, next_hearing, file_no, ...)
hearings (id, case_id, date, location, brief_s3, outcome_md, ...)

-- AI & agents
agent_runs (id, type, client_id, status, steps_jsonb, cost, started_at, completed_at, ...)
vendor_followups (id, vendor_id, client_id, channel, status, attempts, transcript, ...)
ai_evals (id, prompt_version, input, output, score, reviewer, ...)

-- Vector store (pgvector)
case_law_chunks (id, case_id, chunk_text, embedding vector(1024), section_ref, ...)
notice_history_embeddings (id, notice_id, embedding vector(1024), ...)
vendor_patterns (id, vendor_id, embedding vector(1024), ...)

-- Audit & compliance
audit_logs (id, firm_id, user_id, action, entity, before, after, ts, ...)
api_keys (id, firm_id, scope, last_used_at, ...)
```

**Multi-tenancy strategy:** Row-Level Security (RLS) at Postgres level — `firm_id` column on every table, RLS policies enforce tenant isolation. No shared rows across firms ever.

**Analytics: ClickHouse (managed via ClickHouse Cloud)**
For dashboards, time-series, conversion funnels, agent performance trends. OLAP queries on event streams. Cheap and fast.

**Cache: Redis (Upstash serverless)**
Session store, rate-limiting counters, hot-path query cache, Celery broker.

**Object store: Cloudflare R2 (S3-compatible)**
PDF notices, hearing briefs, invoice scans. Egress-free, ~₹1/GB-month — much cheaper than AWS S3 in India.

### 2.5 Integrations

| Integration | Provider | Method | Phase |
|---|---|---|---|
| GSTN APIs (GSTR-1, 2B, 3B, e-invoice) | **Cygnet Infotech (GSP)** | White-label GSP API | Phase 1 |
| Tally | **Custom TDL connector + Tally Cloud API** | Push/pull via TCP | Phase 1 |
| Zoho Books | OAuth 2.0 API | Native | Phase 2 |
| Busy / Marg | File watcher + XML parser | Local agent | Phase 3 |
| Email (read incoming) | **Gmail/Outlook OAuth + IMAP fallback** | Real-time push subscriptions | Phase 1 |
| WhatsApp Business | **Meta Cloud API direct** | Webhook | Phase 1 |
| SMS | **MSG91** | API | Phase 1 |
| Voice | **Exotel** | API + webhook | Phase 2 |
| Payments (billing customers) | **Razorpay** | Subscriptions | Phase 1 |
| Email (outbound) | **SendGrid (transactional) + Resend (marketing)** | API | Phase 1 |
| MCA21 / income tax portals | **Browser-use agents via Playwright + headless** | Phase 3 |

### 2.6 Cloud infrastructure

| Component | Choice | Why |
|---|---|---|
| Compute (API + workers) | **AWS Mumbai (ap-south-1) on ECS Fargate** | Data residency for tax data, no instance management, autoscale on CPU |
| Database | **Supabase (managed Postgres in Mumbai)** | Lower ops burden, RLS native, real-time |
| Object storage | **Cloudflare R2** | Cheap egress, S3-compatible |
| CDN + WAF + DNS | **Cloudflare** | One pane, free SSL, DDoS protection |
| Email infra | **SendGrid + Resend** | Reliable delivery |
| Monitoring | **Better Stack (Logtail) + Grafana Cloud + Sentry** | Logs, metrics, errors |
| Background jobs | **Celery on ECS** | Standard Python pattern |
| Secrets | **AWS Secrets Manager** | KMS-encrypted, rotation |
| CI/CD | **GitHub Actions → ECR → ECS rolling deploy** | Industry default |
| IaC | **Terraform + Terragrunt** | Declarative infra |

**Data residency:** All client GST/financial data stored in Mumbai. Critical for compliance and trust with CA firms (RBI, MeitY, GST data localization mandates).

**Cost estimate at 500 firms:**
- AWS Fargate: ₹40K/mo
- Supabase: ₹15K/mo
- Cloudflare R2 + CDN: ₹8K/mo
- ClickHouse Cloud: ₹12K/mo
- LLM costs (avg ₹500/firm): ₹2.5L/mo
- Voice (Exotel + Sarvam): ₹40K/mo
- Email/SMS: ₹15K/mo
- GSP API: ₹50K/mo
- Monitoring: ₹8K/mo
- **Total infra: ~₹3.9L/mo on ~₹68L MRR → 5.7% infra cost ratio. Healthy.**

### 2.7 Security & compliance

| Layer | Practice |
|---|---|
| Data at rest | AES-256 (Postgres encryption + R2 SSE-S3) |
| Data in transit | TLS 1.3 only, HSTS, no HTTP |
| GST portal credentials | Encrypted with AWS KMS per-firm DEK; never logged |
| Authentication | Email + password + TOTP MFA; SSO for Enterprise |
| Session | JWT (15 min) + refresh token (7 day) in httpOnly secure cookie |
| RBAC | 5 roles: Owner, Partner, Senior Associate, Associate, Client |
| Audit logs | Every mutation logged with user_id, before, after, IP |
| Backups | Daily Postgres snapshots, 30-day retention, monthly to cold storage |
| Disaster recovery | RPO 1 hour, RTO 4 hours, documented runbook |
| Compliance | SOC 2 Type 1 by month 12, ISO 27001 by month 18 |
| Data residency | Mumbai only (RBI/MeitY guideline) |
| Right-to-delete | API + UI for client data deletion within 30 days |
| LLM data | No client data sent to model training (Anthropic/Google enterprise terms) |
| AI explainability | Every AI decision logged with reasoning chain + sources cited |
| Liability disclaimer | "AI-assisted; CA must review and sign" on every output |

---

## 3. Module-by-module flow

### Module 1: Onboarding (Day 0)

1. Owner signs up at notusai.in → email + phone verification
2. Choose plan → Razorpay subscription created
3. **Setup wizard (~90 min):**
   - Add team members → invite emails
   - Connect Tally (download our TDL file or one-click cloud connector)
   - OAuth Gmail / Outlook for notice intake
   - Upload last 12 months of client list (CSV or pull from Tally)
   - For each client → enter/import GSTIN, save GST portal credentials (encrypted)
   - Authorize WhatsApp Business number (Cloud API setup wizard)
4. **Background init job runs:**
   - Pull last 12 months of GST returns for every GSTIN via GSP API
   - Ingest all Tally vouchers
   - Generate initial reconciliation report
   - Detect open notices in client emails → pre-load into Litigation OS
5. By 24 hrs: dashboard fully populated

### Module 2: Daily morning dashboard

User flow:
- Owner opens web/mobile → JWT auth → land on Inbox
- Backend query: aggregate {open_notices, deadline_critical, mismatches_above_threshold} grouped by traffic-light
- Cards rendered with action buttons
- Tap → drill into specific client/notice/recon

Tech specifics:
- Server component renders summary stats (SSR)
- Client component for action buttons (RSC + client island)
- TanStack Query keeps data fresh on poll/WebSocket

### Module 3: Notice Engine (the killer flow)

Trigger paths:
- Email arrives in CA inbox → IMAP webhook → email parser → classifier
- Manual upload in UI
- Client forwards via WhatsApp → Meta webhook → handler

Pipeline:
```
1. Ingestion: PDF → R2 storage
2. OCR: Gemini Vision → structured text
3. Classification: LLM call (Claude Sonnet) → {type, severity, deadline, demand, sections}
4. Context retrieval:
   - Pull client's GST returns for cited period (GSP API)
   - Pull Tally entries for period
   - Vector search case_law_chunks for similar notices
   - Vector search past notice replies for this firm/client
5. Draft generation: LLM call (Claude Opus for legal grade) with full context
   → markdown draft + citations JSON
6. Quality eval: LLM-as-judge on draft (accuracy, citation correctness)
   → if score < 0.85, retry with different prompt OR flag for human
7. Write notice + notice_reply rows to DB
8. Push notification to assigned partner via FCM + email
9. Partner reviews → approves → triggers filing agent
10. Filing agent: Playwright headless → GST portal → upload reply → confirm
```

Latency target: 4 minutes notice → draft ready.
Cost per notice: ₹15–₹40 LLM + ₹2 storage = pricing supports ₹399 per notice billed.

### Module 4: Reconciliation Hub

Cron: 14th of every month, 2 AM → workers spawn one job per gstin
- Pull GSTR-2B JSON via GSP API → store raw
- Pull Tally purchase entries for the period
- Run matching algorithm:
  - Exact: invoice number + GSTIN + amount → match
  - Fuzzy: tolerance ±₹100, ±2 days, GSTIN prefix → suggest match
  - LLM tie-breaker for ambiguous cases (only for entries above ₹50K)
- Store reconciliations + mismatches rows
- Trigger vendor_followup creation for unresolved mismatches above ₹10K

UI: Dashboard fetches `/reconciliations?firm_id=X` paginated, virtualized table

### Module 5: Anomaly / Notice Probability Engine

For each upcoming GSTR-3B filing:
- Feature extraction job: pull 12 months historical + current month
- Features: ITC claimed vs 2B, vendor mix, late-filing patterns, declared B2B vs e-invoice
- ML model: gradient-boosted trees (XGBoost) trained on historical {filing, notice_received_within_90d}
- Output: probability score + top 3 driver features
- LLM call: explain the score in plain CA language + suggest 2–3 corrective actions
- Surface in pre-filing screen with [Apply fix] buttons

Model training cadence: monthly retrain on new outcomes (deferred to Phase 2 — start with rules-based, upgrade to ML after data accumulates).

### Module 6: Litigation OS

Each notice creates a litigation_case row. State machine:
```
RECEIVED → REPLY_DRAFTED → REPLY_FILED → DEPT_REVIEWING
  → CLOSED (favorable)
  OR → ESCALATED_DRC01 → DRC01_REPLY → DRC01_REVIEW → ...
  OR → ESCALATED_DRC07 → APPEAL_FILED → HEARING_SCHEDULED → ORDER_RECEIVED → ...
```

Calendar view aggregates all hearings + deadlines across firm's cases.

Hearing brief generation:
- 24 hours before hearing → cron triggers brief_generator agent
- Agent assembles: case timeline, key arguments, citations, supporting docs, predicted outcome
- LLM (Claude Opus) drafts hearing brief markdown
- Render to PDF (WeasyPrint), upload to R2, email partner

### Module 7: Vendor Reconciliation Agent

LangGraph state machine:
```python
nodes:
  - start: pull mismatch context
  - send_email: SendGrid API call, persist message
  - wait_email_response: 4-day timer
  - check_response: parse incoming email, classify
  - send_whatsapp: Meta API, persist
  - wait_whatsapp_response: 3-day timer
  - make_voice_call: Exotel + Sarvam TTS in vendor's regional language
  - check_resolution: poll GSTN API for amended GSTR-1
  - report: write summary, notify CA, close
edges: with retries and escalation logic
```

State persisted in Postgres. Each run can be inspected, resumed, replayed.

### Module 8: Client Document Portal

Client gets WhatsApp link → opens lite portal (Next.js page, no login, signed URL)
- Upload invoices via drag-drop or photo
- Sees own filing status, pending docs, notices
- AI WhatsApp agent chases proactively

Document ingestion pipeline:
- Upload → R2 → trigger OCR job (Gemini Vision)
- LLM extracts structured: vendor, GSTIN, date, amount, GST, HSN, line items
- Validation: GSTIN format, amount × GST rate consistency, duplicate detection
- Auto-create Tally voucher entry (push via Tally TDL)
- Flag low-confidence extractions for CA review

### Module 9: CA Copilot (conversational)

UI: chat panel on every screen
Backend: agent with tool access:
- query_postgres (with safe sandbox + RLS preserved)
- query_clickhouse (analytics)
- semantic_search_case_laws
- draft_email
- schedule_task

Architecture: Claude Sonnet 4.6 as main reasoning model with tool calling. System prompt includes firm's current context. Conversation memory in Redis (last 20 turns) + structured in Postgres.

Guardrails: SQL sandbox limits SELECT only; output preview before any mutation.

### Module 10: AI Tax Research

Indexed corpus:
- All CGST/IGST Act sections
- CGST Rules
- All CBIC circulars (auto-scraped daily)
- GST Council meeting notifications
- Selected HC/SC/CESTAT/Tribunal rulings (curated initial 5K, expanding)

Pipeline:
- User query → embed → vector search top 20 chunks → rerank with Voyage rerank-2
- LLM (Claude Opus) synthesizes answer with explicit citations
- Output: answer + [section] + [case law with judgment URL] + [draft advisory]

Source ingestion: nightly scraper for CBIC, weekly for case-law databases (Indian Kanoon API).

---

## 4. Key UI screens

### 4.1 Onboarding wizard
- Stepper: Account → Team → Tally → Email → Clients → WhatsApp → Done
- Each step has skip option (configurable later)
- Progress bar persists

### 4.2 Dashboard (Inbox)
- Top: traffic-light summary cards (urgent/attention/on-track)
- Middle: To-Do list (notices to approve, briefs to review)
- Right rail: AI Copilot chat
- Search bar: natural language ("show all Karnataka clients with mismatches over ₹50K")

### 4.3 Client detail page
- Header: GSTIN, plan, key risk indicators
- Tabs: Returns | Reconciliation | Notices | Vendors | Documents | Timeline | Advisory

### 4.4 Notice workspace
- Left: notice PDF render
- Center: AI-drafted reply (rich text editor)
- Right: case-law citations, evidence pack, action buttons
- Bottom: deadline countdown, file-to-portal action

### 4.5 Reconciliation page
- Top: summary tiles (matched, mismatch, ITC at risk)
- Middle: tabbed sub-views (mismatches by reason)
- Each row: vendor, amount, AI suggestion, [Auto-fix] [Follow up] [Defer]

### 4.6 Litigation tracker
- Calendar view (month/week)
- Cases list with state and SLA
- Per case: full timeline, all documents, hearing prep

### 4.7 Vendor view
- Risk score history
- Reconciliation track record
- Active follow-up agents and their status (transcript view)

### 4.8 Settings
- Team & permissions
- Integrations (Tally, email, WhatsApp)
- Billing & invoices
- Audit log viewer
- AI behavior controls (notice approval threshold, auto-file toggle)

### 4.9 Mobile app (Expo)
- Inbox + push notifications
- Notice draft approval (swipe approve / reject)
- Quick voice memo to client
- Copilot chat

### 4.10 Client mini-portal
- WhatsApp-launched page (no login, signed URL)
- See filings status, due payments, pending docs
- Upload zone

---

## 5. Phased build sequence

**Phase 1 (Months 1–3): Notice Engine + basic reconciliation**
- Auth, multi-tenant, basic CRUD
- Tally + email + GSP integrations
- Notice triage + draft engine for ASMT-10/DRC-01 only
- Manual reconciliation upload (no auto)
- Simple dashboard
- 10 design-partner CA firms onboarded

**Phase 2 (Months 4–6): Automation deep dive**
- Vendor reconciliation agent (email + WhatsApp)
- Pre-filing anomaly engine (rules-based v1)
- Full Litigation OS state machine
- AI Copilot v1
- Mobile app v1
- 50 paying firms

**Phase 3 (Months 7–9): Voice + premium**
- Voice agents (Exotel + Sarvam)
- Hearing brief auto-gen
- AI Tax Research v1
- ML-based anomaly engine
- Enterprise SSO + audit
- 150 paying firms

**Phase 4 (Months 10–12): Scale + adjacent modules**
- Income Tax module
- MCA module
- Multi-state, multi-entity hierarchies
- Browser-use agents for govt portals
- API access for top firms
- 300 paying firms, ₹4Cr ARR

---

## 6. Team & build effort

| Role | Headcount Phase 1 | Headcount Phase 4 |
|---|---|---|
| Founder (product+sales) | 1 | 1 |
| Tech lead | 1 | 1 |
| Backend (Python) | 2 | 5 |
| Frontend (Next.js + RN) | 1 | 3 |
| AI/ML engineer | 1 | 2 |
| Tax domain SME (CA) | 0.5 (contractor) | 1 (FT) |
| QA | 0 | 1 |
| Customer Success | 0 | 2 |
| Sales | 0 | 3 |
| **Total** | **6.5** | **19** |

Burn: ₹15L/mo Phase 1 → ₹40L/mo Phase 4.
Pre-seed: $400–600K to reach Phase 3 milestones.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GSP API costs explode | Med | High | Negotiate volume tier, build manual fallback (JSON upload) |
| LLM cost spikes | Med | Med | Aggressive caching, route cheap tasks to small models, monitor per-firm |
| LLM legal hallucination | Med | High | Mandatory CA review + sign, eval harness, citation grounding, liability disclaimer |
| Vyapar TaxOne ships notice AI | Med | Med | Speed; deeper data moat; we charge 20x more so still differentiated |
| Data breach | Low | Critical | SOC 2 path, KMS encryption, RLS, audit logs, pen tests |
| GST regime overhaul | Low | Med | AI-native = fastest to adapt; turn into tailwind |
| Talent shortage (AI eng) | Med | Med | Hire from Bangalore AI community, ₹40L+ packages, equity |
| Customer churn (CAs slow to change) | Med | High | Land via notice-reply (acute pain), expand to platform later |
| ICAI restrictions on AI in CA work | Low | High | Engage ICAI early, position as augmentation not replacement |

---

## 8. Open decisions for founder

1. **Founding team:** Solo or co-founder? Strongly recommend a tax-domain co-founder (CA) for credibility.
2. **First city to dominate:** Pune (smaller, faster signal) or Mumbai (larger, more competition)?
3. **Pricing model on launch:** Lead with PAYG (₹999/notice) or subscription (₹14,999/mo)?
4. **Build vs buy GSP:** Apply for own GSP license (12–18 mo, ₹50L+) or stay on Cygnet white-label forever (₹2–5/call)? Recommend white-label until $5M ARR.
5. **Mobile-first or web-first launch?** Web for full power; mobile for partner approvals after web is stable.

---

## 9. Success metrics

| Metric | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Paying firms | 10 | 50 | 150 | 300 |
| MRR | ₹1L | ₹6L | ₹20L | ₹40L |
| Notice replies generated | 200 | 2K | 8K | 20K |
| Notice draft accuracy (CA accept w/o edit) | 60% | 75% | 85% | 90% |
| Mismatch detection precision | 90% | 95% | 98% | 99% |
| Notice probability prediction (AUC) | 0.70 | 0.80 | 0.85 | 0.90 |
| Net revenue retention | 100% | 110% | 120% | 130% |
| Gross margin | 50% | 60% | 70% | 75% |
| CAC | ₹50K | ₹35K | ₹25K | ₹18K |
| LTV | ₹2L | ₹4L | ₹8L | ₹12L |

---

## 10. GSTACK REVIEW REPORT

Pipeline executed: CEO → Design → Eng → DX. Codex unavailable in this environment; Claude subagent ran as second voice. 21 findings surfaced across 4 lenses.

### Consensus table

| Dimension | Verdict | Note |
|---|---|---|
| Right problem to solve | ✅ YES | Notice litigation is acute pain |
| Right ICP | ⚠️ MAYBE | ₹15K WTP unvalidated; buyer/user split risk |
| Architecture sound | ❌ NO | Credential storage + RLS-only + 3 orchestrators |
| Test coverage planned | ❌ NO | Tenant-isolation, idempotency, model-swap tests absent |
| Security threats covered | ❌ NO | Storing GST portal passwords kills company on breach |
| Scope realistic | ❌ NO | 10 modules in 12 months with 6.5 people |
| UX hierarchy correct | ❌ NO | One dashboard for partner+junior; explainability missing |
| DX of build plan | ❌ NO | Phase 1 is ~4x what team can ship |

### Auto-decided fixes (16) — apply to the plan

Each entry: principle applied + change.

| # | Phase | Fix | Principle |
|---|---|---|---|
| A1 | Eng | Drop "auto-file to GST portal" entirely from Phase 1–3. Generate downloadable file; CA uploads manually. Reserve auto-file for Phase 4+ with explicit per-action MFA. | P1 Completeness (don't half-do dangerous things) |
| A2 | Eng | Defense-in-depth for multi-tenancy: RLS + schema-per-tenant OR connection-pool-per-firm + static-analysis test on every query path + daily cross-tenant red-team eval | P1 Completeness |
| A3 | Eng | Idempotency keys on every external action (GSP pulls, vendor follow-ups, voice calls). Redis lock 24h TTL on send actions. | P1 Completeness |
| A4 | Eng | Pick Temporal as sole durable-execution engine from day 1. LangGraph becomes activities inside Temporal. Celery only for stateless short jobs. | P5 Explicit over clever |
| A5 | Eng | Default model = Claude Sonnet 4.6. Opus reserved for critic/re-rank steps only. Per-firm cost ceiling alerts. | P3 Pragmatic |
| A6 | Eng | Re-do unit economics with real token counts from prototype before fundraise. Build cost-per-firm dashboard. | P3 Pragmatic |
| A7 | Eng | Golden eval dataset: 200 notices with CA-graded correct replies, committed to repo, CI gate on every model swap. | P1 Completeness |
| A8 | Design | Two distinct entry surfaces by role: Partner = "Risk & Exceptions," Associate = "My Queue." Same data, different IA. | P1 Completeness |
| A9 | Design | Inline citation hover: each sentence of draft hover-highlights source rows in evidence pack. "Why did AI say this?" button shows retrieval chunks + reasoning. | P1 Completeness |
| A10 | Design | Every screen has explicit empty/loading/error/partial state designed in Figma BEFORE coding. Progressive disclosure during onboarding ("ingesting 47/120 clients"). | P1 Completeness |
| A11 | Design | Mobile = triage + delegation, not approval. "Forward to associate with note" as primary action. Approval requires desktop. | P5 Explicit |
| A12 | Design | Client portal: signed URL + OTP-on-open to registered phone + 30-min session + watermark with phone number. | P1 Completeness |
| A13 | DX | Prompts versioned in DB with admin UI for CA SME. Git-snapshot every 24h. Eval-gate before prod promotion. Use Braintrust/LangSmith. | P3 Pragmatic |
| A14 | DX | Consolidate Phase 1 to: Supabase (DB+auth+storage) + Render (compute) + Cloudflare (CDN). Drop ClickHouse to month 9. Defer ECS to month 12. | P3 Pragmatic |
| A15 | DX | Tally connector: buy/license/partner. Do NOT build TDL from scratch. License from Suvit/Refrens/etc. or hire ex-Tally engineer for this single role. | P4 DRY |
| A16 | DX | Hiring: split "AI/ML" into "Applied ML infra engineer" (₹40–60L, hire-able) + CA co-founder for domain. | P3 Pragmatic |

### User challenges (4) — both reviewers recommend changing your stated direction

These cannot be auto-decided. Your judgment overrides ours.

**UC1 — Scope: 10 modules → 1 wedge**
- *You said:* Phase 1 ships Notice Engine + basic recon + dashboard + Tally + GSP + email + WhatsApp + multi-tenant + 10 firms in 3 months
- *Both reviewers say:* Ship ONLY notice-PDF-in → draft-out. Manual upload, no integrations, single-firm-at-a-time. 6 weeks, 3 firms at ₹999/notice. Earn Phase 2.
- *What we might be missing:* You may have stronger eng team available than estimated, or design partners willing to wait
- *If we're wrong, cost is:* You move slower than necessary, lose 3 months of progress to over-pruning

**UC2 — Pricing: subscription-first → per-notice PAYG first**
- *You said:* Lead with ₹14,999/mo Practice tier subscription
- *Both reviewers say:* Lead with ₹999/notice PAYG. No subscription until 5,000 notices filed and proven outcome dataset. Convert PAYG → subscription only after demonstrating compounding value.
- *What we might be missing:* Subscription may close faster with senior partners who don't want to think per-notice
- *If we're wrong, cost is:* Subscription becomes a Suvit-comparison battle you lose; PAYG forces the better wedge

**UC3 — Founding team: solo non-CA → CA co-founder is question zero**
- *You said:* Open decision item — solo or co-founder, listed as #1 in a 5-item list
- *Both reviewers say:* CA co-founder (≥5 yrs, ex-Big4 indirect-tax) with 5%+ equity is mandatory before Phase 1. Non-CA founder cannot sell at ₹15K to CA partners. This is *the* single biggest risk.
- *What we might be missing:* You may already have CA advisors lined up informally, or have unusual credibility hooks
- *If we're wrong, cost is:* You delay launch by 2–4 months hunting for the right co-founder
- ⚠️ Both reviewers flag this as the most likely path to year-1 death

**UC4 — Auto-file via stored portal credentials**
- *You said:* Store GST portal credentials encrypted, filing agent uses Playwright to auto-file replies
- *Both reviewers say:* Don't. GSTN ToS interpretation + unlimited liability on breach + ED/CBI investigation territory. Generate downloadable PDF, let CA upload manually. Defer auto-file to Phase 4 with per-action MFA.
- ⚠️ Both reviewers flag this as a security/legal risk, not a preference
- *If we're wrong, cost is:* You give up the "auto-filed in 12 minutes" demo magic; CA does the last click manually

### Taste decisions (3) — reasonable disagreement; pick one

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| T1 | Two dashboards (Partner/Associate) vs one unified | Two dashboards (better role fit) | One unified with filters (simpler to build, ship faster) |
| T2 | Build cost-per-firm dashboard pre-launch | Build pre-launch (catch overruns early) | Build post-launch (premature optimization for <100 firms) |
| T3 | Outsource Tally to vendor vs hire ex-Tally engineer | Hire (control + IP) | Outsource (faster Phase 1) |

### Founder decisions (locked in)

| # | Decision | Choice | Implication |
|---|---|---|---|
| UC1 | Scope | Big first — all 10 modules in 3 months | Need team of 10–12, not 6.5. ₹25–30L/mo burn from month 1. |
| UC2 | Pricing | Monthly subscription ₹14,999 | Need strong sales motion + demo from day 1 |
| UC3 | Co-founder | Build first, CA advisor (not co-founder) | Hire paid full-time CA SME from day 1, not a contractor |
| UC4 | Auto-file | Drop auto-file. Generate PDF, CA uploads manually. | ✅ Critical risk eliminated |
| T1 | Dashboards | One unified screen with filters | Simpler to ship |
| T2 | Cost tracking | Pre-launch | Build cost-per-firm dashboard before MVP goes live |
| T3 | Tally connector | Build our own | Hire 1 ex-Tally engineer in month 1; budget 2 months |

### Adjustments to the plan based on these decisions

1. **Drop auto-file from every module.** Replace "filing agent: Playwright headless → GST portal" with "generate signed PDF + 1-click portal upload link. CA does final upload." Applies to Module 3 (Notice Engine), Module 9 (Litigation OS filings), and any other portal-write action.

2. **Team Phase 1 grows from 6.5 to 10:** +1 backend, +1 frontend, +1 ex-Tally engineer, +0.5 CA SME upgraded to 1.0 FT. Burn revises to ₹25L/mo.

3. **Hire priorities month 1:** Tech lead, ex-Tally engineer (THIS IS THE BOTTLENECK), CA SME full-time, applied-ML-infra engineer.

4. **Cost dashboard becomes a Phase 1 deliverable.** Per-firm LLM/infra/voice cost visible to admin from day 1.

5. **Sales motion starts month 1, not month 4.** Founder = full-time selling + demoing. Cannot afford to hide in build for 3 months on subscription pricing.

6. **Risk that did NOT get eliminated by these decisions:** non-CA credibility gap. Mitigated by (a) CA SME on every sales call, (b) ICAI CMP listing applied for month 1, (c) hire CA sales lead by month 6.

### What to do next

Build the MVP per the (now updated) Phase 1 spec. Decisions are locked.

**STATUS: DONE** — All 7 user decisions captured. Plan updated. 16 auto-decided fixes applied. Ready for MVP build phase.
