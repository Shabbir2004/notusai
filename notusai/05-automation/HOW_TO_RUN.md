# How to use the Python notice drafter

**This is Phase 2.** Don't touch this until you've done 10+ notices manually using Claude.ai.

When you're ready: ~₹3-8 per notice using API (vs ₹1,700/month for Claude.ai Pro).

---

## Setup (one-time, ~30 minutes)

### Step 1: Install Python

Open PowerShell, run:
```powershell
python --version
```

If you see `Python 3.10` or higher, skip to Step 2. Otherwise:
1. Go to **python.org/downloads**
2. Download Python 3.12 for Windows
3. During install: ✅ check "Add Python to PATH"
4. Restart PowerShell, run `python --version` again

### Step 2: Get Anthropic API key

1. Go to **console.anthropic.com** → Sign up
2. Add ₹2,000 worth of credit (around $24) — this funds ~250 notice drafts
3. API Keys → Create Key → copy the `sk-ant-...` string
4. **Save it somewhere safe.** You can't see it again.

### Step 3: Install the package

In PowerShell, navigate to the script folder:
```powershell
cd D:\Startup_Ideas\notusai\05-automation
pip install -r requirements.txt
```

### Step 4: Set your API key as environment variable

In PowerShell (this session only):
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"
```

To set permanently (recommended):
```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-your-key-here', 'User')
```
Restart PowerShell after running this.

---

## Using the script

### Create your inputs

For each notice, you need 2 files:

**File 1: `notice.txt`** — paste the notice text (OCR if it's a PDF/photo first)

**File 2: `intake.json`** — the 6 questions answered by the CA:

```json
{
  "client_name": "Sharma Textile Industries",
  "gstin": "27AABCS1234M1Z5",
  "state": "Maharashtra",
  "notice_number": "ASMT-10/MUM/W-04/2025/3847",
  "notice_date": "12.10.2025",
  "notice_type": "ASMT-10",
  "period": "April 2025 to June 2025",
  "demand_amount": "₹3,42,000",
  "authority": "Assistant Commissioner of State Tax, Ward 04, Mumbai",
  "key_facts": "Vendor Patel Yarn Mills filed GSTR-1 late on 18.07.2025; Mumbai Trading Co posted as B2C by mistake; Rs. 52,000 is genuine error willing to reverse. All payments via NEFT within 60 days.",
  "tone": "balanced",
  "case_law_preference": "Emphasize Rule 36(4) and Madras HC ruling on vendor non-compliance"
}
```

### Run it

```powershell
python notice_drafter.py --notice notice.txt --intake intake.json
```

Output:
```
Drafting with model: claude-sonnet-4-6
Client: Sharma Textile Industries
Notice type: ASMT-10
---
✓ Draft written to: drafts\sharma_textile_industries_20251125.md
✓ Tokens: 1247 in / 2891 out
✓ Cost: ₹5.04 (estimate)

Margin at ₹999/notice: ₹993.96
Margin at ₹1,999/notice: ₹1993.96
Margin at ₹4,999/notice: ₹4993.96
```

The draft is saved as Markdown. Open it, paste into Google Docs, format, export PDF, send to customer.

### For Complex notices, use Opus

```powershell
python notice_drafter.py --notice notice.txt --intake intake.json --premium
```

Costs ~₹25-40 per notice instead of ₹5-8, but produces a better draft for ₹4,999-tier cases. Still 99% margin.

---

## Pro tips

### Tip 1: Batch your drafting

When you have 5+ notices in queue, write a small wrapper script that loops through a folder of `notice_*.txt + intake_*.json` files. Saves you 20 min/day of manual command running.

### Tip 2: Track costs per customer

Add cost to your Google Sheet for every notice. After 50 notices you'll know real unit economics — important when you start fundraising or hiring.

### Tip 3: Save your prompts in version control

The SYSTEM_PROMPT in `notice_drafter.py` is your IP. Every time you improve it after seeing a draft that needed editing, commit the change to git. Build a private GitHub repo:
```powershell
cd D:\Startup_Ideas\notusai
git init
git add .
git commit -m "Initial commit"
```

(Set up GitHub repo as private, push there.)

### Tip 4: Add caching to save 50% on cost

When you reach 100+ drafts/month, Anthropic's prompt caching (cache the system prompt) cuts cost by ~70%. Update `notice_drafter.py` to use `cache_control`:

```python
system=[
    {
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }
]
```

Look up "Anthropic prompt caching docs" when you get to that scale.

---

## Troubleshooting

**`ANTHROPIC_API_KEY not set`** — you didn't set the env var. Re-do Step 4 above.

**`anthropic package not installed`** — run `pip install anthropic` again. Make sure you're in the right virtual env if you use one.

**Draft has fake case citations** — improve the SYSTEM_PROMPT to add stricter language ("If you cannot verify a case citation against your training data with high confidence, mark it as [VERIFY]"). Iterate the prompt every week.

**Output is too short / too long** — adjust `max_tokens=4096` to a higher number (8000 max for Sonnet 4.6).

**Costs are higher than expected** — your input tokens are too high. Likely the notice text is very long (5000+ words). Consider summarizing the notice first with a cheap model (Haiku) before passing to Sonnet.

---

## When to upgrade from this script

Move beyond this script when:

- You're doing 50+ notices/month and bottlenecked on manual CLI runs → Build a web interface
- Multiple people on team need to draft simultaneously → Build a proper backend
- Customers asking to upload notice PDFs directly → Build the self-serve product

At that point, hire your first part-time developer or use Bolt.new / v0 to scaffold a Next.js app around this same prompt.

The core IP (the prompt + the workflow) stays the same forever. Just the wrapper around it changes.
