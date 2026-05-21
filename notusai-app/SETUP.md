# NotusAI — Setup & Deployment Guide

Full step-by-step. Get from zero to live production in ~90 minutes.

---

## Prerequisites (one-time install on your laptop)

1. **Node.js 20+** — Download from [nodejs.org](https://nodejs.org) (LTS version). Restart PowerShell after install.
2. **Git** — Probably already installed. Run `git --version` to check.
3. **A code editor** — [Cursor](https://cursor.com) (free, AI-powered, highly recommended) or [VS Code](https://code.visualstudio.com).

Verify Node:
```powershell
node --version
npm --version
```

---

## Part 1 — Get accounts (all free except Anthropic credit)

### 1. Supabase (database + auth)
1. Go to [supabase.com](https://supabase.com) → Sign up with GitHub
2. Click **"New project"**
3. Name: `notusai-prod`, Database password: generate strong one (save it), Region: **Mumbai (ap-south-1)**
4. Wait ~2 min for provisioning
5. Once ready → left sidebar **Project Settings** → **API**
6. Copy three values to a notepad:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
   - **service_role key** (different long string — keep this SECRET)

### 2. Anthropic (Claude AI)
1. Go to [console.anthropic.com](https://console.anthropic.com) → Sign up
2. Add credit: **₹2,000 worth ($24)** — Settings → Billing → Add to credit balance
3. API Keys → **Create Key** → name it `notusai` → copy the `sk-ant-...` value

### 3. Resend (email delivery)
1. Go to [resend.com](https://resend.com) → Sign up free
2. API Keys → Create new → copy the `re_...` value
3. **For first 30 days:** use `onboarding@resend.dev` as From email (works without domain verification)
4. **Later:** Add a custom domain (notusai.in) → verify DNS → use `hello@notusai.in`

### 4. Razorpay (payments)
1. Go to [razorpay.com](https://razorpay.com) → Sign up
2. Complete KYC (PAN + Aadhaar + bank — takes 1-2 days for approval, but you can use TEST mode immediately)
3. Settings → API Keys → Generate test keys → copy `rzp_test_...` and the secret
4. Once KYC approved, you'll switch to live keys

---

## Part 2 — Set up the database

1. Open your Supabase project dashboard
2. Left sidebar → **SQL Editor**
3. Click **"New query"**
4. Open `supabase/schema.sql` from this folder, paste all contents into the SQL editor
5. Click **Run** (or Ctrl+Enter)
6. You should see "Success. No rows returned." That's correct.

Verify it worked:
- Left sidebar → **Table Editor**
- You should see two tables: `profiles` and `notices`

---

## Part 3 — Configure email auth in Supabase

1. Supabase dashboard → **Authentication** → **Providers**
2. Email provider — make sure it's enabled (it is by default)
3. Settings → **URL Configuration**
4. Add to **Redirect URLs:**
   - `http://localhost:3000/auth/callback`
   - `https://your-future-vercel-url.vercel.app/auth/callback` (add later when you deploy)
5. Save

---

## Part 4 — Local development

### Install and run

```powershell
cd D:\Startup_Ideas\notusai-app
npm install
```

This will take ~2 minutes and create a `node_modules/` folder (huge — already gitignored).

### Create .env.local

1. Copy `.env.example` → `.env.local` (PowerShell: `Copy-Item .env.example .env.local`)
2. Open `.env.local` in your editor
3. Fill in all values from your notepad (Supabase, Anthropic, Resend, Razorpay)
4. For `NEXT_PUBLIC_APP_URL` set `http://localhost:3000` for local dev

### Run the dev server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see your landing page.

### Test the full flow

1. Click "Get first draft free" → goes to /login
2. Enter your email → click "Send magic link"
3. Check your inbox (and spam) → click the magic link
4. You land on /dashboard
5. Click "+ New notice"
6. Fill in test data (use the sample from notusai/kit/01-prompts/sample_asmt10.md)
7. Click Generate → wait 30-60 seconds → draft appears

If something fails, check the PowerShell terminal for error messages.

---

## Part 5 — Deploy to Vercel (production)

### Push code to GitHub

You probably want a **separate repo** for the Next.js app (cleaner than mixing with your static site).

```powershell
cd D:\Startup_Ideas\notusai-app
git init
git add .
git commit -m "Initial Next.js app"
```

Create a new GitHub repo named `notusai-app` (public is fine — no secrets in code, all secrets in env vars). Then:

```powershell
git remote add origin https://github.com/Shabbir2004/notusai-app.git
git branch -M main
git push -u origin main
```

### Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. **Add New** → **Project** → Import `notusai-app`
3. Framework: **Next.js** (auto-detected)
4. **Environment Variables** section — paste each one from your .env.local:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `NEXT_PUBLIC_APP_URL` — set this to whatever Vercel URL you get, e.g., `https://notusai.vercel.app`
5. Click **Deploy**
6. Wait ~2 minutes — your site is live

### Add Vercel URL to Supabase redirects

1. Supabase → Authentication → URL Configuration
2. Add `https://your-app.vercel.app/auth/callback` to **Redirect URLs**
3. Save

### Update Razorpay callback URL

Already handled via `NEXT_PUBLIC_APP_URL` env var. If you change your Vercel URL, update that env var in Vercel dashboard.

---

## Part 6 — Custom domain (optional, ₹800/year)

Once you have a paying customer or two:

1. Buy `notusai.in` on Hostinger or Namecheap (~₹800/year)
2. Vercel → Project → Settings → Domains → Add `notusai.in`
3. Follow Vercel's DNS instructions (add 2 records at your domain registrar)
4. Wait ~30 min for DNS propagation
5. Update `NEXT_PUBLIC_APP_URL` in Vercel env vars to `https://notusai.in`
6. Update Supabase Redirect URLs

---

## Cost summary

| Service | Cost | When |
|---|---|---|
| Supabase | Free tier (500MB DB, 1GB storage) | Up to ~1000 notices |
| Anthropic | ~₹5–40 per notice | Pay-as-you-go |
| Resend | Free (3000 emails/month) | Plenty for early stage |
| Razorpay | 2% per transaction | Only when customers pay |
| Vercel | Free tier | Up to 100GB bandwidth |
| Domain | ₹800/year | Optional |

**Total to launch:** ₹2,000 (Anthropic credit). Everything else free until you have real volume.

---

## Going further

When the product proves itself (50+ paying customers):

1. **Build PDF rendering** — currently markdown shown raw; add `@react-pdf/renderer` to generate proper PDFs
2. **Add webhook for Razorpay** — auto-mark notices as paid when customer pays
3. **Add OCR for uploaded PDFs** — currently you paste notice text; add PDF→text via Gemini Vision
4. **Add Tally integration** — pull client data automatically
5. **Add notice tracking calendar** — full litigation OS as we originally planned

The full roadmap is in `D:\Startup_Ideas\NOTUS_PLAN.md`.

---

## When you get stuck

1. **PowerShell errors during `npm install`:** make sure Node.js is properly installed and PATH is set. Restart PowerShell.
2. **Supabase auth not redirecting:** double-check Redirect URLs in Supabase → Auth → URL Configuration. Common gotcha.
3. **Claude API errors:** check that your `ANTHROPIC_API_KEY` is correct and you have credits remaining.
4. **Magic link not arriving:** check spam folder. Verify Resend API key and from email.
5. **Razorpay link creation fails:** make sure you're using the right test/live keys, and KYC is complete for live mode.

**Use Cursor or Claude to debug.** Paste the error message + relevant file content and ask "what's wrong?" — modern AI tools fix 90% of issues in seconds.
