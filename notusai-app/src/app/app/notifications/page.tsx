import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-ink-600">All AI activity and alerts from the past month.</p>
      </header>

      {!notifications || notifications.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-ink-600">No notifications yet. As AI does work overnight, you'll see it here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const sevColor = {
              info: "border-blue-200 bg-blue-50",
              success: "border-green-200 bg-green-50",
              warning: "border-amber-200 bg-amber-50",
              critical: "border-red-200 bg-red-50",
            }[n.severity as "info" | "success" | "warning" | "critical"];
            return (
              <Link
                key={n.id}
                href={n.link || "#"}
                className={`block rounded-lg border ${sevColor} p-4 hover:opacity-90 ${!n.read ? "ring-2 ring-blue-300/40" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-ink-900">{n.title}</div>
                    {n.body && <div className="mt-1 text-sm text-ink-700">{n.body}</div>}
                  </div>
                  <div className="text-xs text-ink-500">
                    {new Date(n.created_at).toLocaleString("en-IN", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
