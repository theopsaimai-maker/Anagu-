-- ============================================================================
-- ANAGU PHASE 2.5 — ROLLBACK-SAFE BASE-TABLE RLS INTEGRATION TEST SUITE
-- File: supabase/tests/002_base_tables_rls_integration.sql
-- ============================================================================
-- USAGE:
--   Run manually in Supabase SQL Editor or `psql` AFTER applying
--   `supabase/migrations/002_base_tables_rls.sql`.
--   Runs entirely inside `BEGIN; ... ROLLBACK;` using isolated test IDs so
--   no test rows persist and no live records are modified or deleted.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_target_tables CONSTANT TEXT[] := ARRAY[
    'anagu_users',
    'anagu_admins',
    'anagu_oracle_attestations',
    'anagu_mqtt_events',
    'anagu_inquiries'
  ];
  v_table TEXT;
  v_full_name TEXT;
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
  v_caught_42501 BOOLEAN;
  v_users_before BIGINT;
  v_admins_before BIGINT;
  v_mqtt_before BIGINT;
  v_inquiries_before BIGINT;
  v_users_after BIGINT;
  v_admins_after BIGINT;
  v_mqtt_after BIGINT;
  v_inquiries_after BIGINT;

  v_test_user_id TEXT := 'usr-rls-test-2501';
  v_test_admin_id TEXT := 'adm-rls-test-2501';
  v_test_mqtt_id TEXT := 'msg-rls-test-2501';
  v_test_inquiry_id TEXT := 'inq-rls-test-2501';
BEGIN
  -- --------------------------------------------------------------------------
  -- TEST 1: RLS enabled + zero permissive policies on all five base tables
  -- --------------------------------------------------------------------------
  FOREACH v_table IN ARRAY v_target_tables LOOP
    v_full_name := 'public.' || v_table;

    SELECT c.relrowsecurity
    INTO v_rls_enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_table;

    IF v_rls_enabled IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL [Test 1]: RLS is NOT enabled on %.', v_full_name;
    END IF;

    SELECT COUNT(*) INTO v_policy_count
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = v_table;

    IF v_policy_count <> 0 THEN
      RAISE EXCEPTION 'FAIL [Test 1]: Expected 0 policies on default-deny table %, found %.', v_full_name, v_policy_count;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- TEST 2: PUBLIC, anon, authenticated have ZERO table privileges & NO public CREATE
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    IF pg_catalog.has_schema_privilege('anon', 'public', 'CREATE') THEN
      RAISE EXCEPTION 'FAIL [Test 2]: Role "anon" retains CREATE privilege on schema public.';
    END IF;
    FOREACH v_table IN ARRAY v_target_tables LOOP
      v_full_name := 'public.' || v_table;
      IF pg_catalog.has_table_privilege('anon', v_full_name, 'SELECT')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'INSERT')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'UPDATE')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'DELETE')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'TRUNCATE') THEN
        RAISE EXCEPTION 'FAIL [Test 2]: Role "anon" retains direct privileges on %.', v_full_name;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    IF pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE') THEN
      RAISE EXCEPTION 'FAIL [Test 2]: Role "authenticated" retains CREATE privilege on schema public.';
    END IF;
    FOREACH v_table IN ARRAY v_target_tables LOOP
      v_full_name := 'public.' || v_table;
      IF pg_catalog.has_table_privilege('authenticated', v_full_name, 'SELECT')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'INSERT')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'UPDATE')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'DELETE')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'TRUNCATE') THEN
        RAISE EXCEPTION 'FAIL [Test 2]: Role "authenticated" retains direct privileges on %.', v_full_name;
      END IF;
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 3: service_role matches exact least-privilege grant contract
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    IF pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: Role "service_role" must not have CREATE on schema public.';
    END IF;

    -- anagu_users: SELECT, INSERT, UPDATE, DELETE (no TRUNCATE)
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'INSERT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: service_role privileges on public.anagu_users do not match contract.';
    END IF;

    -- anagu_admins: SELECT, INSERT only
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: service_role privileges on public.anagu_admins do not match contract.';
    END IF;

    -- anagu_oracle_attestations: SELECT, INSERT only
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: service_role privileges on public.anagu_oracle_attestations do not match contract.';
    END IF;

    -- anagu_mqtt_events: SELECT, INSERT only
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: service_role privileges on public.anagu_mqtt_events do not match contract.';
    END IF;

    -- anagu_inquiries: SELECT, INSERT, DELETE only
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL [Test 3]: service_role privileges on public.anagu_inquiries do not match contract.';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 4: Direct role-switch enforcement check — anon & authenticated blocked (42501)
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    FOREACH v_table IN ARRAY v_target_tables LOOP
      v_caught_42501 := FALSE;
      BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_table);
      EXCEPTION WHEN SQLSTATE '42501' THEN
        v_caught_42501 := TRUE;
      END;
      EXECUTE 'RESET ROLE';
      IF NOT v_caught_42501 THEN
        RAISE EXCEPTION 'FAIL [Test 4]: Role "anon" was NOT blocked with 42501 on public.%.', v_table;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    FOREACH v_table IN ARRAY v_target_tables LOOP
      v_caught_42501 := FALSE;
      BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_table);
      EXCEPTION WHEN SQLSTATE '42501' THEN
        v_caught_42501 := TRUE;
      END;
      EXECUTE 'RESET ROLE';
      IF NOT v_caught_42501 THEN
        RAISE EXCEPTION 'FAIL [Test 4]: Role "authenticated" was NOT blocked with 42501 on public.%.', v_table;
      END IF;
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 5: service_role backend CRUD smoke test on isolated rows (rolled back)
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_users_before FROM public.anagu_users;
  SELECT COUNT(*) INTO v_admins_before FROM public.anagu_admins;
  SELECT COUNT(*) INTO v_mqtt_before FROM public.anagu_mqtt_events;
  SELECT COUNT(*) INTO v_inquiries_before FROM public.anagu_inquiries;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'SET LOCAL ROLE service_role';

    INSERT INTO public.anagu_users (
      id, full_name, email, phone, role, state_jurisdiction, credential_id, password_hash
    ) VALUES (
      v_test_user_id, 'RLS Test Citizen', 'rls.test.2501@anagu.test', '+234 800 000 0001',
      'citizen', 'Federal Capital Territory (Abuja)', 'NIN-TEST-2501', 'salt:deadbeef'
    );
    UPDATE public.anagu_users SET role = 'surveyor' WHERE id = v_test_user_id;
    DELETE FROM public.anagu_users WHERE id = v_test_user_id;

    INSERT INTO public.anagu_admins (
      id, full_name, email, phone, department, state_jurisdiction, password_hash
    ) VALUES (
      v_test_admin_id, 'RLS Test Admin', 'adm.rls.2501@anagu.test', '+234 800 000 0002',
      'Registry Audit', 'Federal Capital Territory (Abuja)', 'salt:deadbeef'
    );

    -- Verify service_role CANNOT delete or update anagu_admins
    v_caught_42501 := FALSE;
    BEGIN
      DELETE FROM public.anagu_admins WHERE id = v_test_admin_id;
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_caught_42501 := TRUE;
    END;
    IF NOT v_caught_42501 THEN
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'FAIL [Test 5]: service_role unexpectedly deleted from public.anagu_admins.';
    END IF;

    INSERT INTO public.anagu_mqtt_events (
      id, topic, payload, qos, event_timestamp, delivery_latency_ms, status
    ) VALUES (
      v_test_mqtt_id, 'land/registration/status', '{"test":true}'::jsonb, 1, '00:00:01', 20, 'delivered'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.anagu_inquiries (
      id, full_name, phone, email, state_jurisdiction, message
    ) VALUES (
      v_test_inquiry_id, 'RLS Test Caller', '+234 800 000 0003', 'caller@anagu.test',
      'Lagos State', 'Rollback-safe test inquiry'
    );
    DELETE FROM public.anagu_inquiries WHERE id = v_test_inquiry_id;

    EXECUTE 'RESET ROLE';

    -- Owner cleanup of append-only test rows before count check (entire tx still rolls back)
    DELETE FROM public.anagu_admins WHERE id = v_test_admin_id;
    DELETE FROM public.anagu_mqtt_events WHERE id = v_test_mqtt_id;
  END IF;

  SELECT COUNT(*) INTO v_users_after FROM public.anagu_users;
  SELECT COUNT(*) INTO v_admins_after FROM public.anagu_admins;
  SELECT COUNT(*) INTO v_mqtt_after FROM public.anagu_mqtt_events;
  SELECT COUNT(*) INTO v_inquiries_after FROM public.anagu_inquiries;

  IF v_users_after <> v_users_before
     OR v_admins_after <> v_admins_before
     OR v_mqtt_after <> v_mqtt_before
     OR v_inquiries_after <> v_inquiries_before THEN
    RAISE EXCEPTION 'FAIL [Cleanup]: Live table row counts changed during integration test.';
  END IF;

  RAISE NOTICE 'PASS: All ANAGU Phase 2.5 base-table RLS & privilege tests passed (transaction will now ROLLBACK).';
END;
$$;

ROLLBACK;
