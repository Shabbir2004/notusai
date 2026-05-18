# NotusAI — Bootstrapped Launch Kit

A complete starter kit for launching an AI-powered GST notice reply service from zero capital, as a solo founder in India.

**Total cost to launch:** ₹0 to start. ~₹2,000 after first customer pays.

---

## What's in this kit

```
notusai/
├── START_HERE.md                    ← Read this first
├── README.md                         ← You are here
│
├── 01-prompts/                       The AI engine
│   ├── master_notice_prompt.md         Main drafting prompt for Claude
│   ├── notice_classifier_prompt.md     30-sec triage prompt
│   └── sample_asmt10.md                Test case to validate the prompt
│
├── 02-outreach/                      Sales playbook
│   ├── whatsapp_pitch.md               Cold WhatsApp scripts
│   ├── linkedin_dm.md                  LinkedIn outreach
│   ├── email_template.md               Email scripts
│   └── follow_up_sequences.md          When and how to follow up
│
├── 03-templates/                     Customer-facing templates
│   ├── customer_intake_form.md         6 questions to ask new customers
│   ├── delivery_message.md             How to deliver finished drafts
│   └── draft_output_format.md          Quality bar for drafts
│
├── 04-landing-page/                  Free public website
│   ├── index.html                      Standalone HTML page
│   └── README.md                       How to deploy free
│
├── 05-automation/                    For Phase 2 — when you have ₹2K
│   ├── notice_drafter.py               Python automation script
│   ├── requirements.txt                Python packages
│   ├── sample_intake.json              Test data
│   ├── .env.example                    API key placeholder
│   └── HOW_TO_RUN.md                   Setup guide
│
├── 06-tracking/                      Your free CRM
│   ├── GOOGLE_SHEETS_SETUP.md          How to build it in Google Sheets
│   ├── leads_template.csv              Import template
│   └── notices_template.csv            Import template
│
└── 07-pricing/                       Payments
    └── razorpay_setup.md               Accept ₹999 payments in 30 min
```

---

## The 6-week launch plan

### Week 1: Validate (₹0 cost)
- Sign up for Claude.ai, Razorpay, GitHub
- Test the master prompt with sample_asmt10.md
- Deploy landing page on GitHub Pages
- Set up Google Sheets tracker
- Send 5 outreach messages

### Week 2-3: First conversation
- Send 50 more outreach messages
- Book your first CA call
- Listen more than you pitch
- Get permission to draft one free notice

### Week 4: First free draft
- Get a real notice from one CA
- Use master_notice_prompt.md on Claude.ai
- Format in Google Docs → PDF → send
- Ask for honest feedback

### Week 5-6: First paid customer
- If quality is good, charge ₹999 for next notice
- Set up Razorpay link
- When ₹999 hits your bank, screenshot it. That's the moment.

### Week 7+: Scale gradually
- Goal: 10 paying customers by month 3
- Goal: ₹50K MRR by month 6
- Reinvest revenue into Python automation, then a real web app

---

## The principles

1. **Sell before you build.** Manual workflow first. Code only when manual is the bottleneck.
2. **Zero cost until customer pays.** Use free tiers ruthlessly. No tool subscription before first customer revenue.
3. **One feature, not ten.** Notice reply drafting. Nothing else. Don't get distracted.
4. **Customer feedback is the product.** Talk to every customer after every notice. Update the prompt based on what they edited.
5. **Cash flow > revenue.** Don't take customers you can't deliver to well. Better 5 happy customers than 20 unhappy ones.

---

## Decisions already locked in

(These are from the planning conversation that produced this kit — see `D:\Startup_Ideas\NOTUS_PLAN.md` for the full architecture.)

- **Scope:** Notice reply drafting only (no recon, no copilot, no Tally — yet)
- **Pricing:** ₹999 / ₹1,999 / ₹4,999 pay-per-notice (no subscription yet)
- **Auto-filing:** ❌ Never. We deliver PDF, customer uploads to GST portal manually.
- **Tech stack:** Manual (Claude.ai) for first 10 customers → Python script (this folder) for next 50 → Full web app (Phase 3) at 50+
- **Team:** Solo founder. Hire only when MRR > ₹1L.

---

## The honest truth

This kit gives you everything you need to launch a real business.

But none of these files will make money on their own. You will. By:
- Sending uncomfortable cold messages to strangers
- Doing the work to draft excellent replies by hand
- Listening when customers say the draft was mediocre
- Trying again the next morning
- Doing this for 6 months before it gets exciting
- Probably failing twice before you succeed

That's the deal of being a founder. The kit can't shortcut that. It can only give you the cleanest possible starting point.

Now go open `START_HERE.md` and do the 4 things in "Tonight."

---

**Plan file:** `D:\Startup_Ideas\NOTUS_PLAN.md` (full system architecture for when you grow)
**Memory:** Your founder profile is saved so future Claude sessions remember the context

Good luck.
