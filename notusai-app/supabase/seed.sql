-- NotusAI test data seed.
-- Run AFTER you've signed in once (so auth.users has your record).
-- Run AFTER schema.sql + 001_automation.sql.
--
-- Creates: 3 fake clients (Sharma Textile, Patel Engineering, Surat Diamonds)
-- with GSTINs, 10 fake vendors, sample mismatches and anomalies.
--
-- HOW TO USE:
-- 1. Make sure you've signed in to your local NotusAI app at least once
-- 2. Update v_email below to match your auth email
-- 3. Run this in Supabase SQL Editor (or via psql)
-- 4. Refresh your /app dashboard — should see 3 clients + 10 vendors

DO $$
DECLARE
  v_user_id uuid;
  v_firm_id uuid;
  v_email text := 'shabbirabbas2004@gmail.com';  -- CHANGE THIS to your auth email
  v_sharma_id uuid;
  v_patel_id uuid;
  v_surat_id uuid;
  v_sharma_gstin_id uuid;
  v_patel_gstin_id uuid;
  v_surat_gstin_id uuid;
  v_patel_yarn_id uuid;
  v_mumbai_trading_id uuid;
  v_bangalore_elec_id uuid;
  v_kk_ind_id uuid;
  v_recon_id uuid;
BEGIN
  -- Look up your user and firm
  SELECT u.id, p.firm_id
  INTO v_user_id, v_firm_id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %. Sign in first.', v_email;
  END IF;
  IF v_firm_id IS NULL THEN
    RAISE EXCEPTION 'Profile has no firm_id. Run the user-fix SQL first.';
  END IF;

  RAISE NOTICE 'Seeding for firm %', v_firm_id;

  -- Clean any existing seed data (safe re-run) — order matters for FK constraints
  DELETE FROM public.mismatches WHERE firm_id = v_firm_id;
  DELETE FROM public.reconciliations WHERE firm_id = v_firm_id;
  DELETE FROM public.anomalies WHERE firm_id = v_firm_id;
  DELETE FROM public.notices WHERE firm_id = v_firm_id
    AND notice_number IN ('ASMT-10/MUM/2025/3847', 'DRC-01/KAR/2025/8842');
  DELETE FROM public.gstins WHERE firm_id = v_firm_id
    AND (gstin LIKE '27AABCS%' OR gstin LIKE '29AABCS%' OR gstin LIKE '24AABCS%');
  DELETE FROM public.clients WHERE firm_id = v_firm_id
    AND name IN ('Sharma Textile Industries', 'Patel Engineering Pvt Ltd', 'Surat Diamonds Trading');
  DELETE FROM public.vendors WHERE firm_id = v_firm_id;

  -- ============================================
  -- CLIENTS
  -- ============================================
  INSERT INTO public.clients (firm_id, name, industry, business_type, primary_contact_name, primary_contact_phone, primary_contact_email, assigned_to, status)
  VALUES
    (v_firm_id, 'Sharma Textile Industries', 'Textiles & Apparel', 'partnership', 'Suresh Sharma', '+919876543210', 'suresh@sharmatextile.com', v_user_id, 'active')
  RETURNING id INTO v_sharma_id;

  INSERT INTO public.clients (firm_id, name, industry, business_type, primary_contact_name, primary_contact_phone, primary_contact_email, assigned_to, status)
  VALUES
    (v_firm_id, 'Patel Engineering Pvt Ltd', 'Auto Components', 'private_ltd', 'Vikram Patel', '+919876543211', 'vikram@patel-eng.com', v_user_id, 'active')
  RETURNING id INTO v_patel_id;

  INSERT INTO public.clients (firm_id, name, industry, business_type, primary_contact_name, primary_contact_phone, primary_contact_email, assigned_to, status)
  VALUES
    (v_firm_id, 'Surat Diamonds Trading', 'Diamonds & Jewellery', 'partnership', 'Hitesh Mehta', '+919876543212', 'hitesh@suratdiamonds.com', v_user_id, 'active')
  RETURNING id INTO v_surat_id;

  -- ============================================
  -- GSTINs
  -- ============================================
  INSERT INTO public.gstins (firm_id, client_id, gstin, state, registration_type, registered_on, status)
  VALUES (v_firm_id, v_sharma_id, '27AABCS1234M1Z5', 'Maharashtra', 'regular', '2018-07-01', 'active')
  RETURNING id INTO v_sharma_gstin_id;

  INSERT INTO public.gstins (firm_id, client_id, gstin, state, registration_type, registered_on, status)
  VALUES (v_firm_id, v_patel_id, '29AABCS9012M1Z3', 'Karnataka', 'regular', '2017-07-01', 'active')
  RETURNING id INTO v_patel_gstin_id;

  INSERT INTO public.gstins (firm_id, client_id, gstin, state, registration_type, registered_on, status)
  VALUES (v_firm_id, v_surat_id, '24AABCS3344M1ZQ', 'Gujarat', 'regular', '2017-09-15', 'active')
  RETURNING id INTO v_surat_gstin_id;

  -- ============================================
  -- VENDORS (with risk scores)
  -- ============================================
  INSERT INTO public.vendors (firm_id, name, gstin, category, risk_score, filing_punctuality, late_filings_count, total_invoices_count, last_assessed_at)
  VALUES (v_firm_id, 'Patel Yarn Mills', '27AABCS5678M1Z3', 'supplier', 8.2, 3.5, 8, 47, now())
  RETURNING id INTO v_patel_yarn_id;

  INSERT INTO public.vendors (firm_id, name, gstin, category, risk_score, filing_punctuality, late_filings_count, total_invoices_count, last_assessed_at)
  VALUES (v_firm_id, 'Mumbai Trading Co', '27AABCS9876M1Z2', 'supplier', 7.5, 4.2, 6, 32, now())
  RETURNING id INTO v_mumbai_trading_id;

  INSERT INTO public.vendors (firm_id, name, gstin, category, risk_score, filing_punctuality, late_filings_count, total_invoices_count, last_assessed_at)
  VALUES (v_firm_id, 'Bangalore Electronics', '29AABCS1111M1Z9', 'supplier', 4.1, 7.8, 2, 28, now())
  RETURNING id INTO v_bangalore_elec_id;

  INSERT INTO public.vendors (firm_id, name, gstin, category, risk_score, filing_punctuality, late_filings_count, total_invoices_count, last_assessed_at)
  VALUES (v_firm_id, 'KK Industries', '27AABCS2222M1Z8', 'supplier', 3.2, 9.0, 1, 85, now())
  RETURNING id INTO v_kk_ind_id;

  INSERT INTO public.vendors (firm_id, name, gstin, category, risk_score, filing_punctuality, late_filings_count, total_invoices_count)
  VALUES
    (v_firm_id, 'Delhi Suppliers Pvt Ltd', '07AABCS3456M1ZB', 'supplier', 5.5, 6.0, 3, 18),
    (v_firm_id, 'Anand Polymers', '27AABCS3333M1Z5', 'supplier', 5.0, 6.5, 2, 12),
    (v_firm_id, 'Surat Yarn Traders', '24AABCS4444M1Z1', 'supplier', 6.8, 5.2, 4, 22),
    (v_firm_id, 'Mehta Stationers', '27AABCS5555M1Z9', 'services', 2.5, 9.5, 0, 6),
    (v_firm_id, 'Crystal Couriers', '27AABCS6666M1Z7', 'services', 3.0, 8.8, 1, 24),
    (v_firm_id, 'TechHub Solutions', '29AABCS7777M1Z4', 'services', 4.5, 7.0, 2, 14);

  -- ============================================
  -- A RECONCILIATION + MISMATCHES (so Reconciliation Hub has data)
  -- ============================================
  INSERT INTO public.reconciliations (firm_id, gstin_id, period, total_books_invoices, total_2b_invoices, matched_count, matched_value, mismatch_value, itc_at_risk, status, completed_at)
  VALUES (v_firm_id, v_patel_gstin_id, '2025-10', 247, 241, 234, 4720000, 312000, 56160, 'completed', now())
  RETURNING id INTO v_recon_id;

  INSERT INTO public.mismatches (firm_id, reconciliation_id, type, severity, vendor_id, vendor_name, invoice_number, amount, ai_suggestion, status)
  VALUES
    (v_firm_id, v_recon_id, 'missing_in_2b', 'high', v_patel_yarn_id, 'Patel Yarn Mills', 'INV-2025-1005', 310000, 'Vendor "Patel Yarn Mills" hasn''t reported this in their GSTR-1. Either follow up with vendor to amend, or reverse ITC of ₹55,800.', 'open'),
    (v_firm_id, v_recon_id, 'amount_diff', 'medium', v_mumbai_trading_id, 'Mumbai Trading Co', 'INV-2025-1002', 85000, 'Books shows ₹85K, 2B shows ₹80K — ₹5K gap. Likely freight charge. Reclassify.', 'open'),
    (v_firm_id, v_recon_id, 'missing_in_2b', 'medium', NULL, 'Vendor X (unknown)', 'INV-2025-1009', 210000, 'Vendor missing from 2B. Follow up needed.', 'open');

  -- ============================================
  -- ANOMALIES (so Anomaly Engine has data)
  -- ============================================
  INSERT INTO public.anomalies (firm_id, client_id, gstin_id, period, type, severity, notice_probability, message, recommended_action, estimated_savings_inr, status)
  VALUES
    (v_firm_id, v_patel_id, v_patel_gstin_id, '2025-10', 'itc_excess', 'high', 0.73,
     'You''re claiming ₹4,82,400 ITC but only ₹4,26,240 is eligible per 2B. Excess: ₹56,160.',
     'Reverse ₹56,160 ITC OR follow up with vendors to amend GSTR-1 before filing.', 10109, 'open'),
    (v_firm_id, v_patel_id, v_patel_gstin_id, '2025-10', 'vendor_late', 'medium', 0.45,
     '38% of vendors filed late in last 6 months. Significantly above average.',
     'Switch to compliant vendors for high-value purchases OR add 14-day buffer before filing.', 0, 'open'),
    (v_firm_id, v_sharma_id, v_sharma_gstin_id, '2025-10', 'invoice_payment_unpaid', 'critical', 0.85,
     '3 invoices unpaid for >180 days. ITC of ₹1,24,000 must be reversed per Section 16(2)(c).',
     'Pay vendors immediately OR reverse the ITC with interest. Department auto-flags this.', 22320, 'open');

  -- ============================================
  -- SAMPLE NOTICES (so Notices tab has data)
  -- ============================================
  INSERT INTO public.notices (firm_id, user_id, client_id, gstin_id, notice_type, notice_number, notice_date, authority, period, demand_amount, deadline, notice_text, draft_md, status, tier, price_inr, was_free, paid)
  VALUES (
    v_firm_id, v_user_id, v_sharma_id, v_sharma_gstin_id, 'ASMT-10', 'ASMT-10/MUM/2025/3847', '2025-10-12',
    'Asst. Commissioner, Ward 04, Mumbai', 'April 2025 to June 2025', 342000, '2025-12-14',
    '[Sample notice text — Sharma Textile ASMT-10 scrutiny]',
    '## EXECUTIVE SUMMARY\n- Notice type: ASMT-10\n- Total demand: ₹3,42,000\n- Strategy: Defend ₹2,90,000 via Rule 36(4), reverse ₹52,000\n- Predicted outcome: HIGH\n\n[Full draft would appear here]',
    'ready', 'medium', 1999, true, false
  );

  INSERT INTO public.notices (firm_id, user_id, client_id, gstin_id, notice_type, notice_number, notice_date, authority, period, demand_amount, deadline, notice_text, status, tier, price_inr, was_free, paid)
  VALUES (
    v_firm_id, v_user_id, v_patel_id, v_patel_gstin_id, 'DRC-01', 'DRC-01/KAR/2025/8842', '2025-11-05',
    'Dy. Commissioner, LGSTO 23, Bangalore', 'October 2024 to September 2025', 1078400, '2025-12-05',
    '[Sample DRC-01 text — Patel Engineering demand notice]',
    'pending', 'complex', 4999, false, false
  );

  RAISE NOTICE 'Seed complete. Created: 3 clients, 3 GSTINs, 10 vendors, 1 reconciliation, 3 mismatches, 3 anomalies, 2 notices.';
END $$;
