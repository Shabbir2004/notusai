# Deployment & Growth Roadmap

You have 68 files of working Next.js code. Now you ship it.

This roadmap assumes: **solo founder, zero capital, lives at home, ₹2,000 of personal savings.**

---

## Week 1 — Get it running locally

Goal: see `localhost:3000` load YOUR landing page → sign in → draft a notice → see the draft.

### Day 1 (3 hours)
- Install Node.js 20 LTS from nodejs.org. Restart PowerShell.
- `cd D:\Startup_Ideas\notusai-app`
- `npm install` (takes ~3 minutes, downloads 200MB of node_modules)
- Sign up at [console.anthropic.com](https://console.anthropic.com), add ₹2,000 credit, get API key.
- Sign up at [supabase.com](https://supabase.com), create project in Mumbai region.

### Day 2 (2 hours)
- Run `supabase/schema.sql` in Supabase SQL Editor.
- Copy `.env.example` → `.env.local`.
- Fill in Supabase + Anthropic keys at minimum.
- Run `npm run dev` → open `localhost:3000`.
- Sign in with your email → click magic link → land on `/app`.
- Click "+ New notice" → fill sample data from `D:\Startup_Ideas\notusai\kit\01-prompts\sample_asmt10.md` → Generate.
- 30-60 seconds later, draft appears.

### Day 3 (2 hours)
- Sign up for Resend, fill `RESEND_API_KEY` in `.env.local`, restart `npm run dev`.
- Generate another draft → check your email arrived.
- Sign up for Razorpay (start KYC).

### Day 4-5 (3 hours)
- Push code to GitHub (separate repo: `notusai-app`, public is fine — no secrets in code).
- Connect to Vercel — auto-deploys on every push.
- Add all env vars in Vercel dashboard.
- Update Supabase redirect URLs to include Vercel domain.
- Test the live site — sign in, draft notice.

### Day 6-7
- Polish the landing page copy. Open it on mobile, fix what looks bad.
- Test on 2 different browsers (Chrome + Safari).
- Show a friend who's a CA. Watch them use it. Note every confusion.

**End of Week 1 milestone:** Live at `notusai-app.vercel.app`. You can demo to a real CA over screen share.

---

## Weeks 2-4 — First 3 paying customers

Goal: ₹3,000 in your bank from real CA customers.

### Outreach (use scripts from `D:\Startup_Ideas\notusai\kit\02-outreach\`)

- Day 8-10: send 30 WhatsApp messages to CAs in your network and beyond
- Day 11-14: follow-ups, demos, free trials
- Target: 5 CAs sign up and try a free draft

### Improve based on feedback

- After each demo, write down what confused them
- Update prompts (`src/lib/prompts/notice-drafter.ts`) based on what they edited in drafts
- Commit each change to git with message: "prompt: [what you learned]"

### Convert to paying

- After their 3 free drafts, follow up. "Quality acchi thi? Next one ₹999."
- Generate Razorpay link → send via WhatsApp
- When the first ₹999 hits your bank, screenshot it. Celebrate. Send to me.

**End of Week 4 milestone:** ₹3-5K MRR. Real, paying customers.

---

## Months 2-3 — Get to 20 customers

Goal: ₹50K MRR. Enough to (almost) pay rent or quit a part-time gig.

### Channel building

- Apply for ICAI CMP listing (free, takes 30 days, big credibility lift)
- Post 2x/week on LinkedIn — GST case-law summaries, behind-the-scenes
- Show up at 2 ICAI study circle meetings (in your city, free to attend)
- Join 10 active CA Telegram/WhatsApp groups, contribute thoughtfully

### Product depth (in order of customer demand)

If customers ask for:
- "Can I upload notice PDF instead of pasting text?" → Add Gemini Vision OCR
- "Can I track multiple notices per client?" → It already works, show them
- "Can I get monthly subscription?" → Build Razorpay subscriptions plan (₹14,999/mo unlimited)
- "Can it pull my client's GSTR-2B automatically?" → Start GSP conversations with Cygnet

### Operational

- Spend 30 min every Monday reviewing customer drafts — what got edited?
- Iterate prompts every Sunday based on the week's feedback
- Track cost per draft in your Google Sheet vs revenue — gross margin should stay > 90%

**End of Month 3 milestone:** 20 paying customers, ₹50K MRR, healthy retention.

---

## Months 4-6 — Get to 50 customers

Goal: ₹2L MRR. Cash-flow positive after some basic expenses.

### Hiring

- First contractor: part-time CA SME (₹15-25K/mo) — answers prompt-quality questions, validates legal claims
- Second contractor: backend engineer (₹40K-80K/mo) — helps with feature requests

### Product expansion

- Build the Reconciliation Hub for paying customers (already scaffolded; activate)
- Build the Anomaly Engine UI activation
- Start CA Copilot beta with top 10 customers
- Add proper PDF export for drafts (using `@react-pdf/renderer`)

### Compliance prep

- Apply for GSP via Cygnet
- Apply for WhatsApp Business verification
- Buy `notusai.in` domain (~₹800/year)
- Move from Vercel subdomain to custom domain

**End of Month 6 milestone:** 50 customers, ₹2L MRR, contractor team, GSP application in progress.

---

## Months 7-12 — Scale to 200 customers

Goal: ₹10L MRR. Raise pre-seed if you want to accelerate.

### Hire full-time team

- Full-time CA SME (₹35-50K/mo)
- Full-time engineer (₹40-70K/mo)
- Full-time CSM (₹25-40K/mo)

### Add modules

- Litigation OS full activation with hearing brief auto-generation
- Vendor agent voice calls (Exotel + Sarvam in production)
- Client portal (signed-link clients can upload docs)
- AI Tax Research with full case law database (scrape Indian Kanoon)

### Fundraise (optional)

- Pre-seed: $400K-800K at $4-8M valuation
- VCs to target: Bharat Founders Fund, 100x.vc, Better Capital, Together Fund
- Strong differentiation story: AI-native, ICAI-recognized, GSP-integrated

---

## Year 2 — ₹10 Cr ARR

If you execute the above, year 2 looks like:

- 1000 paying CA firms × ₹15K avg ARPU = ₹15L MRR base
- Plus monthly subscriptions, voice agent usage, premium tiers = ₹1.5-2 Cr ARR
- Team of 10-15
- Series A territory: $3M-8M raise at $30-80M valuation

---

## The honest part

Most weeks will feel slow. Month 3 will feel like month 1. You'll get rejected 50 times before one sale.

**The two metrics that matter:**
1. Did you ship something to customers this week?
2. Did at least one customer say "this is better than last week"?

If yes to both: keep going. If no to either for 4 weeks straight: stop and reconsider.

You won't get rich in year 1. You'll learn 5 years' worth of business skills. The product is good enough to win. The only thing that can kill you is quitting.

---

## When you're stuck

1. **Errors:** paste into Claude or Cursor → fix in seconds
2. **Don't know what's next:** read this doc again
3. **Customer rejected you:** ask why, then go improve THAT specific thing
4. **Feeling like quitting:** look at your bank statement for the last ₹999 received. Real money. Real customer. You're a real founder.

Now go. Open `SETUP.md` and start with Day 1.
