/**
 * Ledger sync — accepts an XML export of all ledgers from CA's Tally
 * for a specific client, parses, and stores them.
 *
 * CA gets the XML from Tally via:
 *   Gateway of Tally → Display More Reports → List of Accounts → Ledgers
 *   → Click "Alt+E" (Export) → File Type: XML → Save
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseTallyLedgerExport,
  classifyLedger,
} from "@/lib/integrations/tally-xml";

export const maxDuration = 60;

/**
 * Decode Tally XML file bytes with encoding auto-detection.
 * Tally Prime usually exports UTF-8; older ERP 9 exports UTF-16 LE with BOM.
 * If the first sniff yields 0 LEDGER tags, retry with another encoding.
 */
function decodeXmlBytes(buf: ArrayBuffer, bytes: Uint8Array): string {
  // BOM checks
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // UTF-16 LE BOM
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // UTF-16 BE BOM
    return new TextDecoder("utf-16be").decode(buf);
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    // UTF-8 BOM — strip and decode
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }

  // No BOM — try UTF-8 first
  let decoded = new TextDecoder("utf-8").decode(buf);

  // Heuristic: if every other byte is 0, it's likely UTF-16 LE without BOM
  let nullByteEven = 0;
  let nullByteOdd = 0;
  for (let i = 0; i < Math.min(bytes.length, 200); i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) nullByteEven++;
      else nullByteOdd++;
    }
  }
  if (nullByteOdd > 50 && nullByteEven < 5) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (nullByteEven > 50 && nullByteOdd < 5) {
    return new TextDecoder("utf-16be").decode(buf);
  }

  // Final sanity check: if UTF-8 decode looks broken (no real tags), try UTF-16 LE
  if (!/<LEDGER|<GROUP|<TALLYMESSAGE|<ENVELOPE/i.test(decoded)) {
    const utf16 = new TextDecoder("utf-16le").decode(buf);
    if (/<LEDGER|<GROUP|<TALLYMESSAGE|<ENVELOPE/i.test(utf16)) {
      return utf16;
    }
  }

  return decoded;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", user.id)
    .single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = String(formData.get("clientId") || "");
  const companyName = String(formData.get("companyName") || "");

  if (!file || !clientId) {
    return NextResponse.json(
      { error: "file and clientId required" },
      { status: 400 },
    );
  }

  // Verify client belongs to this firm
  const { data: client } = await supabase
    .from("clients")
    .select("id, firm_id")
    .eq("id", clientId)
    .single();
  if (!client || client.firm_id !== profile.firm_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Tally Prime / ERP 9 may export XML in UTF-8, UTF-16 LE/BE, or with BOM.
  // Detect encoding from the raw bytes so we don't decode garbage.
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const xmlText = decodeXmlBytes(arrayBuffer, bytes);

  const ledgers = parseTallyLedgerExport(xmlText);

  if (ledgers.length === 0) {
    const ledgerTagCount = (xmlText.match(/<LEDGER/gi) || []).length;
    const groupTagCount = (xmlText.match(/<GROUP/gi) || []).length;
    const messageTagCount = (xmlText.match(/<TALLYMESSAGE/gi) || []).length;
    const firstBytesHex = Array.from(bytes.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const sampleSnippet = xmlText.slice(0, 800).replace(/\s+/g, " ");

    console.log("[sync-ledgers] No ledgers parsed. Diagnostics:", {
      fileSizeBytes: bytes.length,
      decodedLength: xmlText.length,
      firstBytesHex,
      ledgerTagCount,
      groupTagCount,
      messageTagCount,
      sampleSnippet: sampleSnippet.slice(0, 500),
    });

    return NextResponse.json(
      {
        error: `No ledgers parsed. The file has ${ledgerTagCount} <LEDGER> tags, ${groupTagCount} <GROUP> tags. ` +
          (ledgerTagCount === 0
            ? "Likely cause: file encoding issue (e.g., UTF-16) OR no ledgers in the file. Check server logs for first-bytes hex."
            : "We found LEDGER tags but couldn't extract names. Please share the file with support."),
        diagnostics: {
          fileSizeBytes: bytes.length,
          decodedLength: xmlText.length,
          firstBytesHex,
          ledgerTagCount,
          groupTagCount,
          messageTagCount,
          sampleStart: sampleSnippet.slice(0, 400),
        },
      },
      { status: 400 },
    );
  }

  // Clear existing ledgers for this client (fresh sync)
  await supabase
    .from("tally_ledgers")
    .delete()
    .eq("client_id", clientId);

  // Insert new ledgers
  const rows = ledgers.map((l) => ({
    firm_id: profile.firm_id,
    client_id: clientId,
    name: l.name,
    parent_group: l.parent,
    gstin: l.gstin,
    is_party_ledger: l.isPartyLedger,
    ledger_type: classifyLedger(l),
    opening_balance: l.openingBalance,
    raw_data: l.raw as unknown as Record<string, unknown>,
  }));

  const { error: insertErr } = await supabase
    .from("tally_ledgers")
    .insert(rows);

  if (insertErr) {
    return NextResponse.json(
      { error: "Failed to store ledgers: " + insertErr.message },
      { status: 500 },
    );
  }

  // Update client_tally_config
  await supabase
    .from("client_tally_config")
    .upsert(
      {
        client_id: clientId,
        firm_id: profile.firm_id,
        tally_company_name: companyName || undefined,
        ledgers_last_synced_at: new Date().toISOString(),
        ledgers_count: ledgers.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );

  // Stats
  const byType = ledgers.reduce<Record<string, number>>((acc, l) => {
    const t = classifyLedger(l);
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    ledgers_imported: ledgers.length,
    by_type: byType,
  });
}
