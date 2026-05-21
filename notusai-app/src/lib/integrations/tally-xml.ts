/**
 * Tally XML voucher generator.
 *
 * Produces XML that Tally Prime / Tally ERP 9 can import via:
 *   Gateway of Tally → Import Data → Vouchers → select .xml
 *
 * Includes:
 *   1. Vendor ledger CREATE entries (skipped if ledger exists in Tally)
 *   2. Purchase voucher entries
 *
 * Accounting convention (Tally XML):
 *   ISDEEMEDPOSITIVE=Yes → Debit side (Purchase, Input GST)
 *   ISDEEMEDPOSITIVE=No  → Credit side (Vendor party)
 *
 * For a Purchase voucher:
 *   Cr Vendor               (positive amount)
 *   Dr Purchase A/c          (negative amount = taxable value)
 *   Dr Input CGST            (negative amount)
 *   Dr Input SGST            (negative amount)
 *   Dr Input IGST            (negative amount)
 * Sum = 0 (double-entry rule).
 */

export interface TallyInvoice {
  invoice_number: string;
  invoice_date: string; // ISO YYYY-MM-DD
  vendor_name: string;
  vendor_gstin: string | null;
  amount: number; // taxable value
  cgst: number;
  sgst: number;
  igst: number;
  hsn_code: string | null;
}

export interface TallyConfig {
  companyName: string;
  purchaseLedger: string;
  cgstLedger: string;
  sgstLedger: string;
  igstLedger: string;
  // Map of vendor_name → Tally ledger name (different per CA)
  vendorLedgerMap: Record<string, string>;
}

export interface XmlGenerationResult {
  xml: string;
  invoiceCount: number;
  totalValue: number;
  warnings: string[];
}

export function generateTallyVoucherXml(
  invoices: TallyInvoice[],
  config: TallyConfig,
): XmlGenerationResult {
  const warnings: string[] = [];
  const totalValue = invoices.reduce(
    (sum, inv) => sum + inv.amount + inv.cgst + inv.sgst + inv.igst,
    0,
  );

  // Step 1: collect unique vendors → CREATE ledger masters in XML
  // (Tally will skip if ledger already exists; create if not)
  const uniqueVendors = new Map<string, { name: string; gstin: string | null }>();
  for (const inv of invoices) {
    const ledgerName = config.vendorLedgerMap[inv.vendor_name] || inv.vendor_name;
    if (!uniqueVendors.has(ledgerName)) {
      uniqueVendors.set(ledgerName, {
        name: ledgerName,
        gstin: inv.vendor_gstin,
      });
    }
  }

  const ledgerMasters = Array.from(uniqueVendors.values())
    .map((v) => ledgerMasterXml(v.name, v.gstin))
    .join("\n");

  // Step 2: voucher entries
  const vouchers = invoices
    .map((inv) => {
      const ledgerName = config.vendorLedgerMap[inv.vendor_name] || inv.vendor_name;
      if (!config.vendorLedgerMap[inv.vendor_name]) {
        warnings.push(`Vendor "${inv.vendor_name}" had no ledger mapping — used vendor name directly`);
      }
      return voucherXml(inv, ledgerName, config);
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(config.companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${ledgerMasters}
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  return {
    xml,
    invoiceCount: invoices.length,
    totalValue,
    warnings,
  };
}

// ============================================
// LEDGER MASTER (create vendor in Tally if not exists)
// ============================================
function ledgerMasterXml(name: string, gstin: string | null): string {
  return `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${escapeXml(name)}" ACTION="Create">
            <NAME>${escapeXml(name)}</NAME>
            <PARENT>Sundry Creditors</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <PARTYGSTIN>${escapeXml(gstin || "")}</PARTYGSTIN>
            ${gstin ? "<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>" : ""}
            <COUNTRYNAME>India</COUNTRYNAME>
            <OPENINGBALANCE>0.00</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>`;
}

// ============================================
// VOUCHER (one per invoice)
// ============================================
function voucherXml(inv: TallyInvoice, vendorLedger: string, config: TallyConfig): string {
  const tallyDate = inv.invoice_date.replace(/-/g, ""); // YYYYMMDD
  const totalInvoiceValue = inv.amount + inv.cgst + inv.sgst + inv.igst;

  const isInterstate = inv.igst > 0;

  const entries: string[] = [];

  // 1) Credit Vendor ledger (positive amount, ISDEEMEDPOSITIVE=No)
  entries.push(ledgerEntryXml({
    ledger: vendorLedger,
    amount: totalInvoiceValue,
    isPositive: false,
    isParty: true,
  }));

  // 2) Debit Purchase A/c (negative amount = taxable value)
  entries.push(ledgerEntryXml({
    ledger: config.purchaseLedger,
    amount: -inv.amount,
    isPositive: true,
    isParty: false,
  }));

  // 3) Debit GST ledgers
  if (isInterstate && inv.igst > 0) {
    entries.push(ledgerEntryXml({
      ledger: config.igstLedger,
      amount: -inv.igst,
      isPositive: true,
      isParty: false,
    }));
  } else {
    if (inv.cgst > 0) {
      entries.push(ledgerEntryXml({
        ledger: config.cgstLedger,
        amount: -inv.cgst,
        isPositive: true,
        isParty: false,
      }));
    }
    if (inv.sgst > 0) {
      entries.push(ledgerEntryXml({
        ledger: config.sgstLedger,
        amount: -inv.sgst,
        isPositive: true,
        isParty: false,
      }));
    }
  }

  return `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(inv.invoice_number)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(inv.invoice_number)}</REFERENCE>
            <REFERENCEDATE>${tallyDate}</REFERENCEDATE>
            <PARTYLEDGERNAME>${escapeXml(vendorLedger)}</PARTYLEDGERNAME>
            <PARTYGSTIN>${escapeXml(inv.vendor_gstin || "")}</PARTYGSTIN>
            <NARRATION>Imported from NotusAI · Inv ${escapeXml(inv.invoice_number)}</NARRATION>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <ISINVOICE>Yes</ISINVOICE>
${entries.join("\n")}
          </VOUCHER>
        </TALLYMESSAGE>`;
}

function ledgerEntryXml(opts: {
  ledger: string;
  amount: number;
  isPositive: boolean;
  isParty: boolean;
}): string {
  // Tally AMOUNT field — positive for credit, negative for debit
  // (regardless of ISDEEMEDPOSITIVE; that flag indicates the entry's nature)
  return `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(opts.ledger)}</LEDGERNAME>
              <GSTCLASS/>
              <ISDEEMEDPOSITIVE>${opts.isPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
              <LEDGERFROMITEM>No</LEDGERFROMITEM>
              <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>
              <ISPARTYLEDGER>${opts.isParty ? "Yes" : "No"}</ISPARTYLEDGER>
              <AMOUNT>${opts.amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
}

// ============================================
// XML SAFETY
// ============================================
function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// ============================================
// PARSE Tally ledger XML export (for ledger sync)
// ============================================
export interface ParsedTallyLedger {
  name: string;
  parent: string;
  gstin: string | null;
  isPartyLedger: boolean;
  openingBalance: number;
  raw: Record<string, string>;
}

export function parseTallyLedgerExport(xmlText: string): ParsedTallyLedger[] {
  const ledgers: ParsedTallyLedger[] = [];

  // Tally Prime exports may use any of these structures:
  //  <LEDGER NAME="...">...</LEDGER>
  //  <LEDGER>...</LEDGER>
  //  <LEDGER NAME="..." RESERVEDNAME=""> wrapped inside <TALLYMESSAGE>
  //
  // Use case-insensitive regex and handle multiple name extraction strategies.
  const ledgerRegex = /<LEDGER\b[^>]*>([\s\S]*?)<\/LEDGER>/gi;

  let match: RegExpExecArray | null;
  while ((match = ledgerRegex.exec(xmlText)) !== null) {
    const fullBlock = match[0];
    const innerContent = match[1];

    // Extract name — try multiple sources in order of reliability
    const nameAttr = fullBlock.match(/<LEDGER[^>]*\bNAME\s*=\s*"([^"]+)"/i)?.[1];
    const nameTag = innerContent.match(/<NAME>([^<]+)<\/NAME>/i)?.[1];
    // Some Tally exports nest the name inside LANGUAGENAME.LIST
    const langName = innerContent.match(
      /<LANGUAGENAME\.LIST>[\s\S]*?<NAME\.LIST[^>]*>[\s\S]*?<NAME[^>]*>([^<]+)<\/NAME>/i,
    )?.[1];

    const name = (nameAttr || nameTag || langName || "").trim();
    if (!name) continue;

    const parent = (innerContent.match(/<PARENT>([^<]+)<\/PARENT>/i)?.[1] || "").trim();
    const gstin =
      innerContent.match(/<PARTYGSTIN>([^<]+)<\/PARTYGSTIN>/i)?.[1] ||
      innerContent.match(/<GSTIN>([^<]+)<\/GSTIN>/i)?.[1] ||
      null;
    const opening = parseFloat(
      innerContent.match(/<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>/i)?.[1] || "0",
    );

    const isParty = /Sundry Creditors|Sundry Debtors/i.test(parent);

    ledgers.push({
      name,
      parent,
      gstin,
      isPartyLedger: isParty,
      openingBalance: opening || 0,
      raw: { name, parent, gstin: gstin || "", opening: String(opening) },
    });
  }

  return ledgers;
}

export function classifyLedger(ledger: ParsedTallyLedger): string {
  const p = ledger.parent.toLowerCase();
  if (p.includes("sundry creditor")) return "party";
  if (p.includes("sundry debtor")) return "party";
  if (p.includes("purchase")) return "purchase";
  if (p.includes("sales")) return "sales";
  if (p.includes("duties") || p.includes("taxes") || /gst|cgst|sgst|igst/i.test(ledger.name)) return "tax";
  if (p.includes("bank") || p.includes("cash")) return "bank";
  if (p.includes("expense")) return "expense";
  return "other";
}
