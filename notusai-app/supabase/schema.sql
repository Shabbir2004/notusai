-- NotusAI — full multi-tenant schema for all 10 modules.
-- Run this in Supabase → SQL Editor.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================
-- TENANCY: firms and members
-- ============================================
create table if not exists public.firms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text not null default 'free', -- free | starter | practice | firm | enterprise
  primary_contact_email text,
  primary_contact_phone text,
  city text,
  state text,
  gstin text, -- the firm's own GSTIN if registered
  free_credits_remaining int not null default 3,
  total_paid_drafts int not null default 0,
  onboarded boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid references public.firms(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text not null default 'owner', -- owner | partner | senior | associate | viewer
  created_at timestamptz default now()
);

-- ============================================
-- CLIENTS (each firm's clients are GST-registered businesses)
-- ============================================
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  industry text,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  business_type text, -- proprietor | partnership | private_ltd | public_ltd | llp
  pan text,
  assigned_to uuid references public.profiles(id),
  status text default 'active', -- active | dormant | offboarded
  created_at timestamptz default now()
);

create index if not exists clients_firm_idx on public.clients(firm_id);

-- Each client may have multiple GSTINs (different states)
create table if not exists public.gstins (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  gstin text not null,
  state text not null,
  registration_type text, -- regular | composition | sez
  registered_on date,
  status text default 'active',
  portal_username text, -- for read-only credential storage; NOT used for auto-file
  portal_credentials_encrypted text, -- encrypt with Supabase Vault
  created_at timestamptz default now(),
  unique (firm_id, gstin)
);

create index if not exists gstins_client_idx on public.gstins(client_id);

-- ============================================
-- VENDORS (across all clients, for cross-firm risk scoring)
-- ============================================
create table if not exists public.vendors (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  gstin text,
  name text not null,
  category text, -- supplier | services | freight | other
  risk_score numeric(3,2) default 5.0, -- 0-10, higher = riskier
  filing_punctuality numeric(3,2) default 5.0, -- 0-10
  late_filings_count int default 0,
  total_invoices_count int default 0,
  last_assessed_at timestamptz,
  created_at timestamptz default now(),
  unique (firm_id, gstin)
);

create index if not exists vendors_firm_idx on public.vendors(firm_id);

-- ============================================
-- GST RETURNS & RECONCILIATION
-- ============================================
create table if not exists public.gst_returns (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  gstin_id uuid not null references public.gstins(id) on delete cascade,
  period text not null, -- e.g., '2025-10' or 'Q3-2025-26'
  form_type text not null, -- GSTR-1 | GSTR-2A | GSTR-2B | GSTR-3B | GSTR-9 | GSTR-9C
  raw_json jsonb,
  filed_at timestamptz,
  ingested_at timestamptz default now(),
  source text default 'manual' -- manual | gsp | tally
);

create index if not exists gst_returns_period_idx on public.gst_returns(gstin_id, period, form_type);

create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  gstin_id uuid references public.gstins(id) on delete cascade,
  invoice_number text not null,
  invoice_date date,
  vendor_id uuid references public.vendors(id),
  vendor_gstin text,
  vendor_name text,
  amount numeric(15,2),
  cgst numeric(15,2),
  sgst numeric(15,2),
  igst numeric(15,2),
  total_tax numeric(15,2),
  hsn_code text,
  source text default 'books', -- books | 2b | both
  raw_data jsonb,
  created_at timestamptz default now()
);

create index if not exists invoices_client_period_idx on public.invoices(client_id, invoice_date);

create table if not exists public.reconciliations (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  gstin_id uuid not null references public.gstins(id) on delete cascade,
  period text not null,
  total_books_invoices int,
  total_2b_invoices int,
  matched_count int,
  matched_value numeric(15,2),
  mismatch_value numeric(15,2),
  itc_at_risk numeric(15,2),
  status text default 'pending', -- pending | running | completed | failed
  notes text,
  raw_results jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.mismatches (
  id uuid primary key default uuid_generate_v4(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  type text not null, -- missing_in_2b | missing_in_books | amount_diff | gstin_diff | hsn_diff
  severity text not null, -- low | medium | high
  vendor_id uuid references public.vendors(id),
  vendor_name text,
  invoice_number text,
  amount numeric(15,2),
  ai_suggestion text,
  status text default 'open', -- open | in_followup | resolved | accepted_loss
  resolution_path text, -- vendor_amended | books_corrected | itc_reversed | escalated
  created_at timestamptz default now()
);

create index if not exists mismatches_recon_idx on public.mismatches(reconciliation_id);

-- ============================================
-- NOTICES & LITIGATION OS
-- ============================================
create table if not exists public.notices (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  gstin_id uuid references public.gstins(id) on delete cascade,
  user_id uuid references auth.users(id),

  -- notice metadata
  notice_type text not null, -- ASMT-10 | DRC-01 | DRC-01A | DRC-07 | Section 73 | Section 74 | Audit | Other
  notice_number text,
  notice_date date,
  authority text,
  period text,
  demand_amount numeric(15,2),
  deadline date,

  -- input
  notice_text text,
  notice_pdf_url text,

  -- output
  draft_md text,
  draft_pdf_url text,
  citations jsonb,
  questions_for_practitioner jsonb,
  predicted_outcome text, -- high | medium | low
  predicted_outcome_score numeric(3,2),

  -- meta
  status text not null default 'pending', -- pending | drafting | ready | failed | filed | closed
  failure_reason text,
  llm_model text,
  tokens_input int,
  tokens_output int,
  cost_inr numeric(10,2),

  -- pricing
  tier text default 'simple',
  price_inr int default 999,
  was_free boolean default false,
  paid boolean default false,
  razorpay_payment_link text,
  razorpay_payment_id text,

  -- additional context (key facts from CA)
  key_facts text,
  tone text default 'balanced',

  created_at timestamptz default now(),
  drafted_at timestamptz,
  paid_at timestamptz,
  filed_at timestamptz
);

create index if not exists notices_firm_idx on public.notices(firm_id);
create index if not exists notices_client_idx on public.notices(client_id);
create index if not exists notices_deadline_idx on public.notices(deadline);
create index if not exists notices_status_idx on public.notices(status);

create table if not exists public.litigation_cases (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  notice_id uuid references public.notices(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  current_stage text not null, -- received | drafted | filed | dept_reviewing | closed_favorable | escalated_drc01 | drc01_filed | escalated_drc07 | appeal_filed | hearing_scheduled | order_received | tribunal | hc | sc
  next_action text,
  next_action_due date,
  next_hearing date,
  outcome text, -- favorable | partial | adverse | pending
  total_demand_at_start numeric(15,2),
  total_demand_current numeric(15,2),
  total_savings numeric(15,2),
  file_no text,
  raw_timeline jsonb,
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists public.hearings (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  case_id uuid not null references public.litigation_cases(id) on delete cascade,
  scheduled_at timestamptz not null,
  location text,
  forum text, -- ao | comm_appeals | tribunal | hc | sc
  brief_md text,
  brief_pdf_url text,
  outcome_md text,
  status text default 'scheduled', -- scheduled | done | adjourned | cancelled
  created_at timestamptz default now()
);

-- ============================================
-- AGENTS & WORKFLOWS
-- ============================================
create table if not exists public.agent_runs (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  type text not null, -- vendor_followup | notice_triage | doc_collector | reconciliation
  status text not null default 'running', -- running | succeeded | failed | cancelled
  trigger_type text, -- scheduled | manual | event
  related_id uuid, -- pointer to notice_id, mismatch_id, etc.
  steps jsonb default '[]'::jsonb,
  result jsonb,
  cost_inr numeric(10,2) default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.vendor_followups (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  mismatch_id uuid references public.mismatches(id),
  channel text not null, -- email | whatsapp | voice
  status text default 'pending', -- pending | sent | delivered | responded | escalated | resolved | failed
  attempts int default 0,
  last_message text,
  transcript text,
  resolution text,
  created_at timestamptz default now(),
  responded_at timestamptz,
  resolved_at timestamptz
);

-- ============================================
-- ANOMALIES & PREDICTIONS
-- ============================================
create table if not exists public.anomalies (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  gstin_id uuid references public.gstins(id) on delete cascade,
  period text not null,
  type text not null, -- itc_excess | vendor_late | b2b_b2c_mismatch | gstr1_3b_mismatch | etc.
  severity text not null, -- low | medium | high | critical
  notice_probability numeric(3,2), -- 0.00 to 1.00
  message text,
  recommended_action text,
  estimated_savings_inr numeric(15,2),
  status text default 'open', -- open | actioned | dismissed | superseded
  detected_at timestamptz default now(),
  actioned_at timestamptz
);

create index if not exists anomalies_client_idx on public.anomalies(client_id);
create index if not exists anomalies_status_idx on public.anomalies(status);

-- ============================================
-- COPILOT & RESEARCH
-- ============================================
create table if not exists public.copilot_threads (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  messages jsonb default '[]'::jsonb, -- array of {role, content, ts, tool_calls}
  total_tokens int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.research_queries (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  answer_md text,
  citations jsonb,
  source_chunks jsonb,
  created_at timestamptz default now()
);

-- ============================================
-- DOCUMENTS (uploaded invoices, notices, etc.)
-- ============================================
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid references public.clients(id),
  notice_id uuid references public.notices(id),
  type text not null, -- invoice | notice | bank_statement | ledger | tally_export | other
  filename text,
  size_bytes int,
  storage_path text,
  ocr_text text,
  parsed_json jsonb,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now()
);

-- ============================================
-- CLIENT PORTAL (signed-link access for end clients)
-- ============================================
create table if not exists public.client_portal_tokens (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  otp_phone text,
  otp_verified boolean default false,
  last_accessed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- AUDIT LOG (every mutation)
-- ============================================
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid references public.firms(id),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists audit_firm_idx on public.audit_logs(firm_id, created_at desc);

-- ============================================
-- AUTO-CREATE PROFILE + FIRM ON SIGNUP
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_firm_id uuid;
begin
  insert into public.firms (name, primary_contact_email, free_credits_remaining)
  values (coalesce(new.raw_user_meta_data->>'firm_name', 'My CA Firm'), new.email, 3)
  returning id into new_firm_id;

  insert into public.profiles (id, firm_id, email, role)
  values (new.id, new_firm_id, new.email, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (multi-tenant safety)
-- ============================================
alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.gstins enable row level security;
alter table public.vendors enable row level security;
alter table public.gst_returns enable row level security;
alter table public.invoices enable row level security;
alter table public.reconciliations enable row level security;
alter table public.mismatches enable row level security;
alter table public.notices enable row level security;
alter table public.litigation_cases enable row level security;
alter table public.hearings enable row level security;
alter table public.agent_runs enable row level security;
alter table public.vendor_followups enable row level security;
alter table public.anomalies enable row level security;
alter table public.copilot_threads enable row level security;
alter table public.research_queries enable row level security;
alter table public.documents enable row level security;
alter table public.client_portal_tokens enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: current user's firm_id
create or replace function public.current_firm_id()
returns uuid
language sql stable security definer
as $$
  select firm_id from public.profiles where id = auth.uid()
$$;

-- Generic policy: user can access rows where firm_id matches their firm
do $$
declare t text;
begin
  for t in select unnest(array[
    'clients', 'gstins', 'vendors', 'gst_returns', 'invoices',
    'reconciliations', 'mismatches', 'notices', 'litigation_cases',
    'hearings', 'agent_runs', 'vendor_followups', 'anomalies',
    'copilot_threads', 'research_queries', 'documents',
    'client_portal_tokens', 'audit_logs'
  ])
  loop
    execute format('drop policy if exists "%s_firm_access" on public.%s', t, t);
    execute format('create policy "%s_firm_access" on public.%s for all using (firm_id = public.current_firm_id())', t, t);
  end loop;
end$$;

-- Profile: users see profiles in their firm
drop policy if exists "profiles_firm_visibility" on public.profiles;
create policy "profiles_firm_visibility" on public.profiles for select
  using (firm_id = public.current_firm_id());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update
  using (auth.uid() = id);

-- Firms: users see their own firm
drop policy if exists "firms_own" on public.firms;
create policy "firms_own" on public.firms for select
  using (id = public.current_firm_id());

drop policy if exists "firms_self_update" on public.firms;
create policy "firms_self_update" on public.firms for update
  using (id = public.current_firm_id());
