# Notice Classifier Prompt — 30-second triage

Use this BEFORE drafting a reply. It tells you what type of notice you're dealing with, the deadline, and the severity. Send the customer a quick acknowledgment before doing the full draft.

---

## Paste this prompt:

```
You are a GST notice triage specialist. Read the notice text and output ONLY the
following structured information. Do not draft any reply. Just classify.

OUTPUT FORMAT (strict):

NOTICE TYPE: [ASMT-10 / DRC-01 / DRC-01A / DRC-07 / Section 61 SCN / Section 73 /
Section 74 / Audit Memo / Other — specify]

SEVERITY: [LOW / MEDIUM / HIGH / CRITICAL]
- LOW = informational/preliminary
- MEDIUM = scrutiny/clarification stage
- HIGH = SCN / proposed demand
- CRITICAL = final order / recovery proceedings

DEADLINE (DD.MM.YYYY): [exact date by which reply must be filed]

DAYS REMAINING: [from today's date]

DEMAND AMOUNT: [₹ figure if stated, else "Not quantified"]

PRIMARY ISSUE (1 sentence): [e.g., "ITC mismatch between GSTR-3B and GSTR-2B"]

APPLICABLE SECTIONS: [list specific Act sections cited in notice]

URGENT FOLLOW-UPS NEEDED FROM CLIENT: [up to 3 specific documents/clarifications]

REPLY COMPLEXITY: [Simple / Medium / Complex]
- Simple = standard mismatch, 2 page reply, 1 day work
- Medium = multi-issue, needs vendor coordination, 3-5 page reply
- Complex = high demand, multi-period, may need legal opinion

ESTIMATED REPLY TIME: [hours]

RECOMMENDED PRICING: [₹999 / ₹1,999 / ₹4,999]
- ₹999 = Simple
- ₹1,999 = Medium
- ₹4,999 = Complex

NOTICE TEXT:
"""
[paste notice here]
"""
```

---

## Why this matters

When a CA sends you a notice on WhatsApp, you have 5 minutes to respond. The classifier lets you:
1. Tell them the deadline (they'll trust you instantly if you spot it fast)
2. Quote a price upfront (₹999/₹1,999/₹4,999 based on complexity)
3. List what extra docs you need from them
4. Set expectations on turnaround

Send them back something like:

> *"Sir, dekha aapka notice. Yeh ASMT-10 hai under Section 61, deadline 11 November (8 din baaki). Issue ITC mismatch ka hai for Q1 FY25-26. Mujhe 2 docs chahiye aapse: (1) vendor Patel Yarn Mills ki GSTR-1 amendment confirmation, (2) bank statement showing payments. Pricing ₹1,999 for this since multi-issue hai. Draft kal evening tak ready. Razorpay link bhejun?"*

That message sounds like a senior CA. It's actually you + Claude in 5 minutes. This is your superpower.

---

## Pro tip: build a "tiered pricing" sense

Track in your Google Sheet which notices were Simple/Medium/Complex and what they ended up being worth in your time:
- Simple: 30-45 min, ₹999, healthy margin
- Medium: 60-90 min, ₹1,999, healthy margin
- Complex: 2-3 hours, ₹4,999, OK margin

If something takes longer than the tier's time, charge more next time for similar notices.
