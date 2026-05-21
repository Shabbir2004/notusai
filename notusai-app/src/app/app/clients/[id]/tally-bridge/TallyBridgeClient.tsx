"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, Upload, Download, RefreshCw, Zap, Sparkles } from "lucide-react";

interface MappingProposal {
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  matchedLedgerId: string | null;
  matchedLedgerName: string | null;
  confidence: "high" | "medium" | "low" | "new";
  strategy: string;
  alternatives?: Array<{ id: string; name: string; score: number }>;
}

interface PendingStatus {
  pendingCount: number;
  totalValue: number;
  uniqueVendorCount: number;
  ledgersSynced: boolean;
  ledgersCount: number;
  ledgersLastSyncedAt: string | null;
  tallyCompanyName: string | null;
  unmappedVendorCount: number;
  mappingProposals: MappingProposal[] | null;
  readyToExport: boolean;
}

interface TallyConfig {
  tally_company_name?: string | null;
  default_purchase_ledger?: string | null;
  default_cgst_ledger?: string | null;
  default_sgst_ledger?: string | null;
  default_igst_ledger?: string | null;
  ledgers_count?: number | null;
  ledgers_last_synced_at?: string | null;
  auto_export_enabled?: boolean | null;
}

export function TallyBridgeClient({
  clientId,
  clientName,
  initialConfig,
}: {
  clientId: string;
  clientName: string;
  initialConfig: TallyConfig | null;
}) {
  const [status, setStatus] = useState<PendingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(
    initialConfig?.tally_company_name || clientName,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoImport, setAutoImport] = useState(!!initialConfig?.auto_export_enabled);
  const [autoImportSaving, setAutoImportSaving] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const res = await fetch(`/api/tally/pending-invoices?clientId=${clientId}`);
    if (!res.ok) {
      setError("Failed to load status");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as PendingStatus;
    setStatus(data);
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
  }, [clientId]);

  async function handleLedgerSync(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("clientId", clientId);
    fd.append("companyName", companyName);

    const res = await fetch("/api/tally/sync-ledgers", { method: "POST", body: fd });
    setSyncing(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Ledger sync failed");
      return;
    }

    await loadStatus();
  }

  async function approveAllMatches() {
    if (!status?.mappingProposals) return;
    const mappings = status.mappingProposals
      .filter((p) => p.matchedLedgerId)
      .map((p) => ({
        vendorId: p.vendorId,
        tallyLedgerId: p.matchedLedgerId!,
        matchStrategy: p.strategy,
        matchConfidence: p.confidence === "new" ? ("manual" as const) : p.confidence,
      }));

    if (mappings.length === 0) {
      setError("No mappings to approve");
      return;
    }

    const res = await fetch("/api/tally/approve-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, mappings }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to approve mappings");
      return;
    }

    await loadStatus();
  }

  async function exportToTally() {
    setExporting(true);
    setError(null);

    const res = await fetch("/api/tally/export-vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });

    setExporting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Export failed");
      return;
    }

    // Download the XML
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const filename =
      res.headers.get("X-Filename") ||
      res.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1] ||
      `notusai_tally_${clientName.replace(/\s+/g, "_")}.xml`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await loadStatus();
  }

  async function directImport() {
    setImporting(true);
    setError(null);
    setImportSuccess(null);
    setSetupNeeded(false);

    const res = await fetch("/api/tally/direct-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });

    const data = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      if (data.requiresSetup) setSetupNeeded(true);
      setError(data.error || "Direct import failed");
      return;
    }

    setImportSuccess(data.message || "Imported");
    await loadStatus();
  }

  async function toggleAutoImport(next: boolean) {
    setAutoImport(next);
    setAutoImportSaving(true);
    const res = await fetch("/api/tally/auto-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, enabled: next }),
    });
    setAutoImportSaving(false);
    if (!res.ok) {
      setAutoImport(!next);
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update auto-import");
    }
  }

  if (loading) return <div className="text-ink-500">Loading...</div>;
  if (!status) return <div className="text-red-700">Failed to load.</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Status summary */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Pending invoices" value={String(status.pendingCount)} />
        <Stat label="Total value" value={inr(status.totalValue)} />
        <Stat label="Unique vendors" value={String(status.uniqueVendorCount)} />
        <Stat
          label="Ledgers synced"
          value={status.ledgersSynced ? `✓ ${status.ledgersCount}` : "Not yet"}
          good={status.ledgersSynced}
        />
      </section>

      {/* Step 1: Sync Ledgers */}
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-ink-900 px-3 py-1 text-sm font-bold text-ink-50">1</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Sync ledgers from CA's Tally</h2>
            <p className="mt-1 text-sm text-ink-600">
              Export the list of accounts from your Tally for this client and upload it here.
              Required once per client (re-sync if you add new ledgers in Tally).
            </p>

            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <strong>How to export from Tally:</strong>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Open {clientName} company in your Tally</li>
                <li>
                  Gateway of Tally → <strong>Display More Reports</strong> →{" "}
                  <strong>List of Accounts</strong>
                </li>
                <li>
                  Press <kbd className="rounded bg-white px-1 py-0.5 font-mono">Alt+E</kbd> or click
                  Export
                </li>
                <li>
                  Format: <strong>XML</strong>, save the file
                </li>
                <li>Upload the file here</li>
              </ol>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-700">
                  Tally company name (exact match)
                </label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={clientName}
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Parsing...
                    </>
                  ) : status.ledgersSynced ? (
                    <>
                      <RefreshCw className="h-4 w-4" /> Re-sync ledgers
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Upload Tally ledger XML
                    </>
                  )}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={handleLedgerSync}
                />
              </div>
            </div>

            {status.ledgersSynced && (
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {status.ledgersCount} ledgers synced
                {status.ledgersLastSyncedAt && (
                  <span className="text-ink-500">
                    · {new Date(status.ledgersLastSyncedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Step 2: Vendor → Ledger Mapping */}
      <section
        className={`rounded-xl border bg-white p-6 ${
          status.ledgersSynced ? "border-ink-200" : "border-ink-200 opacity-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-ink-900 px-3 py-1 text-sm font-bold text-ink-50">2</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Map vendors to Tally ledgers</h2>
            <p className="mt-1 text-sm text-ink-600">
              AI matches NotusAI vendors to existing ledgers in your Tally. Review & approve.
            </p>

            {!status.ledgersSynced ? (
              <p className="mt-3 text-sm text-ink-500">Sync ledgers first (Step 1).</p>
            ) : !status.mappingProposals || status.mappingProposals.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No vendors to map yet.</p>
            ) : (
              <>
                <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-ink-200">
                  <table className="w-full text-sm">
                    <thead className="border-b border-ink-200 bg-ink-50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Vendor (NotusAI)</th>
                        <th className="px-3 py-2 font-semibold">Matched ledger</th>
                        <th className="px-3 py-2 font-semibold">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.mappingProposals.map((p) => (
                        <tr key={p.vendorId} className="border-b border-ink-100 last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.vendorName}</div>
                            {p.vendorGstin && (
                              <div className="text-xs text-ink-500">{p.vendorGstin}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {p.matchedLedgerName ? (
                              <span className="text-ink-900">{p.matchedLedgerName}</span>
                            ) : (
                              <span className="text-ink-500 italic">
                                Will create new ledger: {p.vendorName}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <ConfidenceBadge confidence={p.confidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={approveAllMatches}
                  className="mt-4 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:opacity-85"
                >
                  Approve all mappings
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Step 3: Import to Tally */}
      <section
        className={`rounded-xl border bg-white p-6 ${
          status.readyToExport ? "border-blue-300 bg-blue-50" : "border-ink-200 opacity-60"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-ink-900 px-3 py-1 text-sm font-bold text-ink-50">3</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Import vouchers into Tally</h2>

            {status.pendingCount === 0 ? (
              <p className="mt-2 text-sm text-ink-500">
                No pending invoices. They'll appear here as email agents detect them.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink-700">
                  <strong>{status.pendingCount}</strong> invoice
                  {status.pendingCount === 1 ? "" : "s"} ready ·{" "}
                  <strong>{inr(status.totalValue)}</strong> total value
                </p>

                {!status.readyToExport && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <div>
                      {!status.ledgersSynced
                        ? "Complete Step 1 (sync ledgers) first."
                        : `${status.unmappedVendorCount} vendor mapping(s) pending. Complete Step 2.`}
                    </div>
                  </div>
                )}

                {importSuccess && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-900">
                    <CheckCircle2 className="h-4 w-4" /> {importSuccess}
                  </div>
                )}

                {setupNeeded && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>Tally HTTP server unreachable.</strong>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                      <li>Open Tally Prime on your computer</li>
                      <li>F1 → Settings → Connectivity</li>
                      <li>Set "Configure Tally as Server" = Yes (port 9000)</li>
                      <li>Open the {clientName} company in Tally</li>
                      <li>Click Import again</li>
                    </ol>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={directImport}
                    disabled={!status.readyToExport || importing}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Pushing to Tally...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" /> Import to Tally (one click)
                      </>
                    )}
                  </button>

                  <button
                    onClick={exportToTally}
                    disabled={!status.readyToExport || exporting}
                    className="inline-flex items-center gap-2 rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                  >
                    {exporting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" /> Or download XML manually
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-3 text-xs text-ink-500">
                  Direct import requires Tally Prime running on this machine with HTTP server
                  enabled and {clientName} company open.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Step 4: Auto-import (trust the agent) */}
      <section className="rounded-xl border border-purple-200 bg-purple-50 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-purple-600 px-3 py-1 text-sm font-bold text-white">4</div>
          <div className="flex-1">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-5 w-5 text-purple-700" />
              Auto-import (optional)
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              For high-trust clients with a stable vendor list — let NotusAI's agents push imports
              into Tally automatically the next time you open the app, without waiting for your
              manual click.
            </p>

            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoImport}
                onChange={(e) => toggleAutoImport(e.target.checked)}
                disabled={autoImportSaving}
                className="mt-0.5 h-5 w-5 rounded border-purple-400 text-purple-600 focus:ring-purple-500"
              />
              <div>
                <div className="font-semibold text-ink-900">
                  Auto-confirm imports for {clientName}
                </div>
                <div className="text-xs text-ink-600">
                  All Step-1 + Step-2 prerequisites still apply. We'll show a notification
                  summarizing what was imported.
                </div>
                {autoImportSaving && (
                  <div className="mt-1 text-xs text-purple-700">Saving...</div>
                )}
              </div>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${good ? "text-green-700" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" | "new" }) {
  const styles = {
    high: "bg-green-100 text-green-900",
    medium: "bg-blue-100 text-blue-900",
    low: "bg-amber-100 text-amber-900",
    new: "bg-purple-100 text-purple-900",
  };
  const labels = {
    high: "✓ High",
    medium: "Likely",
    low: "Check",
    new: "Will create",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  );
}

function inr(amount: number): string {
  return "₹" + (amount || 0).toLocaleString("en-IN");
}
