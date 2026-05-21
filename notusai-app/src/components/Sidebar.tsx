"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Scale,
  GitBranch,
  ShieldAlert,
  Truck,
  MessageSquare,
  BookOpen,
  Settings,
  Inbox,
  Sparkles,
} from "lucide-react";
import { NotificationBell } from "./NotificationBell";

const NAV = [
  { href: "/app", label: "Smart Inbox", Icon: LayoutDashboard },
  { href: "/app/pending", label: "Agent activity", Icon: Sparkles, showBadge: true },
  { href: "/app/clients", label: "Clients", Icon: Users },
  { href: "/app/notices", label: "Notices", Icon: FileText },
  { href: "/app/inbox-review", label: "Email Review", Icon: Inbox },
  { href: "/app/litigation", label: "Litigation OS", Icon: Scale },
  { href: "/app/reconciliation", label: "Reconciliation", Icon: GitBranch },
  { href: "/app/anomalies", label: "Anomaly Engine", Icon: ShieldAlert },
  { href: "/app/vendors", label: "Vendors", Icon: Truck },
  { href: "/app/copilot", label: "Copilot", Icon: MessageSquare },
  { href: "/app/research", label: "Tax Research", Icon: BookOpen },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/pending", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setPendingCount(json.totalPendingItems || 0);
      } catch {
        // ignore — badge just won't show
      }
    }
    poll();
    const id = setInterval(poll, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-ink-200 bg-white">
      <div className="flex h-16 items-center justify-between border-b border-ink-200 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-sm font-extrabold text-ink-50">
            N
          </div>
          <span className="text-lg font-bold text-ink-900">NotusAI</span>
        </div>
        <NotificationBell />
      </div>

      <nav className="mt-4 space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon, showBadge }) => {
          const active =
            pathname === href || (href !== "/app" && pathname.startsWith(href));
          const showCount = showBadge && pendingCount && pendingCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-ink-900 text-ink-50"
                  : "text-ink-700 hover:bg-ink-100 hover:text-ink-900"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              {showCount && (
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                    active
                      ? "bg-ink-50 text-ink-900"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
