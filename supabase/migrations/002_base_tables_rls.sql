-- ============================================================================
-- ANAGU LAND ADMINISTRATION PLATFORM — PHASE 2.5 BASE-TABLE RLS & PRIVILEGE HARDENING
-- File: supabase/migrations/002_base_tables_rls.sql
-- ============================================================================
-- TARGET TABLES (independent of Phase 2.2 PostGIS migration 001):
--   1. public.anagu_users
--   2. public.anagu_admins
--   3. public.anagu_oracle_attestations
--   4. public.anagu_mqtt_events
--   5. public.anagu_inquiries
--
-- ARCHITECTURE & SECURITY MODEL:
--   - ANAGU uses an Express backend (`server/createApiApp.ts` + `server/db.ts`)
--     connecting either via PostgreSQL (`DATABASE_URL`, database owner) or via
--     Supabase PostgREST using the server-side `service_role` key.
--   - NO browser/frontend code connects directly to Supabase or PostgREST.
--   - ANAGU does NOT use Supabase Auth (`auth.uid()`). All user and admin
--     sessions are verified by Express HMAC tokens (`server/auth.ts`) with live
--     role re-verification against `public.anagu_users` / `public.anagu_admins`.
--   - Therefore, all five tables enforce default-deny Row-Level Security (RLS)
--     with ZERO policies for `anon` or `authenticated`, and ALL direct table
--     privileges are revoked from `PUBLIC`, `anon`, and `authenticated`.
--   - `service_role` (which bypasses RLS in Supabase) is granted ONLY the
--     exact least-privilege DML operations required by `server/db.ts`:
--       * public.anagu_users               -> SELECT, INSERT, UPDATE, DELETE
--       * public.anagu_admins              -> SELECT, INSERT
--       * public.anagu_oracle_attestations -> SELECT, INSERT
--       * public.anagu_mqtt_events         -> SELECT, INSERT
--       * public.anagu_inquiries           -> SELECT, INSERT, DELETE
--   - No TRUNCATE, REFERENCES, or TRIGGER privileges are granted to `service_role`.
--   - `CREATE` on schema `public` is revoked from `PUBLIC`, `anon`, `authenticated`,
--     and `service_role` (preserving `USAGE`).
--
-- SAFETY & COMPATIBILITY GUARANTEES:
--   - Runs inside an explicit transaction (`BEGIN; ... COMMIT;`) so any failed
--     pre-flight check rolls back cleanly with zero partial changes.
--   - Non-destructive and idempotent: never deletes, truncates, rewrites rows,
--     or alters columns, constraints, indexes, password hashes, or user roles.
--   - Independent of migration 001: never touches `public.anagu_parcels`,
--     `anagu_internal`, PostGIS extensions, spatial functions, or parcel triggers.
--   - Does NOT silently drop pre-existing RLS policies; aborts with an actionable
--     error if unexpected policies exist so an operator can review them explicitly.
--
-- EXECUTION REQUIREMENT:
--   Run in Supabase SQL Editor or `psql` as the database owner role (`postgres`)
--   or the owning role of all five `public.anagu_*` tables.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Pre-flight Safety, Ownership, and Existing-Policy Inspection
-- ----------------------------------------------------------------------------
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
  v_table_oid OID;
  v_owner_oid OID;
  v_owner_name TEXT;
  v_expected_owner_oid OID := NULL;
  v_existing_policies TEXT;
BEGIN
  -- 1a. Refuse execution as untrusted / application-facing roles
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION
      'Base-table RLS migration aborted: cannot execute as role "%". Run as database owner (e.g., postgres).',
      current_user
      USING ERRCODE = '42501';
  END IF;

  -- 1b. Confirm all five base tables exist and have safe, consistent ownership
  FOREACH v_table IN ARRAY v_target_tables LOOP
    SELECT c.oid, c.relowner
    INTO v_table_oid, v_owner_oid
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind IN ('r', 'p');

    IF v_table_oid IS NULL THEN
      RAISE EXCEPTION
        'Base-table RLS migration aborted before making changes: required table public.% does not exist.',
        v_table
        USING
          ERRCODE = '42P01',
          HINT = 'Apply supabase/schema.sql before running supabase/migrations/002_base_tables_rls.sql.';
    END IF;

    SELECT rolname INTO v_owner_name
    FROM pg_catalog.pg_roles
    WHERE oid = v_owner_oid;

    IF v_owner_name IN ('anon', 'authenticated', 'service_role') THEN
      RAISE EXCEPTION
        'Base-table RLS migration aborted: public.% has unsafe owner "%".',
        v_table,
        v_owner_name
        USING ERRCODE = '42501';
    END IF;

    IF v_expected_owner_oid IS NULL THEN
      v_expected_owner_oid := v_owner_oid;
    ELSIF v_owner_oid IS DISTINCT FROM v_expected_owner_oid THEN
      RAISE EXCEPTION
        'Base-table RLS migration aborted: inconsistent table ownership detected on public.% (owner "%").',
        v_table,
        v_owner_name
        USING HINT = 'Ensure all five public.anagu_* tables share the same privileged owner (e.g., postgres) before hardening.';
    END IF;
  END LOOP;

  -- 1c. Inspect for pre-existing RLS policies on the five target tables.
  --     Do NOT silently drop policies; stop and require explicit operator review
  --     so no legitimate policy is removed unexpectedly and no permissive policy lingers.
  SELECT string_agg(format('%s.%s (%s)', tablename, policyname, cmd), ', ' ORDER BY tablename, policyname)
  INTO v_existing_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY(v_target_tables);

  IF v_existing_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Base-table RLS migration aborted before making changes: pre-existing RLS policies detected on target tables: %.',
      v_existing_policies
      USING
        ERRCODE = '0A000',
        HINT = 'Inspect these policies in pg_policies and explicitly drop any unintended/permissive policies before re-running migration 002.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Enable Default-Deny Row-Level Security on All Five Base Tables
--    (Zero policies are created for anon/authenticated; Express backend uses
--     owner / service_role which bypasses RLS on the server side only.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.anagu_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anagu_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anagu_oracle_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anagu_mqtt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anagu_inquiries ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. Revoke Direct Table Privileges & Unnecessary Schema CREATE from PUBLIC
-- ----------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

REVOKE ALL ON TABLE public.anagu_users FROM PUBLIC;
REVOKE ALL ON TABLE public.anagu_admins FROM PUBLIC;
REVOKE ALL ON TABLE public.anagu_oracle_attestations FROM PUBLIC;
REVOKE ALL ON TABLE public.anagu_mqtt_events FROM PUBLIC;
REVOKE ALL ON TABLE public.anagu_inquiries FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 4. Role-Specific Revocations (anon, authenticated) and Least-Privilege
--    Backend Grants (service_role)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- 4a. Anonymous Supabase API clients: ZERO access to all five tables & no CREATE on public
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE CREATE ON SCHEMA public FROM anon;
    REVOKE ALL ON TABLE public.anagu_users FROM anon;
    REVOKE ALL ON TABLE public.anagu_admins FROM anon;
    REVOKE ALL ON TABLE public.anagu_oracle_attestations FROM anon;
    REVOKE ALL ON TABLE public.anagu_mqtt_events FROM anon;
    REVOKE ALL ON TABLE public.anagu_inquiries FROM anon;
  END IF;

  -- 4b. Direct authenticated Supabase JWT clients: ZERO access to all five tables & no CREATE on public
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE CREATE ON SCHEMA public FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_users FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_admins FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_oracle_attestations FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_mqtt_events FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_inquiries FROM authenticated;
  END IF;

  -- 4c. Server-side Express backend (`service_role`): exact least-privilege DML only
  --     First revoke all privileges on the five tables so any legacy excess grants
  --     (e.g., TRUNCATE, REFERENCES, TRIGGER, or unused UPDATE/DELETE) are removed,
  --     then re-grant ONLY the operations required by `server/db.ts`.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    REVOKE CREATE ON SCHEMA public FROM service_role;

    REVOKE ALL ON TABLE public.anagu_users FROM service_role;
    REVOKE ALL ON TABLE public.anagu_admins FROM service_role;
    REVOKE ALL ON TABLE public.anagu_oracle_attestations FROM service_role;
    REVOKE ALL ON TABLE public.anagu_mqtt_events FROM service_role;
    REVOKE ALL ON TABLE public.anagu_inquiries FROM service_role;

    -- 1. public.anagu_users:
    --    SELECT (loginUser, getUserById live role check, signupUser email check, listUsers, loginDemoRole)
    --    INSERT (signupUser — forces citizen role server-side)
    --    UPDATE (updateUserRole — admin role approval/demotion)
    --    DELETE (deleteUser — admin user removal)
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.anagu_users TO service_role;

    -- 2. public.anagu_admins:
    --    SELECT (loginAdmin, listAdmins for /api/admin/auth/me & /api/admin/overview, signupAdmin duplicate check)
    --    INSERT (signupAdmin — invite-code or existing-admin gated onboarding)
    --    UPDATE / DELETE intentionally omitted (not used by server/db.ts; prevents unauthorized credential mutation/deletion)
    GRANT SELECT, INSERT ON TABLE public.anagu_admins TO service_role;

    -- 3. public.anagu_oracle_attestations:
    --    INSERT (recordOracleAttestation — customary ownership verification evidence)
    --    SELECT (audit / verification inspection without permitting tampering)
    --    UPDATE / DELETE intentionally omitted (append-only evidence ledger; parcel ON DELETE CASCADE runs as table owner)
    GRANT SELECT, INSERT ON TABLE public.anagu_oracle_attestations TO service_role;

    -- 4. public.anagu_mqtt_events:
    --    SELECT (listMqttMessages — /api/mqtt & /api/admin/overview)
    --    INSERT (createMqttMessage — supports ON CONFLICT (id) DO NOTHING RETURNING *)
    --    UPDATE / DELETE intentionally omitted (append-only telemetry audit log)
    GRANT SELECT, INSERT ON TABLE public.anagu_mqtt_events TO service_role;

    -- 5. public.anagu_inquiries:
    --    SELECT (listInquiries — /api/admin/overview)
    --    INSERT (createInquiry — POST /api/inquiries)
    --    DELETE (deleteInquiry — DELETE /api/admin/inquiries/:id)
    --    UPDATE intentionally omitted (inquiries are immutable once submitted)
    GRANT SELECT, INSERT, DELETE ON TABLE public.anagu_inquiries TO service_role;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Post-Hardening Verification Guard (runs inside the same transaction)
--    Aborts and rolls back if any expected RLS flag or privilege boundary failed.
-- ----------------------------------------------------------------------------
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
BEGIN
  FOREACH v_table IN ARRAY v_target_tables LOOP
    v_full_name := 'public.' || v_table;

    SELECT c.relrowsecurity
    INTO v_rls_enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table;

    IF v_rls_enabled IS NOT TRUE THEN
      RAISE EXCEPTION 'Post-check failed: RLS is not enabled on %.', v_full_name;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      IF pg_catalog.has_table_privilege('anon', v_full_name, 'SELECT')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'INSERT')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'UPDATE')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'DELETE')
         OR pg_catalog.has_table_privilege('anon', v_full_name, 'TRUNCATE') THEN
        RAISE EXCEPTION 'Post-check failed: role "anon" still holds direct privileges on %.', v_full_name;
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      IF pg_catalog.has_table_privilege('authenticated', v_full_name, 'SELECT')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'INSERT')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'UPDATE')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'DELETE')
         OR pg_catalog.has_table_privilege('authenticated', v_full_name, 'TRUNCATE') THEN
        RAISE EXCEPTION 'Post-check failed: role "authenticated" still holds direct privileges on %.', v_full_name;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    IF pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_oracle_attestations', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_mqtt_events', 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_inquiries', 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_users', 'TRUNCATE')
       OR pg_catalog.has_table_privilege('service_role', 'public.anagu_admins', 'TRUNCATE') THEN
      RAISE EXCEPTION 'Post-check failed: role "service_role" holds unexpected excess privileges.';
    END IF;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Reload Supabase PostgREST Schema & Privilege Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
