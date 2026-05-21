/**
 * Bulk invoice upload — CA drops N PDF/image files,
 * each gets OCR'd and an invoice row is created.
 *
 * Used by the /app/clients/[id]/invoices page.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFromPdf } from "@/lib/ocr/gemini-vision";

export const maxDuration = 120; // Up to 2 min for batches of ~30 invoices

interface UploadResult {
  filename: string;
  success: boolean;
  invoice_number?: string;
  vendor_name?: string;
  amount?: number;
  confidence?: string;
  invoice_id?: string;
  error?: string;
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
  const clientId = String(formData.get("clientId") || "");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Verify client belongs to firm
  const { data: client } = await supabase
    .from("clients")
    .select("id, firm_id")
    .eq("id", clientId)
    .single();
  if (!client || client.firm_id !== profile.firm_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Collect all files (form keys "file" repeated)
  const files: File[] = [];
  for (const [, value] of formData.entries()) {
    if (value instanceof File && /pdf|image/i.test(value.type)) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No PDF/image files uploaded" }, { status: 400 });
  }

  if (files.length > 30) {
    return NextResponse.json(
      { error: "Max 30 files per batch. Upload in smaller groups." },
      { status: 400 },
    );
  }

  const results: UploadResult[] = [];
  let created = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      const extracted = await extractInvoiceFromPdf({
        pdfBase64: base64,
        mimeType: file.type,
      });

      if (!extracted.invoice_number || !extracted.vendor_name) {
        results.push({
          filename: file.name,
          success: false,
          error: "Could not extract invoice number or vendor name",
        });
        failed++;
        continue;
      }

      // Find or create vendor
      let vendorId: string | undefined;
      if (extracted.vendor_gstin) {
        const { data: existing } = await supabase
          .from("vendors")
          .select("id")
          .eq("firm_id", profile.firm_id)
          .eq("gstin", extracted.vendor_gstin)
          .maybeSingle();
        vendorId = existing?.id;
      }

      if (!vendorId) {
        const { data: newVendor } = await supabase
          .from("vendors")
          .insert({
            firm_id: profile.firm_id,
            name: extracted.vendor_name,
            gstin: extracted.vendor_gstin,
            risk_score: 5.0,
          })
          .select("id")
          .single();
        vendorId = newVendor?.id;
      }

      // Insert invoice
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          firm_id: profile.firm_id,
          client_id: clientId,
          invoice_number: extracted.invoice_number,
          invoice_date: extracted.invoice_date || null,
          vendor_id: vendorId,
          vendor_gstin: extracted.vendor_gstin,
          vendor_name: extracted.vendor_name,
          amount: extracted.taxable_value || 0,
          cgst: extracted.cgst || 0,
          sgst: extracted.sgst || 0,
          igst: extracted.igst || 0,
          total_tax: extracted.total_tax || 0,
          hsn_code: extracted.hsn_code,
          source: "books",
          raw_data: extracted as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();

      if (error) {
        results.push({ filename: file.name, success: false, error: error.message });
        failed++;
      } else {
        results.push({
          filename: file.name,
          success: true,
          invoice_number: extracted.invoice_number,
          vendor_name: extracted.vendor_name,
          amount: (extracted.taxable_value || 0) + (extracted.total_tax || 0),
          confidence: extracted.confidence,
          invoice_id: invoice?.id,
        });
        created++;
      }
    } catch (e) {
      results.push({
        filename: file.name,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }

  return NextResponse.json({
    total: files.length,
    created,
    failed,
    results,
  });
}
