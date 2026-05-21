# NotusAI Testing Guide — for non-CAs

You're not a CA. You don't have real GST notices or client books. But you still need to verify every automation works. This guide walks through 12 scenarios using **sample data** that ships with the app.

**Time required:** ~45 minutes for the full test pass.

---

## Pre-flight checklist

Make sure these are working FIRST (no point testing features if foundation is broken):

```
✓ npm run dev runs without errors
✓ http://localhost:3000 loads the landing page
✓ You can sign in with magic link
✓ Settings page shows ✓ Connected for Supabase, Anthropic, Gemini, Resend, Razorpay
✓ Gmail is connected (✓ Active in Settings)
```

If any of these fail → fix that first. Then come back here.

---

## Step 0: Seed test data (one-time)

The seed script creates 3 fake clients, 10 vendors, sample mismatches and anomalies — so every page has data to display.

### Run the seed:

1. Open `D:\Startup_Ideas\notusai-app\supabase\seed.sql` in a text editor
2. Find this line near the top: `v_email text := 'shabbirabbas2004@gmail.com';`
3. **Change it to your actual auth email** if different
4. Copy the entire file contents
5. Go to Supabase → SQL Editor → New query → paste → Run
6. You should see notices about clients/vendors created

### Verify:

Refresh `http://localhost:3000/app` — you should now see:
- 3 clients in /app/clients (Sharma, Patel, Surat)
- 10 vendors in /app/vendors
- 3 open anomalies in /app/anomalies
- 1 reconciliation in /app/reconciliation
- 2 notices in /app/notices

If nothing shows, check the SQL Editor output for errors.

---

# The 12 test scenarios

## Test 1: Smart Inbox shows urgent items ✓

**Goal:** Verify the morning dashboard surfaces relevant data.

**Steps:**
1. Open `http://localhost:3000/app`

**Expected:**
- 🔴 Urgent card: 1-2 items (Sharma's ASMT-10 deadline, Patel's DRC-01)
- 🟡 Attention card: 3 high-risk anomalies
- ⚠️ Mismatches card: 3 mismatches
- Recent activity section
- Free credits: 3 (or fewer if you've drafted)

**Pass criteria:** All cards render with data. No empty states (since you seeded).

---

## Test 2: Add a client (manual entry) ✓

**Goal:** Verify the client creation flow.

**Steps:**
1. Navigate to /app/clients
2. Click **+ Add client**
3. Fill in test data:
   ```
   Business name: Test Client Industries
   Industry: Electronics
   GSTIN: 27TESTA1234M1Z5
   State: Maharashtra
   Phone: +919876500000
   Email: test@example.com
   ```
4. Click **Create client**

**Expected:** Redirects to `/app/clients/<new-id>` → shows client detail page with 0 notices, 0 anomalies, contact info displayed.

---

## Test 3: PDF OCR auto-fills notice form ✓ ⭐ MAGIC TEST

**Goal:** Verify Gemini Vision reads notices and fills the form.

**Steps:**
1. **Create a test PDF:**
   - Open `tests/fixtures/sample-asmt10.txt`
   - Copy entire text
   - Open Google Docs (free) → paste → File → Download → PDF
   - Save to your desktop
2. Go to `/app/notices/new`
3. Click the blue **"Upload PDF"** button at top
4. Select your downloaded PDF
5. Wait ~5 seconds

**Expected:** All these fields auto-fill:
- Client name: "Sharma Textile Industries"
- GSTIN: "27AABCS1234M1Z5"
- Notice type: "ASMT-10"
- Period: "April 2025 to June 2025"
- Deadline: "2025-12-14" (30 days from 2025-10-12)
- Demand amount: 342000
- Notice text: full notice transcribed

**Pass criteria:** At least 4 of 5 fields auto-fill correctly. If nothing fills → check `GEMINI_API_KEY` in `.env.local`.

---

## Test 4: Generate a notice draft ✓ ⭐ CORE TEST

**Goal:** Verify Claude drafts a professional reply.

**Steps:**
1. Continuing from Test 3 (form is filled), OR fill manually using sample-asmt10.txt
2. Add **Key facts**: copy from the sample notice — "₹2.10L vendor Patel Yarn Mills filed late, ₹80K Mumbai Trading mistake, ₹52K genuine error"
3. Tone: **Balanced**
4. Click **Generate draft**
5. Wait 30-60 seconds

**Expected:**
- Page navigates to `/app/notices/<new-id>`
- Status: 🟡 "Generating draft..." for ~45 sec
- Then status: 🟢 "Ready"
- Draft contains:
  - EXECUTIVE SUMMARY box with 5 lines
  - Formal letter format
  - At least 2 CGST Act citations (Section 16(2), Rule 36(4))
  - At least 1 case law citation (Madras HC or Bombay HC)
  - "Drafted with assistance from NotusAI" watermark

**Pass criteria:** Draft is ≥3 paragraphs and cites real legal sections. If fails → check `ANTHROPIC_API_KEY` and balance at console.anthropic.com.

**You also get an email** at `shabbirabbas2004@gmail.com` saying "Your draft is ready" (Resend test).

---

## Test 5: Run a reconciliation ✓

**Goal:** Verify CSV upload + matching logic.

**Steps:**
1. Go to `/app/reconciliation`
2. Click **+ Run new**
3. Fill in:
   - GSTIN: `27AABCS1234M1Z5` (Sharma's)
   - Period: `2025-10`
4. **Tally CSV:** click "Choose file" → select `tests/fixtures/sample-tally-purchase.csv`
5. **GSTR-2B JSON:** click "Choose file" → select `tests/fixtures/sample-gstr2b.json`
6. Click **Run reconciliation**

**Expected:**
- ✓ Reconciliation complete (8 sec)
- Result shows:
  - Books: 16 invoices
  - 2B: 13 invoices
  - Matched: ~11-13 (depends on fuzzy logic)
  - Mismatches: 3-5 (some are amount diffs, some missing)
  - ITC at risk: ~₹40K-50K
- Redirects to /app/reconciliation showing the new run

**Pass criteria:** Reconciliation row appears with non-zero matched count.

---

## Test 6: Anomaly Engine shows risks ✓

**Goal:** Verify the rule engine + pre-filing predictions.

**Steps:**
1. Go to `/app/anomalies`

**Expected:** You see 3 anomalies (from seed):
- 🔴 CRITICAL: Sharma · invoice_payment_unpaid · ₹1,24,000 must be reversed
- 🔴 HIGH: Patel · itc_excess · ₹56,160 excess · 73% notice probability
- 🟡 MEDIUM: Patel · vendor_late · 38% vendors filed late

Each shows description, recommended action, potential savings.

**Pass criteria:** All 3 anomalies render with severity badges + colored backgrounds.

---

## Test 7: Vendors tab shows risk scores ✓

**Goal:** Verify cross-client vendor risk ranking.

**Steps:**
1. Go to `/app/vendors`

**Expected:** 10 vendors ranked by risk score (highest first):
- 🔴 Patel Yarn Mills · 8.2
- 🔴 Mumbai Trading Co · 7.5
- 🟡 Surat Yarn Traders · 6.8
- ... down to KK Industries · 3.2 (lowest risk)

**Pass criteria:** All 10 vendors visible, sorted by risk descending, color-coded.

---

## Test 8: CA Copilot answers a query ✓ ⭐ COOL TEST

**Goal:** Verify Claude with tool-use can query the DB.

**Steps:**
1. Go to `/app/copilot`
2. Type: `Show me all clients with open anomalies grouped by severity`
3. Press Enter or click Send

**Expected:**
- Loading "Thinking..." indicator
- 5-15 seconds later, response like:
  ```
  Found 3 open anomalies across 2 clients:
  
  CRITICAL (1):
  • Sharma Textile · invoice_payment_unpaid · ₹1.24L
  
  HIGH (1):
  • Patel Engineering · itc_excess · ₹56K
  
  MEDIUM (1):
  • Patel Engineering · vendor_late · 38% late rate
  
  Want me to draft client advisory emails?
  ```

**Pass criteria:** Response correctly counts and groups anomalies from your seeded data. This proves the tool-use is working with DB queries.

---

## Test 9: Tax Research generates a research memo ✓

**Goal:** Verify Claude Opus generates research with citations.

**Steps:**
1. Go to `/app/research`
2. Type: `What's the GST treatment of late filing fees collected from customers?`
3. Click **Research**

**Expected (~18 seconds later):**
A markdown memo with sections:
- ## Quick Answer
- ## Statutory Position (Section/Rule citations)
- ## CBIC Clarifications (circular references)
- ## Judicial Precedents (case law)
- ## Practical Recommendation
- ## Risks & Caveats

**Pass criteria:** Memo has at least 4 sections and cites specific CGST Act sections.

---

## Test 10: Email auto-detection (the MAGIC moment) ✓ ⭐⭐ ULTIMATE TEST

**Goal:** Verify the entire Gmail → OCR → draft pipeline.

**Steps:**
1. Open ANY other email account (phone email, work email, etc.)
2. Send an email TO `shabbirabbas2004@gmail.com`:
   ```
   Subject: Fwd: ASMT-10 notice received from GST dept - URGENT
   
   Body:
   Sir, attached GST notice for Sharma Textile Industries.
   Need reply ASAP. Deadline Dec 14. Demand Rs 3.42 lakh.
   
   GSTIN: 27AABCS1234M1Z5
   Period: April-June 2025
   
   Vendor Patel Yarn Mills filed GSTR-1 late.
   Need balanced defense.
   ```
3. **Optionally:** attach the PDF you made in Test 3
4. Send.

5. **Manually trigger the cron** (since Vercel Cron doesn't run locally):
   - Open `.env.local`, add: `CRON_SECRET=test123` if not present → restart `npm run dev`
   - Open a NEW PowerShell window:
   ```powershell
   curl http://localhost:3000/api/cron/gmail-sync -H "Authorization: Bearer test123"
   ```

6. Wait ~60 seconds (it's processing your email).

**Expected:**
- Response shows: `{"processed": 1, "by_intent": {"notice": 1}}`
- Check the bell icon in your app → "1 unread"
- Click it → "✓ Draft ready: ASMT-10 for Sharma Textile" (or "⚠ Draft ready but client not auto-matched" if no GSTIN match)
- Click notification → see the auto-drafted notice
- Check `/app/inbox-review` → your email is listed with classification "notice"

**Pass criteria:** A new notice appears in `/app/notices` that you DID NOT manually create. The whole pipeline ran autonomously.

If you see "⚠ unmatched" — that's also a pass (means the classifier worked but couldn't find the client by GSTIN, probably because the test GSTIN in your email doesn't exactly match seeded data).

---

## Test 11: Inbox Review page shows email audit ✓

**Goal:** Verify the email router decisions are auditable.

**Steps:**
1. After running Test 10, go to `/app/inbox-review`

**Expected:**
- Top stats show: Notices: 1+, others may be 0
- Below: list of emails with classification badges
- The email you sent in Test 10 appears with intent: "notice"
- Linked notice info displayed
- Orphan emails (if any) have a "⚠ Needs manual link" badge

**Pass criteria:** Your test email is correctly classified and visible.

---

## Test 12: Notification bell + history ✓

**Goal:** Verify in-app notifications work.

**Steps:**
1. In the sidebar, click the **bell icon** (top-right of sidebar)
2. Should show a dropdown with your recent notifications
3. Click "Mark all read" → unread badge disappears
4. Click any notification → navigates to relevant page
5. Go to `/app/notifications` → see full history

**Expected:** All recent activity from Tests 1-11 is captured here.

---

# Manually triggering cron jobs (for testing)

Since Vercel Cron only runs in production, here's how to trigger each cron locally:

### Setup
1. Add to `.env.local`: `CRON_SECRET=test123`
2. Restart `npm run dev`

### Triggers (use any of these in PowerShell):

```powershell
# Gmail sync (every 5 min in prod)
curl http://localhost:3000/api/cron/gmail-sync -H "Authorization: Bearer test123"

# Daily anomaly scan (6 AM in prod)
curl http://localhost:3000/api/cron/daily-anomaly-scan -H "Authorization: Bearer test123"

# Morning digest email (7 AM in prod)
curl http://localhost:3000/api/cron/morning-digest -H "Authorization: Bearer test123"

# Deadline reminders (9 AM in prod)
curl http://localhost:3000/api/cron/deadline-reminders -H "Authorization: Bearer test123"

# Vendor follow-up escalations (every 4 hr in prod)
curl http://localhost:3000/api/cron/vendor-followup-tick -H "Authorization: Bearer test123"

# Client doc chase (10 AM in prod)
curl http://localhost:3000/api/cron/client-doc-chase -H "Authorization: Bearer test123"
```

Each returns a JSON summary of what it did.

---

# Quick-glance: what's testable vs not

| Feature | Local test status |
|---|---|
| Sign-up + auth | ✓ Fully testable |
| Add client | ✓ Fully testable |
| PDF OCR auto-fill | ✓ Fully testable (needs Gemini key) |
| Notice drafting | ✓ Fully testable (needs Anthropic key) |
| Reconciliation | ✓ Fully testable (use sample CSV+JSON) |
| Anomaly Engine | ✓ Testable via seeded data |
| Vendors | ✓ Testable via seeded data |
| Copilot | ✓ Fully testable |
| Tax Research | ✓ Fully testable |
| **Email auto-detection** | ✓ Fully testable (manual cron trigger) |
| Notifications | ✓ Fully testable |
| Inbox Review | ✓ Fully testable |
| Vendor agent (outbound email) | ⚠ Sends real email — verify with test address |
| Vendor agent (outbound WhatsApp) | ⚠ Needs WhatsApp Business setup, otherwise mock-only |
| Vendor agent (outbound voice) | ⚠ Needs Exotel + Sarvam, otherwise mock-only |
| Razorpay payment link | ✓ Generates link (use test keys; don't actually pay yourself) |
| Cron auto-trigger | ❌ Only runs on Vercel production |

---

# Pass-fail summary

Run all 12 tests. Track results:

```
[ ] Test 1: Smart Inbox
[ ] Test 2: Add Client
[ ] Test 3: PDF OCR auto-fill  ⭐
[ ] Test 4: Notice drafting  ⭐ CORE
[ ] Test 5: Reconciliation
[ ] Test 6: Anomaly Engine
[ ] Test 7: Vendors
[ ] Test 8: CA Copilot  ⭐
[ ] Test 9: Tax Research
[ ] Test 10: Email auto-detection  ⭐⭐ MAGIC
[ ] Test 11: Inbox Review
[ ] Test 12: Notifications
```

**If ALL 12 pass:** you have a fully working AI SaaS product. Deploy to Vercel and start showing CAs.

**If Test 4 fails:** the core product is broken. Fix `ANTHROPIC_API_KEY` first.

**If Test 10 fails:** the magic doesn't work yet. Check `GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`, and that `CRON_SECRET` matches.

---

# Demo flow for a CA

Once all tests pass, show a CA this exact 4-minute sequence:

1. **0:00–0:30** — Show landing page. "AI tax-litigation OS for CA firms. ₹999/notice. First 3 free."
2. **0:30–1:30** — Sign in (you log in pre-demo). Show Smart Inbox with seeded data. "This is what your morning looks like — urgent items, AI activity overnight."
3. **1:30–2:30** — Click + New notice → drop the ASMT-10 PDF → auto-fill happens in 5 sec. "AI just read this PDF."
4. **2:30–3:30** — Click Generate → wait 45 sec → show the draft with citations. "This took your senior associate 6 hours yesterday."
5. **3:30–4:00** — Open `/app/copilot` → type "Show me all anomalies over ₹50K" → response in 10 sec. "Replaces 30 minutes of Tally exploration."

If the CA isn't leaning forward by 4 minutes, demo is over. If they are — close at ₹14,999/month.

---

# Cost of running ALL these tests

Estimated LLM cost for the full 12-scenario test pass: **~₹40-80** (mostly Claude drafts + Gemini OCRs + a few Copilot/Research queries). Well within your ₹2K Anthropic credit.

You can run this whole suite end-to-end repeatedly without breaking the bank.
