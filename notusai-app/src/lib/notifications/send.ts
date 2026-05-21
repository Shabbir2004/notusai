/**
 * Unified notification dispatcher.
 *
 * Creates an in-app notification (row in notifications table).
 * Optionally also sends email if it's high-priority.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type NotificationType =
  | "notice_drafted"
  | "vendor_resolved"
  | "anomaly_detected"
  | "deadline_alert"
  | "hearing_reminder"
  | "digest"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface CreateNotificationInput {
  firmId: string;
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<{ id: string } | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      firm_id: input.firmId,
      user_id: input.userId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body || null,
      link: input.link || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create notification:", error);
    return null;
  }

  return data;
}

export async function markAllRead(userId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("read", false);
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
}
