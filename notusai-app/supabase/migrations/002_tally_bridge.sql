-- NotusAI Tally Bridge — Run AFTER schema.sql + 001_automation.sql.
-- Adds support for exporting invoices to CA's Tally as importable XML vouchers.

-- ============================================
-- 1. EXTEND INVOICES with Tally export tracking
-- ============================================
alter table public.invoices
  add column if not exists tally_exported boolean default false,
  add column if not exists tally_export_batch_id uuid,
  add column if not exists tally_voucher_number text,
  add column if not exists tally_exported_at timestamptz,
  add column if not exists vendor_ledger_id uuid;

create index if not exists invoices_tally_pending_idx
  on public.invoices(client_id, tally_exported)
  where tally_exported = false;

-- ============================================
-- 2. TALLY LEDGERS (CA's master list of ledgers per client)
-- Imported once from CA's Tally via "List of Accounts → Export → XML"
-- ============================================
create table if not exists public.tally_ledgers (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,                       -- exact ledger name from Tally
  parent_group text,                        -- e.g., "Sundry Creditors", "Purchase Accounts"
  gstin text,                               -- if it's a party ledger
  ledger_type text,                         -- party | purchase | tax | bank | expense | other
  is_party_ledger boolean default false,
  opening_balance numeric(15,2),
  raw_data jsonb,                           -- full extracted Tally fields
  imported_at timestamptz default now(),
  unique (client_id, name)
);

create index if not exists tally_ledgers_client_idx on public.tally_ledgers(client_id);
create index if not exists tally_ledgers_gstin_idx on public.tally_ledgers(gstin) where gstin is not null;

alter table public.tally_ledgers enable row level security;
drop policy if exists "tally_ledgers_firm_access" on public.tally_ledgers;
create policy "tally_ledgers_firm_access" on public.tally_ledgers for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- 3. VENDOR → LEDGER MAPPINGS
-- One vendor might be called differently across clients' Tallies.
-- This table maps NotusAI's vendor record to specific Tally ledger per client.
-- ============================================
create table if not exists public.tally_vendor_mappings (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  tally_ledger_id uuid not null references public.tally_ledgers(id) on delete cascade,
  match_confidence text not null,           -- high | medium | low | manual
  match_strategy text,                      -- gstin | name_exact | name_fuzzy | manual
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique (client_id, vendor_id)
);

create index if not exists vendor_mappings_client_idx on public.tally_vendor_mappings(client_id);

alter table public.tally_vendor_mappings enable row level security;
drop policy if exists "vendor_mappings_firm_access" on public.tally_vendor_mappings;
create policy "vendor_mappings_firm_access" on public.tally_vendor_mappings for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- 4. EXPORT BATCHES (every "Download XML" click creates one)
-- ============================================
create table if not exists public.tally_export_batches (
  id uuid primary key default uuid_generate_v4(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid references auth.users(id),
  invoice_count int not null default 0,
  total_value numeric(15,2),
  xml_storage_path text,
  filename text,
  status text default 'generated',          -- generated | downloaded | imported_confirmed
  notes text,
  generated_at timestamptz default now(),
  downloaded_at timestamptz,
  imported_confirmed_at timestamptz
);

create index if not exists export_batches_client_idx on public.tally_export_batches(client_id, generated_at desc);

alter table public.tally_export_batches enable row level security;
drop policy if exists "export_batches_firm_access" on public.tally_export_batches;
create policy "export_batches_firm_access" on public.tally_export_batches for all
  using (firm_id = public.current_firm_id());

-- ============================================
-- 5. CLIENT TALLY CONFIG (per-client preferences)
-- ============================================
create table if not exists public.client_tally_config (
  client_id uuid primary key references public.clients(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  tally_company_name text,                  -- exact company name in CA's Tally
  default_purchase_ledger text,             -- e.g., "Purchase A/c"
  default_cgst_ledger text,                 -- e.g., "Input CGST 9%"
  default_sgst_ledger text,                 -- e.g., "Input SGST 9%"
  default_igst_ledger text,                 -- e.g., "Input IGST 18%"
  ledgers_last_synced_at timestamptz,
  ledgers_count int default 0,
  auto_export_enabled boolean default false,  -- future: auto-export at end of month
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.client_tally_config enable row level security;
drop policy if exists "tally_config_firm_access" on public.client_tally_config;
create policy "tally_config_firm_access" on public.client_tally_config for all
  using (firm_id = public.current_firm_id());
