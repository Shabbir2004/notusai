# Tracking — Your Free "CRM" in Google Sheets

You don't need HubSpot, Salesforce, or any paid CRM. Google Sheets is enough for the first 100 customers.

---

## Setup (one-time, 15 min)

1. Go to **sheets.google.com**
2. Create new spreadsheet, name it: `NotusAI — Master Tracker`
3. Create these 4 tabs (bottom of screen, click "+"):
   - Tab 1: **Leads**
   - Tab 2: **Notices**
   - Tab 3: **Customers**
   - Tab 4: **Finance**

Then import the CSV templates from this folder into each tab.

---

## Tab 1: Leads (every CA you've contacted)

Columns:

| Column | What goes here | Example |
|---|---|---|
| Date Added | First contact date | 25/11/2025 |
| Name | CA's name | Rakesh Mehta |
| Firm | Their CA firm | Mehta & Associates |
| City | | Pune |
| Source | How you found them | LinkedIn / Family ref / Cold |
| Phone | WhatsApp number | +91 9876543210 |
| Email | | rakesh@mehta-ca.com |
| LinkedIn URL | | linkedin.com/in/rakesh-mehta-ca |
| First Touch | Channel of first message | WhatsApp / LinkedIn / Email |
| Status | Cold / Engaged / Demo Booked / Customer / Lost | Engaged |
| Last Contact | Most recent message date | 28/11/2025 |
| Next Action | What to do next | Follow up Dec 5 |
| Touch Count | How many messages sent | 3 |
| Notes | Anything memorable | "Mentioned 6 partners, mostly GST work" |

**Color coding:**
- 🟢 Customer (paid at least once)
- 🟡 Demo Booked / Engaged
- ⚪ Cold / No reply yet
- 🔴 Lost (declined or 7+ touches no reply)

Review every Monday morning. Send batch follow-ups.

---

## Tab 2: Notices (every notice you draft)

Columns:

| Column | What goes here |
|---|---|
| Date Received | When CA sent you the notice |
| Customer (firm) | Which CA firm |
| End Client | The actual business with the notice |
| Notice Type | ASMT-10 / DRC-01 / etc |
| Notice Number | From the notice |
| Demand Amount | ₹ |
| Deadline | DD/MM/YYYY |
| Tier | Simple / Medium / Complex |
| Price Quoted | ₹999 / 1999 / 4999 |
| Status | Drafting / Delivered / Paid / Filed |
| Date Delivered | When you sent the PDF |
| Date Paid | When Razorpay shows payment |
| Razorpay Payment ID | pay_xxxxxxxxxx |
| Outcome | (after 30+ days) Closed / Escalated / Pending |
| Time Spent (hrs) | Your time on this draft |
| AI Cost (₹) | From the script output |
| Margin (₹) | Price - AI Cost - Razorpay fee |
| Notes | Anything special |

This tab is GOLD. After 50 notices, you have:
- Average margin per tier
- Average time per tier
- Win rate by notice type
- Best customers by volume

Show this data to investors later. It's your real moat.

---

## Tab 3: Customers (firms that have paid at least once)

Columns:

| Column | What goes here |
|---|---|
| Firm Name | |
| Primary Contact | CA name |
| Phone | |
| Email | |
| First Payment Date | |
| Total Notices Done | (formula: COUNTIF from Notices tab) |
| Total Revenue (₹) | (formula: SUMIF from Notices tab) |
| Last Notice Date | (formula: MAX from Notices tab) |
| Status | Active / Dormant (>45 days) / Churned (>90 days) |
| LTV Estimate | If active, project 12 months |
| Referrals From | If they brought another CA |
| Notes | |

---

## Tab 4: Finance (monthly summary)

Columns:

| Column | What goes here |
|---|---|
| Month | Nov 2025 |
| Notices Drafted | (formula: COUNT from Notices tab) |
| Revenue (₹) | (formula: SUM from Notices tab) |
| AI/Infra Cost (₹) | (formula: SUM cost column) |
| Razorpay Fees (₹) | ~2% of revenue |
| Gross Margin (₹) | Revenue - Costs |
| Gross Margin % | (formula) |
| New Customers | (count first payments this month) |
| Active Customers | (count customers with ≥1 notice this month) |
| Avg Revenue/Customer | |
| Hours Worked | (sum of time spent) |
| Effective Hourly Rate | Revenue / Hours |

This is your monthly health check. If "Effective Hourly Rate" stays above ₹2,000/hr, you're winning at solo founder economics.

---

## Why this matters

**Discipline is the moat at this stage.** Most aspiring founders never set up tracking because it feels "boring admin work." Then 3 months in, they have no idea:
- Which lead sources convert
- Which notice types are most profitable
- Which customers are repeat buyers
- Whether they're getting more efficient over time

You'll be one of the rare ones who does. By month 6, you'll have data nobody else in this space has.

---

## Pro tips

### Tip 1: Phone-friendly views

Sheets has a mobile app. Set up filtered views ("Show only customers needing follow-up today") and bookmark them. Update from your phone between meetings.

### Tip 2: Make weekly stand-ups with yourself

Every Monday 9 AM, sit with the sheet for 30 min. Ask:
- Who's overdue for a follow-up?
- Which customers haven't sent a notice in 30+ days? (Risk of churn — ping them)
- Did last week's experiment work? (e.g., "switched WhatsApp greeting language")

### Tip 3: Automate later

When you have 100+ rows in any sheet, the sheet starts getting slow. That's the right time to graduate to Airtable (free tier) or a real CRM. Not before.

### Tip 4: Backup weekly

File → Download → Excel format → save to your local drive every Friday. Sheets is reliable but redundancy never hurts.

---

## What NOT to track

Don't waste time tracking:
- Daily mood / energy
- Number of LinkedIn likes
- Page views on your landing page (until 1000+ visitors)
- Anything that doesn't directly correlate with revenue

For the first 6 months, the only number that matters is **paid notices × average price = revenue**. Everything else is vanity.
