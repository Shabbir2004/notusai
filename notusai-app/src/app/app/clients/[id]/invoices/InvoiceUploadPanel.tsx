"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Download, AlertTriangle } from "lucide-react";

interface UploadResult {
  filename: string;
  success: boolean;
  invoice_number?: string;
  vendor_name?: string;
  amount?: number;
  confidence?: string;
  error?: string;
}

interface TallyStatus {
  ledgersSynced: boolean;
  ledgersCount: number;
  pendingCount: number;
  tallyCompanyName: string | null;
}

export function InvoiceUploadPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tallyStatus, setTallyStatus] = useState<TallyStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [setupInstructions, setSetupInstructions] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchTallyStatus() {
    try {
      const res = await fetch(`/api/tally/pending-invoices?clientId=${clientId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTallyStatus({
        ledgersSynced: data.ledgersSynced,
        ledgersCount: data.ledgersCount || 0,
        pendingCount: data.pendingCount || 0,
        tallyCompanyName: data.tallyCompanyName,
      });
    } catch (e) {
      console.error("Tally status fetch failed:", e);
    }
  }

  useEffect(() => {
    fetchTallyStatus();
  }, [clientId]);

  async function autoApproveMappings() {
    const statusRes = await fetch(`/api/tally/pending-invoices?clientId=${clientId}`);
    if (!statusRes.ok) return;
    const status = await statusRes.json();
    const proposals = (status.mappingProposals || []) as Array<{
      vendorId: string;
      matchedLedgerId: string | null;
      confidence: "high" | "medium" | "low" | "new";
      strategy: string;
    }>;
    const autoMappings = proposals
      .filter((p) => p.matchedLedgerId && (p.confidence === "high" || p.confidence === "medium"))
      .map((p) => ({
        vendorId: p.vendorId,
        tallyLedgerId: p.matchedLedgerId!,
        matchStrategy: p.strategy,
        matchConfidence: p.confidence as "high" | "medium",
      }));
    if (autoMappings.length > 0) {
      await fetch("/api/tally/approve-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, mappings: autoMappings }),
      });
    }
  }

  async function handleDirectImport() {
    setExporting(true);
    setExportError(null);
    setImportSuccess(null);
    setSetupInstructions(null);

    try {
      await autoApproveMappings();

      const res = await fetch("/api/tally/direct-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setExportError(data.error || "Import failed");
        if (data.setupInstructions) setSetupInstructions(data.setupInstructions);
        setExporting(false);
        return;
      }

      setImportSuccess(data.message || `Imported into Tally`);
      await fetchTallyStatus();
      router.refresh();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadXml() {
    setExporting(true);
    setExportError(null);
    setImportSuccess(null);
    setSetupInstructions(null);

    try {
      await autoApproveMappings();

      const res = await fetch("/api/tally/export-vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error || "Export failed");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") || "";
      const filename = cd.match(/filename="([^"]+)"/)?.[1] || `notusai_tally_${clientName.replace(/\s+/g, "_")}.xml`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await fetchTallyStatus();
      router.refresh();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function handleFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList).filter((f) => /pdf|image/i.test(f.type));
    setFiles((prev) => [...prev, ...arr].slice(0, 30));
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setResults([]);

    const fd = new FormData();
    fd.append("clientId", clientId);
    for (const file of files) fd.append("file", file);

    try {
      const res = await fetch("/api/invoices/upload", { method: "POST", body: fd });
      const data = await res.json();
      setResults(data.results || []);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      // Refresh Tally status (pending count may have increased)
      await fetchTallyStatus();
      // Refresh server data after a short delay
      setTimeout(() => router.refresh(), 500);
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
      <div className="mb-3 flex items-center gap-2">
        <Upload className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-ink-900">Upload invoice PDFs</h2>
      </div>
      <p className="mb-4 text-sm text-ink-700">
        Drop client invoices here. AI reads each one, extracts vendor/amount/GST,
        and creates booking entries. Max 30 files per batch.
      </p>

      {/* One-click direct Tally import */}
      {tallyStatus && tallyStatus.ledgersSynced && tallyStatus.pendingCount > 0 && (
        <div className="mb-4 rounded-lg border-2 border-green-300 bg-green-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-bold text-green-900">
                🚀 {tallyStatus.pendingCount} invoice{tallyStatus.pendingCount === 1 ? "" : "s"} ready · push directly into Tally
              </div>
              <div className="mt-1 text-xs text-green-800">
                One click — NotusAI sends vouchers straight into Tally Prime. No download, no manual import.
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleDirectImport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing to Tally...
                  </>
                ) : (
                  <>🚀 Import to Tally</>
                )}
              </button>
              <button
                onClick={handleDownloadXml}
                disabled={exporting}
                className="text-xs text-green-800 hover:underline disabled:opacity-50"
              >
                or download XML manually
              </button>
            </div>
          </div>

          {importSuccess && (
            <div className="mt-3 flex items-start gap-2 rounded border border-green-300 bg-white p-3 text-sm font-medium text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{importSuccess}. Check Day Book in Tally to verify.</span>
            </div>
          )}

          {exportError && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{exportError}</span>
              </div>
              {setupInstructions && (
                <div className="mt-2 ml-5 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <div className="font-semibold">One-time setup to enable direct Tally import:</div>
                  <ol className="mt-1 ml-3 list-decimal space-y-0.5">
                    {setupInstructions.map((s, i) => (
                      <li key={i}>{s.replace(/^\d+\.\s*/, "")}</li>
                    ))}
                  </ol>
                  <div className="mt-2 text-xs">
                    Or use the &ldquo;download XML manually&rdquo; fallback above for now.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* If ledgers not synced yet, prompt the CA */}
      {tallyStatus && !tallyStatus.ledgersSynced && (
        <div className="mb-4 rounded-lg border border-ink-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-sm">
              <strong className="text-ink-900">Tally Bridge not set up yet.</strong>
              <div className="mt-1 text-ink-600">
                Sync your Tally ledgers once to enable one-click voucher export after uploads.
              </div>
            </div>
            <Link
              href={`/app/clients/${clientId}/tally-bridge`}
              className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ink-50 hover:opacity-85"
            >
              Set up Tally Bridge →
            </Link>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
          dragOver
            ? "border-blue-500 bg-blue-100"
            : "border-blue-300 bg-white hover:border-blue-400"
        }`}
      >
        <Upload className="mx-auto h-8 w-8 text-blue-500" />
        <p className="mt-3 font-medium text-ink-900">
          Drag invoice PDFs here, or click to select
        </p>
        <p className="text-xs text-ink-500">PDF, JPG, PNG · Max 30 files · Up to 10MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-ink-700">
            {files.length} file{files.length === 1 ? "" : "s"} ready to upload
          </div>
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 text-ink-500" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-ink-500">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                onClick={() => removeFile(i)}
                className="text-ink-500 hover:text-red-600"
                disabled={uploading}
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading {files.length} invoice{files.length === 1 ? "" : "s"} with AI...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Process {files.length} invoice{files.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 rounded-lg border border-ink-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">
              {successCount > 0 && (
                <span className="text-green-700">✓ {successCount} ingested</span>
              )}
              {successCount > 0 && failCount > 0 && <span className="text-ink-500"> · </span>}
              {failCount > 0 && <span className="text-red-700">✗ {failCount} failed</span>}
            </div>
            <button
              onClick={() => setResults([])}
              className="text-xs text-ink-500 hover:text-ink-900"
            >
              Clear
            </button>
          </div>

          <div className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded p-2 ${
                  r.success ? "bg-green-50" : "bg-red-50"
                }`}
              >
                {r.success ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs text-ink-700">{r.filename}</div>
                  {r.success ? (
                    <div className="text-xs text-ink-600">
                      {r.invoice_number} · {r.vendor_name} ·{" "}
                      ₹{(r.amount || 0).toLocaleString("en-IN")}
                      {r.confidence === "low" && (
                        <span className="ml-1 text-amber-700"> (low confidence — review)</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-red-700">{r.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-ink-500">
            Refresh page or scroll down to see new invoices in the list.
          </p>
        </div>
      )}

      {/* Other paths */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-3 text-xs text-ink-600">
        <strong className="text-ink-900">Other ways invoices flow in for {clientName}:</strong>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>
            <strong>Email:</strong> Tell client to forward invoices to your connected Gmail. AI
            auto-detects + ingests every 5 min.
          </li>
          <li>
            <strong>Reconciliation CSV:</strong> Upload Tally Purchase Register at{" "}
            <code className="rounded bg-ink-100 px-1">/app/reconciliation/new</code> (now also
            creates invoice rows).
          </li>
          <li>
            <strong>Client portal:</strong> Send client a portal link (per-client, signed URL).
          </li>
        </ul>
      </div>
    </section>
  );
}
