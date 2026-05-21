"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
  FileText,
  ShieldAlert,
  Truck,
  ChevronRight,
  HelpCircle,
  UserPlus,
} from "lucide-react";

interface PendingInvoiceBatch {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  totalValue: number;
  uniqueVendorCount: number;
  unmappedVendorCount: number;
  ledgersSynced: boolean;
  autoImportEnabled: boolean;
  tallyCompanyName: string | null;
  oldestInvoiceDate: string | null;
  readyToImport: boolean;
}

interface PendingNotice {
  id: string;
  clientId: string;
  clientName: string;
  noticeType: string;
  deadline: string | null;
  demandAmount: number | null;
  draftedAt: string | null;
}

interface PendingAnomaly {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  severity: string;
  message: string;
  noticeProbability: number | null;
}

interface UnassignedInvoiceGroup {
  buyerGstin: string | null;
  buyerName: string | null;
  invoiceCount: number;
  totalValue: number;
  vendorNames: string[];
  oldestInvoiceDate: string | null;
  sourceEmails: string[];
  invoiceIds: string[];
}

interface ClientOption {
  id: string;
  name: string;
}

interface PendingData {
  pendingInvoiceBatches: PendingInvoiceBatch[];
  unassignedInvoiceGroups: UnassignedInvoiceGroup[];
  unassignedInvoiceCount: number;
  draftNotices: PendingNotice[];
  openHighAnomalies: PendingAnomaly[];
  autoResolvedVendorCount: number;
  totalPendingItems: number;
  totals: {
    invoicesPending: number;
    invoiceValueTotal: number;
    clientsWithPending: number;
  };
}

interface ImportResult {
  clientId: string;
  clientName: string;
  status: string;
  vouchersImported: number;
  invoiceCount: number;
  totalValue: number;
  message: string;
  requiresSetup?: boolean;
  tallyErrors?: string[];
}

export function PendingDashboard() {
  const [data, setData] = useState<PendingData | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importingClientId, setImportingClientId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [bannerResults, setBannerResults] = useState<ImportResult[] | null>(null);
  const [tallySetupNeeded, setTallySetupNeeded] = useState(false);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, clientsRes] = await Promise.all([
        fetch("/api/pending"),
        fetch("/api/clients/list"),
      ]);
      if (!pendingRes.ok) throw new Error(await pendingRes.text());
      const json = (await pendingRes.json()) as PendingData;
      setData(json);
      if (clientsRes.ok) {
        const cj = await clientsRes.json();
        setClients(cj.clients || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function assignToExistingClient(
    group: UnassignedInvoiceGroup,
    clientId: string,
  ) {
    const key = group.buyerGstin || group.invoiceIds.join(",");
    setAssigningKey(key);
    setError(null);
    setAssignSuccess(null);
    try {
      const body: Record<string, unknown> = { clientId };
      if (group.buyerGstin) body.buyerGstin = group.buyerGstin;
      else body.invoiceIds = group.invoiceIds;

      const res = await fetch("/api/invoices/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Assignment failed");
      setAssignSuccess(
        `Assigned ${json.assignedCount} invoice${json.assignedCount === 1 ? "" : "s"} to ${json.clientName}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setAssigningKey(null);
    }
  }

  async function createClientAndAssign(group: UnassignedInvoiceGroup) {
    if (!group.buyerGstin) {
      setError("Cannot auto-create client without buyer GSTIN");
      return;
    }
    const key = group.buyerGstin;
    setAssigningKey(key);
    setError(null);
    setAssignSuccess(null);
    try {
      const res = await fetch("/api/invoices/create-client-and-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerGstin: group.buyerGstin,
          buyerName: group.buyerName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setAssignSuccess(
        `${json.created ? "Created" : "Found existing"} client "${json.clientName}" — assigned ${json.assignedCount} invoice${json.assignedCount === 1 ? "" : "s"}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAssigningKey(null);
    }
  }

  async function importClient(clientId: string) {
    setImportingClientId(clientId);
    setError(null);
    setTallySetupNeeded(false);
    try {
      const res = await fetch("/api/tally/direct-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.requiresSetup) setTallySetupNeeded(true);
        throw new Error(json.error || "Import failed");
      }
      setBannerResults([
        {
          clientId,
          clientName: data?.pendingInvoiceBatches.find((b) => b.clientId === clientId)?.clientName || "",
          status: "imported",
          vouchersImported: json.vouchersImported,
          invoiceCount: json.invoiceCount,
          totalValue: json.totalValue,
          message: json.message,
        },
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingClientId(null);
    }
  }

  async function importAll() {
    if (!data?.pendingInvoiceBatches.length) return;
    setImportingAll(true);
    setError(null);
    setTallySetupNeeded(false);
    try {
      const importable = data.pendingInvoiceBatches.filter((b) => b.readyToImport);
      if (importable.length === 0) {
        setError("No client batches are ready to import. Sync ledgers + map vendors first.");
        return;
      }
      const res = await fetch("/api/tally/import-all-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: importable.map((b) => b.clientId) }),
      });
      const json = await res.json();
      if (json.requiresSetup) {
        setTallySetupNeeded(true);
        setError(json.error || "Tally is offline");
        return;
      }
      setBannerResults(json.results || []);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk import failed");
    } finally {
      setImportingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading agent activity...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        Failed to load. {error}
      </div>
    );
  }

  const importableCount = data.pendingInvoiceBatches.filter((b) => b.readyToImport).length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {tallySetupNeeded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Tally HTTP server is unreachable.</strong>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            <li>Open Tally Prime on your computer</li>
            <li>Press F1 → Settings → Connectivity</li>
            <li>Set "Configure Tally as Server" to Yes</li>
            <li>Port: 9000 (default)</li>
            <li>Make sure the client company is OPEN in Tally</li>
          </ol>
        </div>
      )}

      {bannerResults && bannerResults.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-green-900">
            <CheckCircle2 className="h-5 w-5" /> Import complete
          </div>
          <ul className="space-y-1 text-sm text-green-900">
            {bannerResults.map((r) => (
              <li key={r.clientId} className="flex items-center gap-2">
                {r.status === "imported" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-700" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                )}
                <span>
                  <strong>{r.clientName}</strong> — {r.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {assignSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          {assignSuccess}
        </div>
      )}

      {/* Rollup */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Items awaiting approval"
          value={String(data.totalPendingItems)}
          accent
        />
        <Stat
          label="Pending invoices"
          value={String(data.totals.invoicesPending)}
        />
        <Stat
          label="Total value"
          value={inr(data.totals.invoiceValueTotal)}
        />
        <Stat
          label="Auto-resolved by agents · 24h"
          value={String(data.autoResolvedVendorCount)}
          subtle
        />
      </section>

      {/* Unassigned invoices — needs CA to map to a client */}
      {data.unassignedInvoiceGroups.length > 0 && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6">
          <div className="mb-4 flex items-start gap-3">
            <HelpCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-700" />
            <div>
              <h2 className="text-lg font-bold text-amber-900">
                {data.unassignedInvoiceCount} invoice
                {data.unassignedInvoiceCount === 1 ? "" : "s"} need client assignment
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                The AI extracted these invoices but couldn't auto-match them to any client in your list.
                Assign each to an existing client, or create a new client from the buyer GSTIN.
              </p>
            </div>
          </div>

          <ul className="space-y-3">
            {data.unassignedInvoiceGroups.map((g) => {
              const key = g.buyerGstin || g.invoiceIds.join(",");
              const busy = assigningKey === key;
              return (
                <li
                  key={key}
                  className="rounded-lg border border-amber-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink-900">
                          {g.buyerName || "Unknown buyer"}
                        </span>
                        {g.buyerGstin ? (
                          <span className="rounded bg-ink-100 px-2 py-0.5 font-mono text-xs text-ink-700">
                            {g.buyerGstin}
                          </span>
                        ) : (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
                            No GSTIN extracted
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-ink-700">
                        <strong>{g.invoiceCount}</strong> invoice
                        {g.invoiceCount === 1 ? "" : "s"} · {inr(g.totalValue)}
                        {g.oldestInvoiceDate && (
                          <span className="text-ink-500"> · since {g.oldestInvoiceDate}</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        Vendors: {g.vendorNames.join(", ")}
                        {g.sourceEmails.length > 0 && (
                          <span> · From: {g.sourceEmails.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        disabled={busy || clients.length === 0}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            assignToExistingClient(g, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium text-ink-800 disabled:opacity-50"
                      >
                        <option value="">
                          {clients.length === 0
                            ? "No clients yet"
                            : "Assign to existing client..."}
                        </option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      {g.buyerGstin && (
                        <button
                          onClick={() => createClientAndAssign(g)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                          Create &amp; assign all
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Invoices → Tally */}
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Zap className="h-5 w-5 text-blue-700" />
              Invoices ready for Tally
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Auto-detected by email agents. Approve to push directly into Tally.
            </p>
          </div>
          {importableCount > 0 && (
            <button
              onClick={importAll}
              disabled={importingAll}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {importingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing {importableCount} client
                  {importableCount === 1 ? "" : "s"}...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Import all to Tally ({importableCount})
                </>
              )}
            </button>
          )}
        </div>

        {data.pendingInvoiceBatches.length === 0 ? (
          <Empty msg="No pending invoices. Email agents are watching for new ones." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.pendingInvoiceBatches.map((b) => (
              <li key={b.clientId} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/clients/${b.clientId}`}
                        className="font-semibold text-ink-900 hover:underline"
                      >
                        {b.clientName}
                      </Link>
                      {b.autoImportEnabled && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-900">
                          ⚡ Auto-import on
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-ink-600">
                      <strong>{b.invoiceCount}</strong> invoice
                      {b.invoiceCount === 1 ? "" : "s"} · {inr(b.totalValue)} · {b.uniqueVendorCount}{" "}
                      vendor{b.uniqueVendorCount === 1 ? "" : "s"}
                      {b.oldestInvoiceDate && (
                        <span className="text-ink-500"> · since {b.oldestInvoiceDate}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <ReadinessBadge synced={b.ledgersSynced} label="Ledgers" />
                      <ReadinessBadge
                        synced={b.unmappedVendorCount === 0}
                        label={
                          b.unmappedVendorCount === 0
                            ? "Vendors mapped"
                            : `${b.unmappedVendorCount} vendor${b.unmappedVendorCount === 1 ? "" : "s"} unmapped`
                        }
                      />
                      {b.tallyCompanyName && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">
                          Tally co.: {b.tallyCompanyName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {b.readyToImport ? (
                      <button
                        onClick={() => importClient(b.clientId)}
                        disabled={importingClientId === b.clientId || importingAll}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {importingClientId === b.clientId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Importing...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" /> Import to Tally
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={`/app/clients/${b.clientId}/tally-bridge`}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                      >
                        Setup Tally Bridge <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                    <Link
                      href={`/app/clients/${b.clientId}/invoices`}
                      className="text-xs text-ink-500 hover:text-ink-900 hover:underline"
                    >
                      View invoices →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Draft notices */}
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <FileText className="h-5 w-5 text-amber-700" />
          Notice drafts ready
        </h2>
        {data.draftNotices.length === 0 ? (
          <Empty msg="No notice drafts awaiting review." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.draftNotices.map((n) => (
              <li key={n.id} className="py-3">
                <Link
                  href={`/app/notices/${n.id}`}
                  className="flex items-center justify-between gap-3 hover:bg-ink-50"
                >
                  <div>
                    <div className="font-medium">{n.clientName}</div>
                    <div className="text-xs text-ink-500">
                      {n.noticeType}
                      {n.deadline && ` · Deadline ${n.deadline}`}
                      {n.demandAmount !== null && ` · Demand ${inr(n.demandAmount)}`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Anomalies */}
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <ShieldAlert className="h-5 w-5 text-red-700" />
          High-risk anomalies
        </h2>
        {data.openHighAnomalies.length === 0 ? (
          <Empty msg="No high-risk anomalies open." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.openHighAnomalies.map((a) => (
              <li key={a.id} className="py-3">
                <Link
                  href={`/app/anomalies`}
                  className="flex items-center justify-between gap-3 hover:bg-ink-50"
                >
                  <div>
                    <div className="font-medium">{a.clientName}</div>
                    <div className="text-xs text-ink-500">
                      {a.type} · {a.severity}
                      {a.noticeProbability !== null &&
                        ` · ${Math.round(a.noticeProbability * 100)}% notice risk`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Autonomous wins */}
      {data.autoResolvedVendorCount > 0 && (
        <section className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-green-700" />
            <div>
              <div className="font-semibold text-green-900">
                {data.autoResolvedVendorCount} vendor mismatch
                {data.autoResolvedVendorCount === 1 ? "" : "es"} resolved autonomously · last 24h
              </div>
              <div className="text-xs text-green-800">
                Vendor reactor agents handled these without needing your attention.
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  subtle,
}: {
  label: string;
  value: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-blue-300 bg-blue-50"
          : subtle
            ? "border-ink-100 bg-ink-50"
            : "border-ink-200 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          accent ? "text-blue-900" : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ReadinessBadge({ synced, label }: { synced: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
        synced ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
      }`}
    >
      {synced ? "✓" : "!"} {label}
    </span>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="py-4 text-sm text-ink-500">{msg}</p>;
}

function inr(amount: number): string {
  return "₹" + (amount || 0).toLocaleString("en-IN");
}
