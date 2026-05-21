# Full Automation Reference

What runs automatically. When. What the CA sees. How to set it up.

## The 7 automation layers

### 1. Email watcher — auto-detect notices in CA's Gmail

**Trigger:** Every 5 minutes (`vercel.json` cron)
**Endpoint:** `/api/cron/gmail-sync`

**What it does:**
1. For each connected Gmail account, queries last 25 messages with notice keywords (ASMT, DRC, scrutiny, demand, etc.)
2. Skips already-processed messages (tracked via `gmail_processed_messages`)
3. For new ones: fetches full message + attachments
4. If subject/body matches GST notice pattern → triggers auto-draft pipeline:
   - Extract PDF attachment (or use email body)
   - OCR with Gemini Vision → structured data
   - Auto-create notice row
   - Generate draft with Claude
   - Create Razorpay payment link
   - Send email + in-app notification

**CA experience:** Client forwards a notice → 60 seconds later, draft appears in NotusAI inbox. No copy-paste.

**Setup required:**
1. Get Google OAuth credentials at console.cloud.google.com
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
3. CA goes to Settings → "Connect Gmail" → completes OAuth
4. Done.

**Files:**
- `src/lib/integrations/email/gmail.ts` — OAuth + Gmail API client
- `src/lib/agents/auto-draft.ts` — pipeline
- `src/app/api/integrations/gmail/connect/route.ts` — OAuth start
- `src/app/api/integrations/gmail/callback/route.ts` — OAuth callback
- `src/app/api/cron/gmail-sync/route.ts` — cron handler

---

### 2. PDF OCR — auto-read uploaded notice PDFs

**Trigger:** User uploads PDF in notice form (no cron)
**Endpoint:** `/api/notice/extract-pdf`

**What it does:**
1. CA drags-drops a PDF (or image) into notice form
2. Backend sends to Gemini Vision (Flash model)
3. Extracts: notice type, number, date, GSTIN, demand, period, deadline, full text
4. Auto-fills the form fields

**CA experience:** Drop PDF → form fills itself → click Generate.

**Setup required:** Get Gemini API key at aistudio.google.com (free tier).

**Files:**
- `src/lib/ocr/gemini-vision.ts`
- `src/app/api/notice/extract-pdf/route.ts`

**Cost:** ~₹2-5 per PDF page.

---

### 3. Vendor follow-up — multi-channel autonomous

**Trigger:** CA clicks "Start agent" on a mismatch (one-time). Then **automatic escalation via cron every 4 hours**.

**Lifecycle:**
- **Day 0:** AI drafts professional email, sends from CA's email domain
- **Day 4 (no reply):** Cron detects → AI drafts WhatsApp, sends via WhatsApp Cloud API
- **Day 7 (still no reply):** Cron detects → AI drafts voice script in Hindi/regional → Exotel places call with Sarvam TTS
- **Day 9 (voice didn't resolve):** Cron auto-escalates to CA via in-app + email notification

**Files:**
- `src/lib/agents/vendor-followup.ts` — state machine
- `src/app/api/cron/vendor-followup-tick/route.ts` — escalation cron
- `src/lib/integrations/whatsapp.ts`, `src/lib/integrations/voice.ts`

**CA experience:** Click once → forget. Get notification when resolved or escalated.

---

### 4. WhatsApp inbound reactor — auto-resolve vendor responses

**Trigger:** Real-time webhook from Meta WhatsApp Cloud API
**Endpoint:** `/api/webhooks/whatsapp`

**What it does:**
1. Vendor replies "Done bhai, file kar diya"
2. Webhook fires → matches phone to active vendor_followup
3. Claude classifies the reply: confirmation / denial / question / acknowledgment
4. If confirmation (confidence ≥70%):
   - Mark mismatch resolved
   - Close agent run
   - Notify CA: "✓ Vendor X resolved on WhatsApp"
5. If denial/question: escalate to CA with the message

**CA experience:** Vendor replies → 5 seconds later, in-app notification appears. No app polling needed.

**Setup:** Meta WhatsApp Business API verification (2-3 weeks), webhook URL configuration.

**Files:**
- `src/app/api/webhooks/whatsapp/route.ts`
- `src/lib/agents/whatsapp-reactor.ts`
- `src/lib/integrations/whatsapp.ts`

---

### 5. Daily anomaly scan — pre-filing risk detection

**Trigger:** Daily at 6:00 AM IST (cron)
**Endpoint:** `/api/cron/daily-anomaly-scan`

**What it does:**
1. Iterates every firm → every client GSTIN
2. Pulls latest reconciliation + vendor stats
3. Runs `detectAnomalies()` rule engine:
   - ITC excess vs 2B
   - Vendor late filing patterns
   - GSTR-1 vs 3B mismatches
   - Section 16(2)(c) unpaid invoices
   - Section 16(4) deadline approaching
4. Creates `anomalies` rows
5. Notifies CA of high/critical severity ones

**CA experience:** Wake up → see in Smart Inbox: "3 high-risk anomalies overnight."

**Files:**
- `src/lib/anomaly/rules.ts` — rule engine
- `src/app/api/cron/daily-anomaly-scan/route.ts` — cron

---

### 6. Daily deadline reminders + hearing alerts

**Trigger:** Daily at 9:00 AM IST
**Endpoint:** `/api/cron/deadline-reminders`

**What it does:**
1. Finds notices with reply deadlines within 7 days
2. Notifies CA per notice (severity scales with urgency)
3. Finds hearings within 24 hours
4. Notifies CA — auto-triggers hearing brief generation (when wired)

**CA experience:** Every morning at 9 AM, in-app + email: "⏰ ASMT-10 for Sharma Textile due in 2 days."

**Files:**
- `src/app/api/cron/deadline-reminders/route.ts`

---

### 7. Daily morning digest — overnight activity email

**Trigger:** Daily at 7:00 AM IST
**Endpoint:** `/api/cron/morning-digest`

**What it does:**
1. For each firm owner, gathers last 24h:
   - Notices drafted (by auto-pipeline or manual)
   - Vendor agents completed
   - High-risk anomalies detected
   - Upcoming deadlines
2. If anything to report, sends a styled HTML email

**CA experience:** Beautiful summary email arrives at 7 AM. "5 things happened overnight."

**Files:**
- `src/app/api/cron/morning-digest/route.ts`

**User preference:** Can disable in Settings (defaults to enabled).

---

### 8. Client document chase — pre-deadline WhatsApp

**Trigger:** Daily at 10:00 AM IST
**Endpoint:** `/api/cron/client-doc-chase`

**What it does:**
1. Computes days to next GSTR-3B filing deadline (typically 20th of month)
2. If T-7, T-3, T-1, or T-0:
   - For each active client with phone number
   - AI drafts WhatsApp message in client's preferred language (escalating urgency)
   - Sends via WhatsApp Cloud API

**CA experience:** Clients get reminded before deadline. CA's stress reduced.

**Files:**
- `src/lib/agents/doc-collector.ts`
- `src/app/api/cron/client-doc-chase/route.ts`

---

### 9. Section 16(4) deadline alerts — weekly

**Trigger:** Mondays at 5:00 AM IST during Oct-Nov
**Endpoint:** `/api/cron/section-16-deadlines`

**What it does:** Alerts CAs about the 30th November deadline for claiming ITC for the previous FY. Critical for tax compliance.

---

## In-app notification system

**Tables:** `notifications`, `notification_preferences`

**Triggered by:** Every automation layer above sends notifications via `createNotification()` in `src/lib/notifications/send.ts`.

**CA experience:**
- Bell icon in sidebar with unread count badge
- Click bell → dropdown with last 15 notifications
- Click any → navigates to the related entity (notice, mismatch, etc.)
- "Mark all read" button
- Full history page at `/app/notifications`

**Real-time:** Currently polls every 60 seconds. Future: Supabase Realtime for instant push.

**Files:**
- `src/components/NotificationBell.tsx`
- `src/app/api/notifications/route.ts`
- `src/app/app/notifications/page.tsx`

---

## Cron schedule summary (IST)

| Time | Cron | What |
|---|---|---|
| Every 5 min | `gmail-sync` | Check inboxes for new notices |
| Every 4 hrs | `vendor-followup-tick` | Escalate stuck vendor agents |
| 6:00 AM daily | `daily-anomaly-scan` | Pre-filing risk detection |
| 7:00 AM daily | `morning-digest` | Email digest to firm owners |
| 9:00 AM daily | `deadline-reminders` | Notice & hearing alerts |
| 10:00 AM daily | `client-doc-chase` | WhatsApp clients before deadlines |
| Mondays 5 AM (Oct-Nov) | `section-16-deadlines` | Annual ITC claim deadline |

**Vercel Cron:** Configured in `vercel.json`. Auto-runs on production deployment. Locally, you can manually trigger with: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/morning-digest`.

---

## Cost analysis at 100 paying customers

| Automation | Cost basis | Monthly cost |
|---|---|---|
| Gmail sync | Free (Google API) | ₹0 |
| PDF OCR (Gemini Flash) | ~₹3/notice × 500 notices | ₹1,500 |
| Claude drafting | Already counted in per-notice pricing | (covered by revenue) |
| WhatsApp Business | Free first 1000 conversations/mo | ₹0 |
| Voice (Exotel + Sarvam) | ~₹15/escalation × 50 | ₹750 |
| Resend email | Free first 3000/mo | ₹0 |
| Vercel Cron | Free up to 100 invocations/day | ₹0 |
| **Total infra cost** | | **₹2,250/mo** |

At 100 customers × ₹999 avg/notice × 5 notices/mo = ₹5L revenue → 99.5% gross margin.

---

## What's still manual (and how to push further)

| Manual today | How to fully automate |
|---|---|
| Reconciliation triggers (CA uploads CSV) | Auto-pull from Tally via TDL connector (₹3-5L investment) OR via GSP API monthly cron |
| GSTR-2B fetch (currently mock) | Sign Cygnet GSP contract → set env vars → automatic monthly pull cron |
| Notice filing on GST portal | NOT recommended — never store portal creds. Always CA's final action. |
| Reading scanned invoices into Tally | Phase 2: forward invoice PDFs → Gemini Vision → Tally connector |

---

## Failure handling

Each cron job:
1. Logs to `scheduled_job_logs` with status, duration, item counts
2. Catches errors per-item (one bad email doesn't stop the whole sync)
3. Updates `email_integrations.status = 'error'` on auth failures
4. Notifies CA on critical failures (auth revoked, etc.)

Monitor via `scheduled_job_logs` table:
```sql
select job_name, status, items_succeeded, items_failed, duration_ms, completed_at
from scheduled_job_logs
order by completed_at desc
limit 50;
```

---

## Day-in-the-life with full automation

```
6:00 AM — Cron: anomaly scan runs across all clients
6:05 AM — Cron: high-risk anomalies created, in-app notifications fired
7:00 AM — Cron: morning digest emailed to Rakesh
                "5 drafts ready, 2 vendor agents resolved overnight, 3 deadlines this week"
7:30 AM — Rakesh checks email, opens digest
7:45 AM — Rakesh opens app, sees 5 drafts to approve in Smart Inbox
8:00 AM — Client forwards new ASMT-10 to Rakesh
8:05 AM — Cron: gmail-sync runs, detects new notice
8:05 AM — Auto-draft pipeline starts: OCR + Claude + Razorpay link
8:06 AM — Draft ready, notification sent to Rakesh
8:06 AM — Rakesh's phone buzzes: "✓ Draft ready for new client"
9:00 AM — Cron: deadline reminders sent
9:30 AM — Rakesh in client meeting, ignores phone
10:00 AM — Cron: doc chase (T-3 days for GSTR-3B) WhatsApps 50 clients
12:00 PM — Vendor replies "done filed" on WhatsApp
12:00 PM — Webhook fires, AI classifies as confirmation
12:00 PM — Mismatch auto-resolved, notification: "✓ ABC Vendor resolved, ₹37K ITC saved"
2:00 PM — Cron (4-hour): vendor follow-up tick runs
2:00 PM — 3 vendor agents escalated to WhatsApp
4:00 PM — Rakesh opens app, sees bell with "12 new notifications"
4:30 PM — Approves 5 drafts in 10 minutes
5:00 PM — Wraps up. Goes home.
```

**Rakesh's interventions today:** 4 approvals (10 min total) + 1 meeting (1 hr).
**NotusAI's autonomous actions today:** 50 client WhatsApps, 5 notice drafts, 3 vendor escalations, 1 vendor resolution, 30 anomalies scanned, 1 morning digest email, 5 deadline alerts.

This is the differentiator that justifies ₹15K-50K/month pricing.
