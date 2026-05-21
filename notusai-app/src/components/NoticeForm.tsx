"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Upload, FileText, Sparkles } from "lucide-react";

interface Client {
  id: string;
  name: string;
}

export function NoticeForm({ clients = [] }: { clients?: Client[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clientName: "",
    gstin: "",
    noticeType: "ASMT-10",
    period: "",
    deadline: "",
    demandAmount: "",
    noticeText: "",
    keyFacts: "",
    tone: "balanced",
    authority: "",
    noticeNumber: "",
  });

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/notice/extract-pdf", { method: "POST", body: fd });
    setExtracting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError("PDF extraction failed: " + (data.error || res.statusText));
      return;
    }

    const { data } = await res.json();
    setFormData((prev) => ({
      ...prev,
      clientName: data.client_name || prev.clientName,
      gstin: data.gstin || prev.gstin,
      noticeType: data.notice_type || prev.noticeType,
      period: data.period || prev.period,
      deadline: data.deadline || prev.deadline,
      demandAmount: data.demand_amount ? String(data.demand_amount) : prev.demandAmount,
      noticeText: data.full_text || prev.noticeText,
      authority: data.authority || prev.authority,
      noticeNumber: data.notice_number || prev.noticeNumber,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/notice/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong. Try again.");
      setSubmitting(false);
      return;
    }

    const { noticeId } = await res.json();
    router.push(`/app/notices/${noticeId}`);
  }

  function update(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* PDF auto-fill */}
      <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-5">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-blue-700" />
          <div className="flex-1">
            <div className="font-semibold text-blue-900">Upload notice PDF — auto-fill all fields</div>
            <div className="text-xs text-blue-700">AI reads your notice and fills the form. Faster than typing.</div>
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={extracting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {extracting ? "Reading PDF..." : "Upload PDF"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handlePdfUpload}
          />
        </div>
      </div>

      {clients.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-ink-700">Client (or leave blank to enter manually)</label>
          <select
            name="clientId"
            className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 focus:border-ink-900 focus:outline-none"
          >
            <option value="">— Enter manually below —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <Field label="Client business name" required={clients.length === 0} value={formData.clientName} onChange={(v) => update("clientName", v)} placeholder="Sharma Textile Industries" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Client GSTIN" value={formData.gstin} onChange={(v) => update("gstin", v)} placeholder="27AABCS1234M1Z5" />
        <Select label="Notice type" value={formData.noticeType} onChange={(v) => update("noticeType", v)} options={[
          "ASMT-10", "DRC-01", "DRC-01A", "Section 73 SCN", "Section 74 SCN", "Audit Memo", "Other",
        ]} />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Period in question" value={formData.period} onChange={(v) => update("period", v)} placeholder="April 2025 to June 2025" />
        <Field label="Reply deadline" type="date" value={formData.deadline} onChange={(v) => update("deadline", v)} />
      </div>
      <Field label="Demand amount (₹)" value={formData.demandAmount} onChange={(v) => update("demandAmount", v)} placeholder="3,42,000" />
      <Textarea label="Notice text" rows={8} required value={formData.noticeText} onChange={(v) => update("noticeText", v)} placeholder="Paste the full text from the notice PDF here... (or upload PDF above to auto-fill)" />
      <Textarea label="Key facts from client (relevant to defense)" rows={4} value={formData.keyFacts} onChange={(v) => update("keyFacts", v)} placeholder='e.g., "Vendor X filed GSTR-1 late on 18.07.2025; payment via NEFT within 60 days; ₹52K is genuine error willing to reverse."' />
      <Select label="Defense tone" value={formData.tone} onChange={(v) => update("tone", v)} options={["aggressive", "balanced", "conservative"]} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-ink-900 px-5 py-3 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
      >
        {submitting ? "Generating draft (30-60 sec)..." : "Generate draft"}
      </button>
      <p className="text-center text-xs text-ink-500">
        First 3 drafts are free for new firms. After: ₹999 / ₹1,999 / ₹4,999 based on complexity.
      </p>
    </form>
  );
}

function Field({ label, value, onChange, type = "text", required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
      />
    </div>
  );
}

function Textarea({ label, value, onChange, rows, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows: number; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 focus:border-ink-900 focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}
