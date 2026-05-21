-- NotusAI — automation tables.
-- Run AFTER schema.sql.
-- Adds: notifications, email_integrations, scheduled_job_logs, gmail_processed_messages

-- ============================================
-- NOTIFICATIONS (in-app bell + email)
-- ============================================
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, -- notice_drafted | vendor_resolved | anomaly_detected | deadline_alert | hearing_reminder | digest | system
  severity text not null default 'info', -- info | success | warning | critical
  title text not null,
  body text,
  link text, -- e.g., /app/notices/xyz
  entity_type text, -- notice | mismatch | anomaly | hearing | agent_run
  entity_id uuid,
  read boolean not null default false,
  read_at timestamptz,
  emailed boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_unread_idx on public.notifications(user_id, read) where read = false;
create index if not exists notifications_firm_created_idx on public.notifications(firm_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications_firm_access" on public.notifications;
create policy "notifications_firm_access" on public.notifications for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- EMAIL INTEGRATIONS (Gmail OAuth)
-- ============================================
create table if not exists public.email_integrations (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gmail', -- gmail | outlook
  email_address text not null,
  access_token text, -- encrypted; only service role reads
  refresh_token text, -- encrypted; only service role reads
  expires_at timestamptz,
  scopes text[],
  last_sync_at timestamptz,
  last_history_id text, -- Gmail historyId for incremental sync
  status text default 'active', -- active | paused | error | revoked
  error_message text,
  created_at timestamptz default now(),
  unique (firm_id, email_address)
);

create index if not exists email_integrations_user_idx on public.email_integrations(user_id);

alter table public.email_integrations enable row level security;
drop policy if exists "email_integrations_firm_access" on public.email_integrations;
create policy "email_integrations_firm_access" on public.email_integrations for all
  using (firm_id = public.current_firm_id());

-- Track which Gmail messages we've already processed (idempotency)
create table if not exists public.gmail_processed_messages (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  integration_id uuid not null references public.email_integrations(id) on delete cascade,
  message_id text not null, -- Gmail's message id
  thread_id text,
  from_email text,
  subject text,
  classified_as text, -- notice | invoice | other | ignored
  notice_id uuid references public.notices(id),
  processed_at timestamptz default now(),
  unique (integration_id, message_id)
);

create index if not exists gmail_messages_msgid_idx on public.gmail_processed_messages(message_id);

alter table public.gmail_processed_messages enable row level security;
drop policy if exists "gmail_messages_firm_access" on public.gmail_processed_messages;
create policy "gmail_messages_firm_access" on public.gmail_processed_messages for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- SCHEDULED JOB LOGS (cron audit trail)
-- ============================================
create table if not exists public.scheduled_job_logs (
  id uuid primary key default uuid_generate_v4(),
  job_name text not null,
  firm_id uuid references public.firms(id) on delete cascade,
  status text not null default 'running', -- running | success | error | partial
  items_processed int default 0,
  items_succeeded int default 0,
  items_failed int default 0,
  error_message text,
  duration_ms int,
  result_summary jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists job_logs_name_idx on public.scheduled_job_logs(job_name, started_at desc);

-- Service role only — no RLS needed
alter table public.scheduled_job_logs enable row level security;
drop policy if exists "job_logs_service_only" on public.scheduled_job_logs;
create policy "job_logs_service_only" on public.scheduled_job_logs for all using (false);

-- ============================================
-- WHATSAPP MESSAGES (track inbound/outbound for vendor agents)
-- ============================================
create table if not exists public.whatsapp_messages (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid references public.firms(id) on delete cascade,
  direction text not null, -- inbound | outbound
  from_phone text,
  to_phone text,
  body text,
  message_id text, -- WhatsApp message id
  related_followup_id uuid references public.vendor_followups(id),
  related_agent_run_id uuid references public.agent_runs(id),
  ai_classification text, -- confirmation | denial | question | acknowledgment | unrelated
  processed boolean default false,
  created_at timestamptz default now()
);

create index if not exists wa_messages_phone_idx on public.whatsapp_messages(from_phone, created_at desc);

alter table public.whatsapp_messages enable row level security;
drop policy if exists "wa_messages_firm_access" on public.whatsapp_messages;
create policy "wa_messages_firm_access" on public.whatsapp_messages for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_digest_enabled boolean default true,
  daily_digest_hour int default 7, -- IST 0-23
  email_notifications_enabled boolean default true,
  whatsapp_to_phone text, -- if set, critical notifications also go here
  critical_only_after_hours boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_self" on public.notification_preferences;
create policy "notif_prefs_self" on public.notification_preferences for all
  using (user_id = auth.uid());

-- ============================================
-- AUTO-CREATE PREFERENCES ON USER SIGNUP
-- ============================================
create or replace function public.handle_new_user_prefs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_prefs on auth.users;
create trigger on_auth_user_created_prefs
  after insert on auth.users
  for each row execute procedure public.handle_new_user_prefs();
