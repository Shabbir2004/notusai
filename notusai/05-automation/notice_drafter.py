#!/usr/bin/env python3
"""
NotusAI Notice Drafter — Phase 2 automation script.

When you've done 10+ notices manually using Claude.ai and want to automate the
drafting workflow, run this script. It uses the Anthropic API directly so you
have programmatic control.

Usage:
    python notice_drafter.py --notice path/to/notice.txt --intake intake.json

Cost: ~₹3-8 per notice using Claude Sonnet 4.6 (much cheaper than Claude.ai Pro).

Requirements: Python 3.10+, anthropic SDK, an Anthropic API key.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    from anthropic import Anthropic
except ImportError:
    print("ERROR: anthropic package not installed. Run: pip install anthropic")
    sys.exit(1)


# ---------- Configuration ----------

DEFAULT_MODEL = "claude-sonnet-4-6"  # Cheap & smart. Use opus only for complex cases.
PREMIUM_MODEL = "claude-opus-4-7"    # For Complex tier notices

SYSTEM_PROMPT = """You are a senior Chartered Accountant in India with 20 years of practice in GST, indirect tax, and tax litigation. You have personally drafted over 5,000 replies to GST scrutiny notices, ASMT-10s, DRC-01s, and Section 73/74 show-cause notices.

Your job: draft a formal reply to a GST notice that a junior CA can present to their senior partner for sign-off without any further editing.

NON-NEGOTIABLE STANDARDS:

1. Cite specific sections of the CGST Act 2017, IGST Act 2017, and CGST Rules 2017. Always include section/rule numbers. Never cite a section without a number.

2. Reference relevant CBIC circulars and notifications by exact number and date when applicable.

3. Cite at least TWO judicial precedents — High Court rulings, CESTAT/GST Tribunal orders, or Supreme Court judgments — that support the assessee's position. If you are unsure of a specific case citation, state "[Reference: Insert case citation — verify before filing]" rather than inventing one. NEVER fabricate citations.

4. Structure the reply with: letterhead placeholder, subject line, salutation, factual background, grounds of defense (numbered, with section/rule + case-law citation each), prayer, enclosures, authorized signatory block.

5. Tone: respectful, technical, defensive but never combative. Use phrases like "It is humbly submitted that...", "Without prejudice to the above...", "The assessee craves leave to refer to..."

6. End with this watermark: "Drafted with assistance from NotusAI. Final review and signature by [Practitioner Name, Membership No.] required before filing."

7. Calculate interest under Section 50 (18% p.a.) and penalty exposure under Section 73(9)/74(9).

8. If input has gaps, output a "QUESTIONS FOR PRACTITIONER" section listing what's missing. Do NOT guess.

OUTPUT FORMAT:

Begin with a 5-line "EXECUTIVE SUMMARY" box:
- Notice type:
- Total demand:
- Interest exposure (estimated):
- Recommended strategy (1-2 sentences):
- Predicted outcome (low/medium/high probability of relief):

Then the formal reply letter in clean Markdown.

Then a "CITATIONS USED" section.

Then a "QUESTIONS FOR PRACTITIONER" section if any input was incomplete."""


# ---------- Core function ----------

def draft_notice_reply(notice_text: str, intake: dict, model: str = DEFAULT_MODEL) -> dict:
    """Generate a draft reply for a GST notice.

    Args:
        notice_text: Full text of the notice (OCR'd or pasted)
        intake: Dict with client_name, gstin, period, deadline, key_facts, tone
        model: Anthropic model to use

    Returns:
        Dict with 'draft' (str), 'usage' (token counts), 'cost_inr' (estimated)
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. Get one from console.anthropic.com, "
            "then set it: $env:ANTHROPIC_API_KEY = 'sk-ant-...'"
        )

    client = Anthropic(api_key=api_key)

    user_message = f"""Please draft a formal reply for the following notice.

CLIENT DETAILS:
- Client Name: {intake.get('client_name', '[MISSING]')}
- GSTIN: {intake.get('gstin', '[MISSING]')}
- State: {intake.get('state', '[NOT PROVIDED]')}
- Notice Number: {intake.get('notice_number', '[MISSING]')}
- Notice Date: {intake.get('notice_date', '[NOT PROVIDED]')}
- Notice Type: {intake.get('notice_type', 'unknown')}
- Period in Question: {intake.get('period', '[MISSING]')}
- Demand Amount: {intake.get('demand_amount', '[NOT QUANTIFIED]')}
- Issuing Authority: {intake.get('authority', '[NOT PROVIDED]')}

NOTICE TEXT (verbatim):
\"\"\"
{notice_text}
\"\"\"

KEY FACTS FROM CLIENT (relevant to defense):
{intake.get('key_facts', '[NOT PROVIDED — flag in Questions for Practitioner]')}

PRACTITIONER PREFERENCES:
- Defense tone: {intake.get('tone', 'balanced')}
- Specific case law to emphasize: {intake.get('case_law_preference', 'use your best judgment')}

Please produce the executive summary, formal reply, citations list, and questions section."""

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    # Cost estimation (approximate, in INR)
    # Sonnet 4.6: ~$3/M input, $15/M output
    # Opus 4.7: ~$15/M input, $75/M output
    rates = {
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-opus-4-7": (15.0, 75.0),
    }
    in_rate, out_rate = rates.get(model, (3.0, 15.0))
    input_cost_usd = (response.usage.input_tokens / 1_000_000) * in_rate
    output_cost_usd = (response.usage.output_tokens / 1_000_000) * out_rate
    total_inr = (input_cost_usd + output_cost_usd) * 84  # ~₹84/$

    draft_text = "".join(block.text for block in response.content if hasattr(block, "text"))

    return {
        "draft": draft_text,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
        "cost_inr": round(total_inr, 2),
        "model": model,
    }


# ---------- CLI ----------

def main():
    parser = argparse.ArgumentParser(description="NotusAI — draft a GST notice reply")
    parser.add_argument("--notice", required=True, help="Path to .txt file with notice text")
    parser.add_argument("--intake", required=True, help="Path to .json file with intake details")
    parser.add_argument("--out", default=None, help="Path to write draft .md (default: ./drafts/{client}_{date}.md)")
    parser.add_argument("--model", default=DEFAULT_MODEL, choices=[DEFAULT_MODEL, PREMIUM_MODEL])
    parser.add_argument("--premium", action="store_true", help="Use Opus for complex cases")
    args = parser.parse_args()

    # Load inputs
    notice_path = Path(args.notice)
    intake_path = Path(args.intake)

    if not notice_path.exists():
        print(f"ERROR: Notice file not found: {notice_path}")
        sys.exit(1)
    if not intake_path.exists():
        print(f"ERROR: Intake file not found: {intake_path}")
        sys.exit(1)

    notice_text = notice_path.read_text(encoding="utf-8")
    intake = json.loads(intake_path.read_text(encoding="utf-8"))

    model = PREMIUM_MODEL if args.premium else args.model
    print(f"Drafting with model: {model}")
    print(f"Client: {intake.get('client_name', 'UNKNOWN')}")
    print(f"Notice type: {intake.get('notice_type', 'UNKNOWN')}")
    print("---")

    # Generate
    result = draft_notice_reply(notice_text, intake, model=model)

    # Output path
    if args.out:
        out_path = Path(args.out)
    else:
        date_str = datetime.now().strftime("%Y%m%d")
        client_slug = intake.get("client_name", "client").replace(" ", "_").lower()
        out_path = Path("drafts") / f"{client_slug}_{date_str}.md"
        out_path.parent.mkdir(exist_ok=True)

    out_path.write_text(result["draft"], encoding="utf-8")

    print(f"✓ Draft written to: {out_path}")
    print(f"✓ Tokens: {result['usage']['input_tokens']} in / {result['usage']['output_tokens']} out")
    print(f"✓ Cost: ₹{result['cost_inr']} (estimate)")
    print()
    print(f"Margin at ₹999/notice: ₹{round(999 - result['cost_inr'], 2)}")
    print(f"Margin at ₹1,999/notice: ₹{round(1999 - result['cost_inr'], 2)}")
    print(f"Margin at ₹4,999/notice: ₹{round(4999 - result['cost_inr'], 2)}")


if __name__ == "__main__":
    main()
