# Integration Setup Guide

Every external service NotusAI uses. Mocked by default — works without ANY of these for local dev. Add them progressively as you scale.

---

## Required from Day 1

### 1. Anthropic Claude (~₹2,000 to start)

**Purpose:** Notice drafting, copilot, research, anomaly explanation.

**Steps:**
1. Go to [console.anthropic.com](https://console.anthropic.com), sign up
2. Settings → Billing → Add ~₹2,000 worth ($24) of credit
3. API Keys → Create key → copy `sk-ant-api03-...`
4. Set env: `ANTHROPIC_API_KEY=sk-ant-...`

**Per-draft cost:** ₹5-15 (Sonnet 4.6) or ₹30-80 (Opus 4.7 for complex). At ₹999/notice you keep 95%+ margin.

### 2. Supabase (FREE)

**Purpose:** Postgres database, auth (magic link), file storage.

**Steps:**
1. Go to [supabase.com](https://supabase.com), sign up with GitHub
2. New project → Region: **Mumbai (ap-south-1)** → wait 2 min
3. Settings → API → copy these to your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret)
4. SQL Editor → paste contents of `supabase/schema.sql` → Run
5. Authentication → URL Configuration → add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://your-vercel-url.vercel.app/auth/callback`

**Cost:** Free tier handles ~1000 notices/month. Pro plan ₹2K/mo when you outgrow it.

### 3. Resend (FREE)

**Purpose:** Transactional emails (draft ready, vendor follow-up, etc.)

**Steps:**
1. [resend.com](https://resend.com) → sign up
2. API Keys → Create → copy `re_...`
3. Set env: `RESEND_API_KEY=re_...`
4. **For first 30 days:** use `onboarding@resend.dev` as sender (no domain required)
5. **Later:** Domains → Add your domain (notusai.in) → add DNS records → verify → use `hello@notusai.in`

**Cost:** Free up to 3,000 emails/month. $20/mo for 50K after.

### 4. Razorpay (FREE setup, 2% per transaction)

**Purpose:** Accept payments for paid drafts.

**Steps:**
1. [razorpay.com](https://razorpay.com) → sign up
2. Complete KYC (PAN + Aadhaar + bank) — 1-2 days approval
3. Settings → API Keys → Generate test keys for dev
4. Set env: `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET=...`
5. Once live, switch to live keys
6. **Webhooks:** Settings → Webhooks → Add new
   - URL: `https://your-app.vercel.app/api/webhooks/razorpay`
   - Events: `payment_link.paid`
   - Secret: generate random → set as `RAZORPAY_WEBHOOK_SECRET` in env

**Cost:** 2% + GST per successful transaction. Free for failed/refunded.

---

## Optional — adds capabilities, requires contracts

### 5. GSTN APIs via GSP (Cygnet recommended)

**Purpose:** Auto-pull GSTR-1, 2A, 2B, 3B, e-invoice. **Without this you can still run NotusAI** — CAs paste notice text manually and upload Tally CSV. You just don't have real-time GSTN data.

**Options:**

**A) Cygnet Infotech (recommended for startup)**
- Contact: sales@cygnetinfotech.com
- Tell them you're building tax-tech for CA firms
- Get sandbox in 2-4 weeks (signed NDA + KYC)
- Production access: 4-8 weeks (full agreement, ~₹2-5 per API call)
- Set: `CYGNET_GSP_URL=...`, `CYGNET_GSP_API_KEY=...`

**B) IRIS Sapphire** (more enterprise, similar timeline)
- iristechnologies.com — enterprise sales

**C) Apply to GSTN directly for GSP license**
- Only viable when you have $500K+ revenue
- 12-18 months approval, ₹50L+ initial cost + audit
- Best long-term economics but wrong order

**D) Stay on mock** (perfectly fine until 50+ paying customers)
- Set `USE_MOCK_GSTN=true` in env
- CAs upload GSTR-2B JSON manually from GST portal (they can do this in 2 minutes)

### 6. Tally Connector

**Purpose:** Auto-pull purchase register from client's Tally → no manual CSV export needed.

**Options:**

**A) Build CSV import only (current implementation)**
- Cost: ₹0
- CA exports Tally → CSV → uploads
- Works for first 100 customers easily

**B) License a TDL connector**
- Vendors: Refrens, Hostbooks, custom TDL developers
- Cost: ₹2-5L one-time + per-firm support
- Time: 2-4 weeks to integrate

**C) Hire ex-Tally engineer**
- Bangalore: ₹15-25L/year, 2-3 months build time
- You own the IP

### 7. WhatsApp Business Cloud API (Meta)

**Purpose:** Vendor follow-up agent, client document chase, notice alerts to clients.

**Steps:**
1. Create Meta Business Manager account
2. Apply for WhatsApp Business Platform: [developers.facebook.com/docs/whatsapp/cloud-api/get-started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
3. Business verification (KYC) — 1-2 weeks
4. Phone number provisioning → permanent access token
5. Set env: `WHATSAPP_PHONE_ID=...`, `WHATSAPP_ACCESS_TOKEN=...`, `WHATSAPP_WEBHOOK_SECRET=...`
6. Configure webhook URL: `https://your-app.vercel.app/api/webhooks/whatsapp`

**Cost:** First 1000 conversations/month free, then ~₹0.5-1 per service message.

### 8. Exotel + Sarvam (voice agent)

**Purpose:** Outbound voice calls to vendors in regional language. Final-stage escalation in vendor follow-up agent.

**Steps:**
1. [exotel.com](https://exotel.com) → sign up → KYC (2 days)
2. Get virtual number + account SID + API key + token
3. [sarvam.ai](https://sarvam.ai) → sign up for Indic TTS (or use ElevenLabs)
4. Set env: `EXOTEL_ACCOUNT_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_VIRTUAL_NUMBER`, `SARVAM_API_KEY`

**Cost:** Exotel ₹0.5-2/min outbound. Sarvam ₹0.10 per 100 chars TTS.

---

## .env.local checklist

Minimal `.env.local` to run NotusAI in dev:

```bash
# Required (cannot omit)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=NotusAI <onboarding@resend.dev>
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional (mocked if absent)
USE_MOCK_GSTN=true        # remove or set false when you have GSP contract
WHATSAPP_ACCESS_TOKEN=    # leave blank for mock
WHATSAPP_PHONE_ID=
EXOTEL_ACCOUNT_SID=       # leave blank for mock
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_VIRTUAL_NUMBER=
SARVAM_API_KEY=
CYGNET_GSP_URL=
CYGNET_GSP_API_KEY=
```

---

## Pre-launch checklist

Before any paying customers:
- [ ] Razorpay live keys (KYC approved)
- [ ] Resend custom domain verified
- [ ] Razorpay webhook configured
- [ ] Supabase redirect URLs include production domain
- [ ] `NEXT_PUBLIC_APP_URL` set to production URL in Vercel
- [ ] Backup strategy: enable Supabase daily backups
- [ ] Test full purchase flow with real ₹1 transaction
- [ ] Test email deliverability (your address + 3 CA friends)

Before 50 customers:
- [ ] Add Sentry for error tracking (free tier)
- [ ] Set up Anthropic prompt caching for cost reduction
- [ ] Add anomaly cron job (Vercel Cron) for daily scans
- [ ] Configure Razorpay subscription plans for monthly tiers

Before 200 customers:
- [ ] Negotiate Cygnet GSP contract
- [ ] Apply for WhatsApp Business verification
- [ ] Apply for ICAI CMP listing
- [ ] Add Inngest or Temporal for durable agents

Before 1000 customers:
- [ ] Migrate from Supabase free to Pro
- [ ] Add ClickHouse for analytics dashboards
- [ ] Hire first engineer
- [ ] Move to AWS Mumbai for compliance/cost
