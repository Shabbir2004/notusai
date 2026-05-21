# Tally Bridge — User Guide for CAs

**The killer feature.** Stop typing client invoices into Tally. NotusAI reads invoices (PDFs, photos), and you import them into Tally with one click.

---

## How it works (3-step setup per client)

```
            ┌──────────────┐
   STEP 1   │ Sync ledgers │   Export your Tally ledger list as XML →
            │ from Tally   │   upload to NotusAI. One-time per client.
            └──────┬───────┘
                   │
            ┌──────▼──────────┐
   STEP 2   │ Map vendors     │   AI proposes which NotusAI vendor maps
            │ to ledgers      │   to which Tally ledger. Approve all.
            └──────┬──────────┘
                   │
            ┌──────▼──────────┐
   STEP 3   │ Export & import │   Click "Download Tally XML". Import in
            │ vouchers        │   Tally with 2 clicks. Done.
            └─────────────────┘
```

---

## Where invoices come from (the data must flow in first)

Before you can use Tally Bridge, **invoices must be in NotusAI**. Sources:

| How invoices arrive | Set up once |
|---|---|
| Client forwards PDF/photo invoices to your Gmail | Already done — Gmail watcher auto-reads them |
| Client uses NotusAI client portal | Send them the portal link (per client) |
| You upload Tally CSV manually | `/app/reconciliation/new` |

Once invoices are in `/app/clients/[clientName]`, they're ready for Tally Bridge.

---

## STEP 1: Sync ledgers from Tally (3 minutes, one-time per client)

### Why we need this

Every CA's Tally has its own ledger structure. Your "Purchase A/c" might be called "Purchases - Trading", and your "Input CGST 9%" might be "CGST Input 18% (Goods)". To generate vouchers Tally will accept, NotusAI needs to know YOUR Tally's exact ledger names.

### How to export ledgers from Tally

**For Tally Prime:**
1. Open the relevant client's company in your Tally
2. Go to **Gateway of Tally** → **Display More Reports** → **List of Accounts** → **Ledgers**
3. Press **Alt+E** (Export) or click the **Export** button
4. **File Format:** select **XML**
5. **Save** the file (give it a meaningful name like `sharma_textile_ledgers.xml`)

**For Tally ERP 9 (older):**
1. Gateway of Tally → **Display** → **List of Accounts** → **Ledgers**
2. Press **Alt+E** → Format: **XML** → Save

### Upload to NotusAI

1. Open client in NotusAI: `/app/clients/[clientId]`
2. Click **⚡ Tally Bridge** in the top-right
3. Enter the **exact Tally company name** (case-sensitive!) — e.g., "Sharma Textile Industries"
4. Click **Upload Tally ledger XML**
5. Select your exported XML file
6. NotusAI parses ~5 seconds → shows "47 ledgers imported"

**Re-sync** anytime you create new ledgers in Tally. NotusAI replaces the old list with the new one.

---

## STEP 2: Map vendors to ledgers (5 minutes, mostly one-time)

### Why

NotusAI's invoice OCR extracts vendor names from PDFs. Those names might differ from what's in your Tally ledger:
- OCR extracts: "Patel Yarn Mills"
- Your Tally has: "M/s. Patel Yarn Mills Pvt. Ltd."

The system uses AI fuzzy matching to figure out which goes with which.

### What you'll see

The Tally Bridge page shows a table:

| Vendor (NotusAI) | Matched ledger (Tally) | Confidence |
|---|---|---|
| Patel Yarn Mills · 27AABCS5678M1Z3 | M/s. Patel Yarn Mills Pvt. Ltd. | ✓ High |
| Mumbai Trading Co | Mumbai Trading Co. | ✓ High |
| Bangalore Electronics | Bangalore Elec | Likely |
| KK Industries · 27AABCS2222M1Z8 | (none found) | Will create |

**Confidence levels:**
- **✓ High** — GSTIN matched OR exact name match. Auto-approve safe.
- **Likely** — Strong fuzzy match (e.g., 90% similar). Verify quickly.
- **Check** — Weak fuzzy match. Worth a second look.
- **Will create** — No match found. NotusAI will create a new ledger in Tally when importing.

### Approve

Click **Approve all mappings**. From now on, every invoice from "Patel Yarn Mills" will be posted to "M/s. Patel Yarn Mills Pvt. Ltd." in your Tally.

New vendors that come in later need their own approval — they'll appear on this page automatically.

---

## STEP 3: Export & import vouchers (1 minute per batch)

### Generate the XML

1. Open Tally Bridge page for the client
2. You see: **"12 invoices ready · ₹3,45,000 total value"**
3. Click **Download Tally voucher XML**
4. Browser downloads: `notusai_tally_SharmaTextile_2026-05-19.xml`

### Import into Tally

1. Open the **same client's company** in Tally (the one matching the company name you set in Step 1)
2. Go to **Gateway of Tally** → **Import Data** → **Vouchers**
3. **Type of File:** XML
4. Browse to the downloaded XML file
5. Click **Import**

Tally will show: **"12 vouchers imported successfully"**

### What got imported

For each invoice, NotusAI created a Purchase voucher in Tally with:
- ✅ Voucher date = invoice date
- ✅ Party ledger (vendor) = mapped Tally ledger
- ✅ Purchase A/c (Dr) = taxable value
- ✅ Input CGST (Dr) = CGST amount (or Input IGST for interstate)
- ✅ Input SGST (Dr) = SGST amount
- ✅ Vendor GSTIN attached
- ✅ Narration: "Imported from NotusAI · Inv [number]"

These vouchers are now **proper accounting entries** in your client's Tally. They'll show up in:
- Day Book
- Purchase Register
- GSTR-1 / GSTR-2 / GSTR-3B reports
- Trial Balance, P&L, Balance Sheet

---

## Configuration: defaults (set once per firm OR per client)

### Default ledger names

Default ledgers used in vouchers (you can customize per client):

| Field | Default value | Where to customize |
|---|---|---|
| Purchase ledger | `Purchase A/c` | Settings → Tally Defaults |
| Input CGST | `Input CGST` | Settings → Tally Defaults |
| Input SGST | `Input SGST` | Settings → Tally Defaults |
| Input IGST | `Input IGST` | Settings → Tally Defaults |

**If your Tally uses different names**, update the per-client config (see `/app/clients/[id]/tally-bridge` → "Default ledgers" section — coming soon).

For now, **make sure your Tally has these standard ledger names** OR customize the names in the database `client_tally_config` table.

---

## Troubleshooting

### "Tally couldn't import — ledger 'XXX' not found"

**Cause:** A ledger referenced in the XML doesn't exist in your Tally.

**Fix:**
1. Note which ledger Tally is complaining about (usually a vendor ledger)
2. In Tally, manually create the ledger with that exact name under "Sundry Creditors"
3. Re-import the same XML file

**OR** re-sync your ledgers in NotusAI Step 1 — if you've created new ledgers in Tally since the last sync, you need to re-export.

### "Vouchers imported but amounts are negative"

**Cause:** Sign convention error in our XML.

**Fix:** Already handled in NotusAI's XML generator. If you still see this, file a bug — paste the invoice numbers that imported incorrectly so we can debug.

### "Company name mismatch" error from Tally

**Cause:** The XML targets a company name that doesn't exactly match the active Tally company.

**Fix:** In Tally, open the company whose name matches `tally_company_name` in NotusAI. Or update the company name in Step 1 setup to match Tally exactly.

### "Duplicate voucher" error

**Cause:** You already imported these vouchers once before.

**Fix:** Either delete the previous vouchers in Tally and re-import, OR change the voucher numbers (rare). NotusAI marks invoices as exported after first download so this shouldn't happen unless you re-download manually.

### Invoices show in NotusAI but not in Tally after import

**Cause:** Tally's "Default View" might be hiding them.

**Fix:**
1. Gateway of Tally → Display → Day Book → check the import date — vouchers should be there
2. If still missing, check Tally Audit log: Display → Statements of Accounts → Audit
3. If you see "Skipped" entries, scroll right to see why

---

## Pricing impact

This feature alone justifies premium pricing. CAs who use this **save ₹50K-₹2L/month** in junior data-entry labor.

**Position it like this:**
> *"Stop paying juniors to type invoices into Tally. Your clients forward invoices to NotusAI, AI reads them, you import to Tally with one click. The ₹35K/month NotusAI bill saves you ₹70K/month in staff time. ROI in week 1."*

---

## What's NOT included (yet — future enhancements)

- **Sales invoice export** (only Purchase right now — Sales coming in Phase 2)
- **Real-time push to Tally** (you click Export → import; future: auto-sync via TDL connector)
- **Auto-creation of standard ledgers** (assumes Purchase A/c, Input CGST etc. exist; future: include in XML)
- **Multi-line item invoices** (currently single-line per voucher; future: line-item splitting)
- **Journal vouchers, debit notes, credit notes** (Phase 3)

These will land in upcoming releases as paying customers request them.

---

## Cost & limits

| Item | Cost |
|---|---|
| NotusAI Tally Bridge feature | Included in Practice tier (₹14,999/mo) |
| Gemini OCR per invoice | ~₹2-5 |
| Tally export | ₹0 (no charge per export) |
| Tally license | (you already have it) |

No additional Tally Server license needed. Works with desktop Tally Prime + ERP 9.
