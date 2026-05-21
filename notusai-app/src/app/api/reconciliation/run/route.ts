import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTallyPurchaseCsv } from "@/lib/integrations/tally";
import { fetchGstr2B } from "@/lib/integrations/gstn";
import { reconcile, type BooksInvoice } from "@/lib/reconciliation/matcher";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();
  if (!profile?.firm_id) return NextResponse.json({ error: "No firm" }, { status: 400 });

  const formData = await req.formData();
  const gstin = String(formData.get("gstin") || "");
  const period = String(formData.get("period") || "");
  const booksFile = formData.get("booksCsv") as File | null;
  const twoBFile = formData.get("twoBJson") as File | null;

  if (!gstin || !period || !booksFile) {
    return NextResponse.json({ error: "GSTIN, period, and books CSV required" }, { status: 400 });
  }

  // Look up gstin row to get gstin_id (or create if missing)
  let { data: gstinRow } = await supabase
    .from("gstins")
    .select("id")
    .eq("gstin", gstin)
    .eq("firm_id", profile.firm_id)
    .single();

  if (!gstinRow) {
    // Create a placeholder client + gstin
    const { data: client } = await supabase
      .from("clients")
      .insert({ firm_id: profile.firm_id, name: `Client ${gstin.slice(0, 6)}` })
      .select()
      .single();
    const { data: created } = await supabase
      .from("gstins")
      .insert({
        firm_id: profile.firm_id,
        client_id: client!.id,
        gstin,
        state: gstin.slice(0, 2) + " (auto-detected)",
      })
      .select("id")
      .single();
    gstinRow = created;
  }

  if (!gstinRow) return NextResponse.json({ error: "Failed to create/find GSTIN row" }, { status: 500 });

  // Get client_id for this GSTIN (needed to persist invoices)
  const { data: gstinRowFull } = await supabase
    .from("gstins")
    .select("id, client_id")
    .eq("id", gstinRow.id)
    .single();
  const clientId = gstinRowFull?.client_id;

  // Parse books CSV
  const booksText = await booksFile.text();
  const parsedBooks = parseTallyPurchaseCsv(booksText);
  const books: BooksInvoice[] = parsedBooks.map((p) => ({
    invoice_number: p.invoice_number,
    invoice_date: p.invoice_date || "",
    vendor_gstin: p.vendor_gstin,
    vendor_name: p.vendor_name,
    amount: p.amount,
    cgst: p.cgst,
    sgst: p.sgst,
    igst: p.igst,
    hsn_code: p.hsn_code,
  }));

  // Persist invoices to the invoices table (skip duplicates by invoice_number + client_id)
  // This is what makes Tally Bridge see these invoices.
  if (clientId && books.length > 0) {
    const { data: existingInvoiceNums } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("client_id", clientId)
      .in(
        "invoice_number",
        books.map((b) => b.invoice_number),
      );
    const existing = new Set((existingInvoiceNums || []).map((r) => r.invoice_number));

    const newInvoices = books.filter((b) => !existing.has(b.invoice_number));

    if (newInvoices.length > 0) {
      // Find or create vendor for each unique vendor
      const uniqueVendors = Array.from(
        new Map(newInvoices.map((b) => [b.vendor_gstin || b.vendor_name, b])).values(),
      );

      const vendorIdMap = new Map<string, string>();
      for (const v of uniqueVendors) {
        const key = v.vendor_gstin || v.vendor_name;
        let vendorId: string | undefined;

        if (v.vendor_gstin) {
          const { data: existingVendor } = await supabase
            .from("vendors")
            .select("id")
            .eq("firm_id", profile.firm_id)
            .eq("gstin", v.vendor_gstin)
            .maybeSingle();
          vendorId = existingVendor?.id;
        }

        if (!vendorId) {
          const { data: newVendor } = await supabase
            .from("vendors")
            .insert({
              firm_id: profile.firm_id,
              name: v.vendor_name,
              gstin: v.vendor_gstin,
              risk_score: 5.0,
            })
            .select("id")
            .single();
          vendorId = newVendor?.id;
        }

        if (vendorId) vendorIdMap.set(key, vendorId);
      }

      const invoiceRows = newInvoices.map((b) => ({
        firm_id: profile.firm_id,
        client_id: clientId,
        gstin_id: gstinRow.id,
        invoice_number: b.invoice_number,
        invoice_date: b.invoice_date || null,
        vendor_id: vendorIdMap.get(b.vendor_gstin || b.vendor_name),
        vendor_gstin: b.vendor_gstin,
        vendor_name: b.vendor_name,
        amount: b.amount,
        cgst: b.cgst,
        sgst: b.sgst,
        igst: b.igst,
        total_tax: (b.cgst || 0) + (b.sgst || 0) + (b.igst || 0),
        hsn_code: b.hsn_code,
        source: "books",
      }));

      await supabase.from("invoices").insert(invoiceRows);
    }
  }

  // Get 2B (either uploaded JSON or via GSP mock)
  let twoBInvoices;
  if (twoBFile) {
    const json = JSON.parse(await twoBFile.text());
    twoBInvoices = json.invoices || json.data?.invoices || json;
  } else {
    const twoB = await fetchGstr2B({ gstin, period });
    twoBInvoices = twoB.invoices;
  }

  // Run reconciliation
  const result = reconcile(books, twoBInvoices);

  // Create reconciliation row
  const { data: recon } = await supabase
    .from("reconciliations")
    .insert({
      firm_id: profile.firm_id,
      gstin_id: gstinRow.id,
      period,
      total_books_invoices: result.totalBooks,
      total_2b_invoices: result.total2B,
      matched_count: result.matched.length,
      matched_value: result.totalMatchedValue,
      mismatch_value: result.totalMismatchValue,
      itc_at_risk: result.itcAtRisk,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Persist mismatches
  if (recon && result.mismatches.length > 0) {
    const mismatchRows = result.mismatches.map((m) => ({
      firm_id: profile.firm_id,
      reconciliation_id: recon.id,
      type: m.type,
      severity: m.severity,
      vendor_name: m.vendor_name,
      invoice_number: m.invoice_number,
      amount: m.amount,
      ai_suggestion: m.ai_suggestion,
    }));
    await supabase.from("mismatches").insert(mismatchRows);
  }

  return NextResponse.json({
    reconciliationId: recon?.id,
    matched: result.matched.length,
    mismatches: result.mismatches.length,
    itcAtRisk: result.itcAtRisk,
  });
}
