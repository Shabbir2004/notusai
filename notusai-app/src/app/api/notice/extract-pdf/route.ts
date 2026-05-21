import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractNoticeFromPdf } from "@/lib/ocr/gemini-vision";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractNoticeFromPdf({
      pdfBase64: base64,
      mimeType: file.type,
    });
    return NextResponse.json({ success: true, data: extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "OCR failed: " + msg }, { status: 500 });
  }
}
