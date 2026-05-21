"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function NewClientPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/client/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        industry: formData.get("industry"),
        gstin: formData.get("gstin"),
        state: formData.get("state"),
        primary_contact_name: formData.get("contactName"),
        primary_contact_phone: formData.get("contactPhone"),
        primary_contact_email: formData.get("contactEmail"),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create client");
      setSubmitting(false);
      return;
    }
    const { clientId } = await res.json();
    router.push(`/app/clients/${clientId}`);
  }

  return (
    <div className="px-8 py-8">
      <Link href="/app/clients" className="mb-6 inline-block text-sm text-ink-600 hover:text-ink-900">
        ← Back to clients
      </Link>
      <h1 className="text-2xl font-bold">Add a client</h1>
      <p className="mt-2 text-ink-600">Each client may have multiple GSTINs across states.</p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-5 rounded-xl border border-ink-200 bg-white p-6">
        <Field label="Business name" name="name" required placeholder="Sharma Textile Industries" />
        <Field label="Industry" name="industry" placeholder="Textiles & Apparel" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="GSTIN (primary)" name="gstin" placeholder="27AABCS1234M1Z5" />
          <Field label="State" name="state" placeholder="Maharashtra" />
        </div>
        <hr className="border-ink-200" />
        <Field label="Primary contact name" name="contactName" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Phone (with country code)" name="contactPhone" placeholder="+919876543210" />
          <Field label="Email" name="contactEmail" type="email" />
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-ink-900 px-5 py-3 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create client"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, name, type = "text", required, placeholder }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
      />
    </div>
  );
}
