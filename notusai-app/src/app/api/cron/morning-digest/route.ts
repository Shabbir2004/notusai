/**
 * Cron: Daily at 7:00 AM IST.
 * Sends each firm owner a morning digest email with overnight AI activity:
 *  - Notices drafted
 *  - Vendors resolved
 *  - Anomalies detected
 *  - Upcoming deadlines
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { Resend } from "resend";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const startedAt = Date.now();

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "NotusAI <onboarding@resend.dev>";

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: owners } = await supabase
    .from("profiles")
    .select("id, email, firm_id, firms(name, primary_contact_email)")
    .eq("role", "owner");

  let sent = 0;
  for (const owner of owners || []) {
    if (!owner.email) continue;

    // Check preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", owner.id)
      .maybeSingle();
    if (prefs && !prefs.daily_digest_enabled) continue;

    const firmName = (owner as { firms?: { name: string } }).firms?.name || "Your firm";

    // Gather overnight activity
    const [draftedRes, resolvedRes, anomaliesRes, deadlinesRes, pendingInvoiceRes] = await Promise.all([
      supabase
        .from("notices")
        .select("id, notice_type, demand_amount, clients(name)")
        .eq("firm_id", owner.firm_id)
        .gte("drafted_at", since)
        .eq("status", "ready"),

      supabase
        .from("agent_runs")
        .select("id, type, result")
        .eq("firm_id", owner.firm_id)
        .gte("completed_at", since)
        .eq("status", "succeeded"),

      supabase
        .from("anomalies")
        .select("id, type, severity, message, clients(name)")
        .eq("firm_id", owner.firm_id)
        .eq("status", "open")
        .in("severity", ["high", "critical"])
        .gte("detected_at", since),

      supabase
        .from("notices")
        .select("id, notice_type, deadline, clients(name)")
        .eq("firm_id", owner.firm_id)
        .lte("deadline", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
        .gte("deadline", new Date().toISOString().slice(0, 10))
        .neq("status", "closed"),

      supabase
        .from("invoices")
        .select("client_id, amount, cgst, sgst, igst, clients(name)")
        .eq("firm_id", owner.firm_id)
        .eq("tally_exported", false),
    ]);

    const drafted = draftedRes.data || [];
    const resolved = resolvedRes.data || [];
    const anomalies = anomaliesRes.data || [];
    const deadlines = deadlinesRes.data || [];
    const pendingInvoicesRaw = pendingInvoiceRes.data || [];

    // Group pending invoices by client
    const pendingByClient = new Map<string, { name: string; count: number; total: number }>();
    for (const inv of pendingInvoicesRaw) {
      if (!inv.client_id) continue;
      const name = (inv as unknown as { clients?: { name: string } }).clients?.name || "Unknown";
      const total =
        (Number(inv.amount) || 0) +
        (Number(inv.cgst) || 0) +
        (Number(inv.sgst) || 0) +
        (Number(inv.igst) || 0);
      const cur = pendingByClient.get(inv.client_id);
      if (cur) {
        cur.count++;
        cur.total += total;
      } else {
        pendingByClient.set(inv.client_id, { name, count: 1, total });
      }
    }
    const pendingInvoiceBatches = Array.from(pendingByClient.entries())
      .map(([id, v]) => ({ clientId: id, ...v }))
      .sort((a, b) => b.count - a.count);

    // Skip digest if nothing meaningful
    if (
      drafted.length +
        resolved.length +
        anomalies.length +
        deadlines.length +
        pendingInvoiceBatches.length ===
      0
    ) {
      continue;
    }

    const totalPendingActions = drafted.length + pendingInvoiceBatches.length + anomalies.length;

    const html = buildDigestHtml({
      firmName,
      drafted: drafted as unknown as Array<{ id: string; notice_type: string; demand_amount: unknown; clients?: { name: string } | null }>,
      resolved,
      anomalies: anomalies as unknown as Array<{ id: string; type: string; severity: string; message: string; clients?: { name: string } | null }>,
      deadlines: deadlines as unknown as Array<{ id: string; notice_type: string; deadline: string; clients?: { name: string } | null }>,
      pendingInvoiceBatches,
      totalPendingActions,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    });

    try {
      await resend.emails.send({
        from: fromEmail,
        to: owner.email,
        subject:
          totalPendingActions > 0
            ? `NotusAI · ${totalPendingActions} item${totalPendingActions === 1 ? "" : "s"} need your approval`
            : `NotusAI digest — ${drafted.length + resolved.length} items handled overnight`,
        html,
      });
      sent++;
    } catch (e) {
      console.error("Digest send failed:", e);
    }
  }

  await supabase.from("scheduled_job_logs").insert({
    job_name: "morning-digest",
    status: "success",
    items_processed: owners?.length || 0,
    items_succeeded: sent,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json({ sent });
}

function buildDigestHtml(opts: {
  firmName: string;
  drafted: Array<{ id: string; notice_type: string; demand_amount: unknown; clients?: { name: string } | null }>;
  resolved: Array<{ id: string; type: string; result: unknown }>;
  anomalies: Array<{ id: string; type: string; severity: string; message: string; clients?: { name: string } | null }>;
  deadlines: Array<{ id: string; notice_type: string; deadline: string; clients?: { name: string } | null }>;
  pendingInvoiceBatches: Array<{ clientId: string; name: string; count: number; total: number }>;
  totalPendingActions: number;
  appUrl: string;
}): string {
  function row(label: string, value: string) {
    return `<tr><td style="padding:8px 0;color:#57534e;font-size:14px;">${label}</td><td style="padding:8px 0;text-align:right;font-weight:600;">${value}</td></tr>`;
  }

  const totalPendingInvoices = opts.pendingInvoiceBatches.reduce((s, b) => s + b.count, 0);
  const totalPendingValue = opts.pendingInvoiceBatches.reduce((s, b) => s + b.total, 0);

  let body = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;background:#fafaf9;">
    <h2 style="margin:0 0 4px;">Good morning ☀️</h2>
    <p style="color:#78716c;margin-top:0;">${opts.firmName} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
  `;

  // HERO: agents are waiting for approval
  if (opts.totalPendingActions > 0) {
    body += `
    <div style="background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);border:2px solid #60a5fa;border-radius:12px;padding:24px;margin-top:16px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#1d4ed8;letter-spacing:0.05em;">🤖 Your agents have been busy</div>
      <h3 style="margin:8px 0 4px;font-size:20px;color:#1e3a8a;">${opts.totalPendingActions} item${opts.totalPendingActions === 1 ? "" : "s"} need your approval</h3>
      <p style="margin:8px 0 16px;color:#1e40af;font-size:14px;">One click each → done.</p>
      <a href="${opts.appUrl}/app/pending" style="display:inline-block;background:#2563eb;color:white;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Review &amp; approve →</a>
    </div>
    `;
  }

  body += `
    <div style="background:white;border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 12px;font-size:16px;">Overnight summary</h3>
      <table width="100%">
        ${row("Invoice batches ready for Tally", String(opts.pendingInvoiceBatches.length))}
        ${row("Notice drafts ready for review", String(opts.drafted.length))}
        ${row("Vendor agents completed", String(opts.resolved.length))}
        ${row("New high-risk anomalies", String(opts.anomalies.length))}
        ${row("Notices due within 7 days", String(opts.deadlines.length))}
      </table>
    </div>
  `;

  if (opts.pendingInvoiceBatches.length > 0) {
    body += `<div style="background:white;border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 4px;font-size:16px;">⚡ Invoices waiting for Tally import</h3>
      <p style="margin:0 0 12px;color:#78716c;font-size:13px;">${totalPendingInvoices} invoices · ₹${totalPendingValue.toLocaleString("en-IN")} total</p>
      <ul style="margin:0;padding-left:20px;">`;
    for (const b of opts.pendingInvoiceBatches.slice(0, 8)) {
      body += `<li style="margin-bottom:6px;"><a href="${opts.appUrl}/app/pending" style="color:#1c1917;font-weight:600;">${b.name}</a> — ${b.count} invoice${b.count === 1 ? "" : "s"} · ₹${b.total.toLocaleString("en-IN")}</li>`;
    }
    if (opts.pendingInvoiceBatches.length > 8) {
      body += `<li style="color:#78716c;">+ ${opts.pendingInvoiceBatches.length - 8} more client${opts.pendingInvoiceBatches.length - 8 === 1 ? "" : "s"}</li>`;
    }
    body += `</ul>
      <a href="${opts.appUrl}/app/pending" style="display:inline-block;margin-top:12px;color:#2563eb;font-weight:600;text-decoration:none;font-size:14px;">Approve all → push to Tally</a>
    </div>`;
  }

  if (opts.drafted.length > 0) {
    body += `<div style="background:white;border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 12px;font-size:16px;">📄 Drafts ready</h3>
      <ul style="margin:0;padding-left:20px;">`;
    for (const d of opts.drafted) {
      const client = d.clients?.name || "Client";
      body += `<li style="margin-bottom:6px;"><a href="${opts.appUrl}/app/notices/${d.id}" style="color:#1c1917;font-weight:600;">${client}</a> — ${d.notice_type}${d.demand_amount ? ` · ₹${Number(d.demand_amount).toLocaleString("en-IN")}` : ""}</li>`;
    }
    body += `</ul></div>`;
  }

  if (opts.deadlines.length > 0) {
    body += `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 12px;font-size:16px;">⏰ Upcoming deadlines</h3>
      <ul style="margin:0;padding-left:20px;">`;
    for (const d of opts.deadlines) {
      body += `<li><a href="${opts.appUrl}/app/notices/${d.id}" style="color:#1c1917;">${d.clients?.name || "Client"}</a> — ${d.notice_type} due ${new Date(d.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</li>`;
    }
    body += `</ul></div>`;
  }

  if (opts.anomalies.length > 0) {
    body += `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 12px;font-size:16px;">⚠️ New anomalies</h3>
      <ul style="margin:0;padding-left:20px;">`;
    for (const a of opts.anomalies) {
      body += `<li><strong>${a.clients?.name || "Client"}</strong> · ${a.severity} · ${a.message.slice(0, 100)}${a.message.length > 100 ? "..." : ""}</li>`;
    }
    body += `</ul></div>`;
  }

  if (opts.resolved.length > 0) {
    body += `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin-top:16px;">
      <h3 style="margin:0 0 8px;font-size:16px;">✅ Handled autonomously</h3>
      <p style="margin:0;color:#166534;font-size:14px;">${opts.resolved.length} task${opts.resolved.length === 1 ? "" : "s"} completed by agents — no action needed from you.</p>
    </div>`;
  }

  body += `<p style="margin-top:24px;color:#78716c;font-size:13px;">
    <a href="${opts.appUrl}/app" style="color:#1c1917;">Open NotusAI →</a>
  </p>
  </body></html>`;

  return body;
}
