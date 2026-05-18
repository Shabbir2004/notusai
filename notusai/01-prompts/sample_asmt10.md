# Sample ASMT-10 Notice — for testing the master prompt

Use this synthetic notice to test the master prompt tonight. It's based on real ASMT-10 patterns but fully fictional.

---

## Paste this AS THE USER MESSAGE after the system prompt:

```
Please draft a formal reply for the following notice.

CLIENT DETAILS:
- Client Name: Sharma Textile Industries
- GSTIN: 27AABCS1234M1Z5
- State: Maharashtra
- Notice Number: ASMT-10/MUM/W-04/2025/3847
- Notice Date: 12.10.2025
- Notice Type: ASMT-10 (Scrutiny of Returns)
- Period in Question: April 2025 to June 2025 (Q1 FY 2025-26)
- Demand Amount: ₹3,42,000
- Issuing Authority: Assistant Commissioner of State Tax, Ward 04, Mumbai

NOTICE TEXT (verbatim):
"""
Subject: Scrutiny of returns filed for the tax period April 2025 to June 2025 —
Discrepancies noticed — Notice under Section 61 of the Maharashtra GST Act, 2017
read with Rule 99 of the Maharashtra GST Rules, 2017.

You have filed Form GSTR-3B for the said period claiming Input Tax Credit (ITC)
of Rs. 18,42,000. However, on cross-verification with auto-populated GSTR-2B for
the same period, the eligible ITC reflected is only Rs. 15,00,000.

Discrepancy noted: Excess ITC claimed of Rs. 3,42,000.

You are hereby called upon to explain the discrepancy within 30 days from the date
of receipt of this notice, failing which proceedings under Section 73/74 of the
CGST Act, 2017 will be initiated for recovery of tax along with applicable interest
under Section 50 and penalty as per law.

If you wish to make any submission, please reply through Form GST ASMT-11 on the
common portal within the stipulated time.
"""

KEY FACTS FROM CLIENT (relevant to defense):
- Of the Rs. 3,42,000 excess: Rs. 2,10,000 relates to vendor "Patel Yarn Mills"
  whose GSTR-1 for April 2025 was filed late (filed on 18.07.2025). This will
  reflect in subsequent GSTR-2B.
- Rs. 80,000 relates to vendor "Mumbai Trading Co" — vendor confirms invoice was
  uploaded but in B2C section by mistake. Amendment expected.
- Remaining Rs. 52,000 — genuine error by accountant, client is willing to reverse
  this with interest under Section 50.
- All payments to vendors made within 60 days via NEFT (bank statements available).

PRACTITIONER PREFERENCES:
- Balanced defense — claim the Rs. 2,90,000 that's genuine, reverse the Rs. 52,000 error.
- Emphasize Rule 36(4) and any HC ruling on vendor non-compliance.

Please produce the executive summary, formal reply, citations list, and
questions section.
```

---

## What a good output looks like

When Claude responds, you should see roughly:

1. **EXECUTIVE SUMMARY** — 5 lines summarizing the notice and your recommended strategy
2. **Formal letter** — addressed to the Assistant Commissioner, properly structured
3. **Para 1** — acknowledging receipt of notice
4. **Para 2** — factual background of Q1 FY 25-26 transactions
5. **Paras 3, 4, 5** — three separate grounds of defense, each citing:
   - Section 16(2) and Rule 36(4) of CGST Rules
   - Possibly Section 16(2)(c) on payment within 180 days
   - One or two case laws on vendor non-compliance (HC of Madras/Bombay rulings exist on this)
6. **Prayer** — request to drop proceedings on Rs. 2,90,000, accept reversal of Rs. 52,000
7. **List of enclosures**
8. **Citations used** section
9. **Questions for practitioner** (if anything was unclear)

If the output is missing any of these or sounds generic, refine the prompt and try again. This is the iteration loop you'll do for 100+ hours over 6 months. That refinement IS the moat.

---

## Red flags to watch for in early drafts

- Inventing case citations (always verify on Indian Kanoon: indiankanoon.org)
- Vague section references ("relevant provisions" without numbers)
- Wrong tone (too aggressive or too apologetic)
- Missing the prayer section
- Not addressing the specific demand amount math

When you see these, refine the system prompt. Add a new "NON-NEGOTIABLE STANDARD" rule for each red flag you find.
