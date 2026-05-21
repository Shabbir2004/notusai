"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-ink-700 hover:bg-ink-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Anchored just to the right of the sidebar (w-60 = 240px), top below header (h-16 = 64px).
              Fixed positioning escapes the sidebar's clipping bounds. */}
          <div className="fixed left-[244px] top-[60px] z-50 w-96 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <div className="font-semibold">Notifications</div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-ink-600 hover:text-ink-900"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[480px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-500">
                  No notifications yet.<br />
                  AI activity will appear here.
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem key={n.id} n={n} onClose={() => setOpen(false)} />
                ))
              )}
            </div>

            <div className="border-t border-ink-200 px-4 py-2 text-center">
              <Link
                href="/app/notifications"
                className="text-xs text-ink-600 hover:text-ink-900"
                onClick={() => setOpen(false)}
              >
                View all notifications →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationItem({ n, onClose }: { n: Notification; onClose: () => void }) {
  const sevDot = {
    info: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
  }[n.severity];

  const inner = (
    <div className={`flex gap-3 border-b border-ink-100 px-4 py-3 hover:bg-ink-50 ${!n.read ? "bg-blue-50/30" : ""}`}>
      <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${sevDot}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink-900">{n.title}</div>
        {n.body && <div className="mt-0.5 text-xs text-ink-600">{n.body}</div>}
        <div className="mt-1 text-[11px] text-ink-500">
          {timeAgo(n.created_at)}
        </div>
      </div>
    </div>
  );

  if (n.link) {
    return (
      <Link href={n.link} onClick={onClose} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
