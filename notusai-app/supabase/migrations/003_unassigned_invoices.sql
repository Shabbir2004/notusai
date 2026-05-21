-- NotusAI Unassigned Invoices — Run AFTER 002_tally_bridge.sql.
--
-- Allows OCR'd invoices to be stored even when the client wasn't auto-matched
-- at email-routing time. Surfaced via /app/pending → "Needs assignment" section.
--
-- Why: across 100+ CAs, every new client + every GSTIN mismatch was silently
-- dropping invoices. Better to OCR and stage than to lose data.

-- ============================================
-- 1. MAKE client_id NULLABLE on invoices
-- ============================================
alter table public.invoices
  alter column client_id drop not null;

-- ============================================
-- 2. INDEX for fast lookup of unassigned invoices per firm
-- ============================================
create index if not exists invoices_unassigned_idx
  on public.invoices(firm_id, created_at desc)
  where client_id is null;

-- ============================================
-- 3. ADD assignment metadata so we can show OCR'd buyer info when no client matched
-- ============================================
alter table public.invoices
  add column if not exists buyer_gstin text,
  add column if not exists buyer_name text,
  add column if not exists source_email_subject text,
  add column if not exists source_email_from text,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by_user_id uuid references auth.users(id);

-- Index for "show me all unassigned invoices for this buyer GSTIN" (bulk-assign UX)
create index if not exists invoices_unassigned_buyer_gstin_idx
  on public.invoices(firm_id, buyer_gstin)
  where client_id is null and buyer_gstin is not null;
