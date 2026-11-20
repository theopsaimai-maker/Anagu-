-- ============================================================================
-- ANAGU PHASE 2.2.8 — ROLLBACK-SAFE POSTGRESQL/POSTGIS INTEGRATION TEST SUITE
-- File: supabase/tests/001_postgis_spatial_integration.sql
-- ============================================================================
-- USAGE:
--   Run manually in Supabase SQL Editor or `psql` AFTER applying
--   `supabase/migrations/001_postgis_spatial.sql`.
--   The entire script runs inside a single transaction ending in ROLLBACK, so
--   no test rows persist and no live parcel records are modified or deleted.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_postgis_schema TEXT;
  v_postgis_version TEXT;
  v_postgis_major INTEGER;
  v_postgis_minor INTEGER;
  v_id_type TEXT;
  v_parcel_count_before BIGINT;
  v_parcel_count_after BIGINT;
  v_grant_count BIGINT;
  v_row RECORD;
  v_res JSONB;
  v_adj_row RECORD;
  v_ov_row RECORD;
  v_caught_23514 BOOLEAN;

  v_id_legacy TEXT := 'PAR-PG-TEST-LEGACY-001';
  v_id_forged TEXT := 'PAR-PG-TEST-FORGED-002';
  v_id_adj_a  TEXT := 'PAR-PG-TEST-ADJ-A-003';
  v_id_adj_b  TEXT := 'PAR-PG-TEST-ADJ-B-004';
  v_id_ov     TEXT := 'PAR-PG-TEST-OV-005';
  v_id_final  TEXT := 'PAR-PG-TEST-FINAL-006';

  v_paris_coords JSONB := '[[48.8566, 2.3522], [48.8576, 2.3532], [48.8566, 2.3542]]'::jsonb;
  v_adj_a_coords JSONB := '[[9.2000, 7.5000], [9.2010, 7.5000], [9.2010, 7.5010], [9.2000, 7.5010]]'::jsonb;
  v_adj_b_coords JSONB := '[[9.2000, 7.5010], [9.2010, 7.5010], [9.2010, 7.5020], [9.2000, 7.5020]]'::jsonb;
  v_ov_coords    JSONB := '[[9.2005, 7.5005], [9.2015, 7.5005], [9.2015, 7.5015], [9.2005, 7.5015]]'::jsonb;
  v_shifted_coords JSONB := '[[9.2500, 7.5500], [9.2510, 7.5500], [9.2510, 7.5510], [9.2500, 7.5510]]'::jsonb;
BEGIN
  -- --------------------------------------------------------------------------
  -- TEST 1: Extension schema (public), version (3.3.7 / 3.x), parcel ID type, RLS & privileges
  -- --------------------------------------------------------------------------
  SELECT n.nspname, e.extversion
  INTO v_postgis_schema, v_postgis_version
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_postgis_schema <> 'public' THEN
    RAISE EXCEPTION 'FAIL [Test 1]: Expected postgis in schema "public", found "%".', v_postgis_schema;
  END IF;

  v_postgis_major := NULLIF(pg_catalog.split_part(v_postgis_version, '.', 1), '')::INTEGER;
  v_postgis_minor := NULLIF(pg_catalog.split_part(v_postgis_version, '.', 2), '')::INTEGER;
  IF v_postgis_major IS NULL OR v_postgis_major < 3 OR (v_postgis_major = 3 AND COALESCE(v_postgis_minor, 0) < 3) THEN
    RAISE EXCEPTION 'FAIL [Test 1]: Expected PostGIS 3.3.7 or compatible >= 3.3, found "%".', v_postgis_version;
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) INTO v_id_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'anagu_parcels' AND a.attname = 'id';

  IF v_id_type <> 'text' THEN
    RAISE EXCEPTION 'FAIL [Test 1]: Expected public.anagu_parcels.id to be text, found "%".', v_id_type;
  END IF;

  -- Confirm anon/authenticated have ZERO access to table, private schema, public CREATE, and RPCs
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    IF pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
       OR pg_catalog.has_table_privilege('anon', 'public.anagu_parcels', 'SELECT')
       OR pg_catalog.has_schema_privilege('anon', 'anagu_internal', 'USAGE')
       OR pg_catalog.has_function_privilege('anon', 'public.anagu_verify_parcel_spatial(text, double precision, boolean, boolean)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL [Test 1]: Role "anon" retains unauthorized privileges.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    IF pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.anagu_parcels', 'SELECT')
       OR pg_catalog.has_schema_privilege('authenticated', 'anagu_internal', 'USAGE')
       OR pg_catalog.has_function_privilege('authenticated', 'public.anagu_verify_parcel_spatial(text, double precision, boolean, boolean)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL [Test 1]: Role "authenticated" retains unauthorized privileges.';
    END IF;
  END IF;

  -- Confirm service_role has table/RPC access but ZERO CREATE on public, anagu_internal, or trigger function
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    IF pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE')
       OR NOT pg_catalog.has_table_privilege('service_role', 'public.anagu_parcels', 'SELECT')
       OR NOT pg_catalog.has_function_privilege('service_role', 'public.anagu_verify_parcel_spatial(text, double precision, boolean, boolean)', 'EXECUTE')
       OR pg_catalog.has_schema_privilege('service_role', 'anagu_internal', 'USAGE')
       OR pg_catalog.has_table_privilege('service_role', 'anagu_internal.spatial_audit_write_grants', 'INSERT')
       OR pg_catalog.has_function_privilege('service_role', 'public.trg_fn_anagu_sync_parcel_geom()', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL [Test 1]: Role "service_role" privileges do not match least-privilege contract.';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_parcel_count_before FROM public.anagu_parcels;

  -- --------------------------------------------------------------------------
  -- TEST 2: Legacy non-Nigeria (Paris) parcel preservation & valid geom sync
  -- --------------------------------------------------------------------------
  INSERT INTO public.anagu_parcels (
    id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
    area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
    survey_plan_ref, intended_use, status
  ) VALUES (
    v_id_legacy, 'TEST/PARIS/2026-001', 'Legacy Paris Record', 'NIN-0001',
    'Federal Capital Territory', 'AMAC', 'Legacy Test',
    500.0, 90.0, v_paris_coords, '[]'::jsonb, '0x01', '0x02', 'SP-LEGACY-1', 'Residential', 'registered'
  );

  SELECT * INTO v_row FROM public.anagu_parcels WHERE id = v_id_legacy;
  IF v_row.coordinates IS DISTINCT FROM v_paris_coords
     OR v_row.status <> 'registered'
     OR v_row.geom IS NULL
     OR public.ST_SRID(v_row.geom) <> 4326
     OR v_row.spatial_valid IS NOT TRUE
     OR v_row.postgis_area_sqm IS NULL THEN
    RAISE EXCEPTION 'FAIL [Test 2]: Legacy Paris parcel was not preserved or derived properly.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 3: Forged INSERT spatial verification fields & forged geom rejected/stripped
  -- --------------------------------------------------------------------------
  INSERT INTO public.anagu_parcels (
    id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
    area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
    survey_plan_ref, intended_use, status,
    geom, spatial_verified_at, spatial_buffer_m, spatial_conflicts
  ) VALUES (
    v_id_forged, 'TEST/FORGED/2026-002', 'Forged Audit Test', 'NIN-0002',
    'Federal Capital Territory', 'AMAC', 'Forged Test',
    1000.0, 120.0, v_adj_a_coords, '[]'::jsonb, '0x03', '0x04', 'SP-FORGED-2', 'Residential', 'draft',
    public.ST_GeomFromText('POLYGON((0 0,0 1,1 1,1 0,0 0))', 4326),
    NOW(), 0.1, '[{"forged":true}]'::jsonb
  );

  SELECT * INTO v_row FROM public.anagu_parcels WHERE id = v_id_forged;
  IF v_row.spatial_verified_at IS NOT NULL
     OR v_row.spatial_buffer_m IS NOT NULL
     OR v_row.spatial_conflicts <> '[]'::jsonb
     OR public.ST_AsEWKB(v_row.geom) IS DISTINCT FROM public.ST_AsEWKB(public.anagu_coords_jsonb_to_polygon(v_adj_a_coords)) THEN
    RAISE EXCEPTION 'FAIL [Test 3]: Forged INSERT geometry or spatial audit fields were not overwritten/cleared.';
  END IF;

  -- Clean up forged row before adjacency test on same coordinates
  DELETE FROM public.anagu_parcels WHERE id = v_id_forged;

  -- --------------------------------------------------------------------------
  -- TEST 4: Adjacent shared-edge parcels vs. true interior overlap
  -- --------------------------------------------------------------------------
  INSERT INTO public.anagu_parcels (
    id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
    area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
    survey_plan_ref, intended_use, status
  ) VALUES
    (v_id_adj_a, 'TEST/ADJ/A', 'Neighbor A', 'NIN-0003', 'FCT', 'AMAC', 'Sector A',
     12000.0, 440.0, v_adj_a_coords, '[]'::jsonb, '0x05', '0x06', 'SP-ADJ-A', 'Residential', 'draft'),
    (v_id_adj_b, 'TEST/ADJ/B', 'Neighbor B', 'NIN-0004', 'FCT', 'AMAC', 'Sector B',
     12000.0, 440.0, v_adj_b_coords, '[]'::jsonb, '0x07', '0x08', 'SP-ADJ-B', 'Residential', 'registered');

  SELECT * INTO v_adj_row
  FROM public.anagu_check_parcel_overlaps(v_id_adj_a, 0.5, 0.01)
  WHERE conflict_parcel_id = v_id_adj_b;

  IF NOT FOUND
     OR v_adj_row.is_boundary_contact IS NOT TRUE
     OR v_adj_row.is_true_overlap IS TRUE
     OR v_adj_row.overlap_area_sqm <> 0 THEN
    RAISE EXCEPTION 'FAIL [Test 4a]: Shared-edge adjacent parcel misclassified (row=%).', v_adj_row;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 5: Successful RPC persistence in same transaction + single-use grant cleanup
  -- --------------------------------------------------------------------------
  v_res := public.anagu_verify_parcel_spatial(v_id_adj_a, 0.5, FALSE, TRUE);
  IF (v_res->>'passed')::BOOLEAN IS NOT TRUE
     OR (v_res->>'persisted')::BOOLEAN IS NOT TRUE
     OR (v_res->>'persistenceRefused')::BOOLEAN IS TRUE
     OR (v_res->>'status') <> 'spatial_verified' THEN
    RAISE EXCEPTION 'FAIL [Test 5]: Legitimate RPC persistence failed: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_grant_count
  FROM anagu_internal.spatial_audit_write_grants
  WHERE txid = pg_catalog.txid_current();
  IF v_grant_count <> 0 THEN
    RAISE EXCEPTION 'FAIL [Test 5]: Expected 0 lingering grant rows after RPC persistence, found %.', v_grant_count;
  END IF;

  -- Insert overlapping parcel and verify RPC blocks persistence
  INSERT INTO public.anagu_parcels (
    id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
    area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
    survey_plan_ref, intended_use, status
  ) VALUES (
    v_id_ov, 'TEST/OV/005', 'Overlapping Claimant', 'NIN-0005', 'FCT', 'AMAC', 'Overlap Zone',
    12000.0, 440.0, v_ov_coords, '[]'::jsonb, '0x09', '0x0a', 'SP-OV-5', 'Residential', 'draft'
  );

  SELECT * INTO v_ov_row
  FROM public.anagu_check_parcel_overlaps(v_id_ov, 0.5, 0.01)
  WHERE conflict_parcel_id = v_id_adj_a;

  IF NOT FOUND OR v_ov_row.is_true_overlap IS NOT TRUE OR v_ov_row.overlap_area_sqm <= 0 THEN
    RAISE EXCEPTION 'FAIL [Test 4b]: Interior overlapping parcel was not detected as true_overlap.';
  END IF;

  v_res := public.anagu_verify_parcel_spatial(v_id_ov, 0.5, FALSE, TRUE);
  IF (v_res->>'passed')::BOOLEAN IS TRUE OR (v_res->>'persisted')::BOOLEAN IS TRUE THEN
    RAISE EXCEPTION 'FAIL [Test 4b]: Overlapping parcel must not pass or persist: %', v_res;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 6: Editable coordinate change resets status to draft & clears audit fields
  --         (including blocking combined coordinate change + status='registered')
  -- --------------------------------------------------------------------------
  UPDATE public.anagu_parcels
  SET coordinates = v_shifted_coords, status = 'registered'
  WHERE id = v_id_adj_a;

  SELECT * INTO v_row FROM public.anagu_parcels WHERE id = v_id_adj_a;
  IF v_row.status <> 'draft'
     OR v_row.spatial_verified_at IS NOT NULL
     OR v_row.spatial_buffer_m IS NOT NULL
     OR v_row.spatial_conflicts <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL [Test 6]: Editable coordinate change did not force status=draft and clear audit fields.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 7: Refused RPC persistence on finalized parcel + grant cleanup
  -- --------------------------------------------------------------------------
  INSERT INTO public.anagu_parcels (
    id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
    area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
    survey_plan_ref, intended_use, status
  ) VALUES (
    v_id_final, 'TEST/FINAL/006', 'Finalized Owner', 'NIN-0006', 'FCT', 'AMAC', 'Final Zone',
    12000.0, 440.0, '[[9.3000, 7.6000], [9.3010, 7.6000], [9.3010, 7.6010], [9.3000, 7.6010]]'::jsonb,
    '[]'::jsonb, '0x0b', '0x0c', 'SP-FINAL-6', 'Residential', 'registered'
  );

  v_res := public.anagu_verify_parcel_spatial(v_id_final, 0.5, FALSE, TRUE);
  IF (v_res->>'persisted')::BOOLEAN IS TRUE
     OR (v_res->>'persistenceRefused')::BOOLEAN IS NOT TRUE
     OR (v_res->>'status') <> 'registered' THEN
    RAISE EXCEPTION 'FAIL [Test 7]: Finalized parcel persistence was not refused cleanly: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_grant_count
  FROM anagu_internal.spatial_audit_write_grants
  WHERE txid = pg_catalog.txid_current();
  IF v_grant_count <> 0 THEN
    RAISE EXCEPTION 'FAIL [Test 7]: Expected 0 lingering grant rows after refused persistence, found %.', v_grant_count;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 8: Finalized-record coordinate & geometry immutability (ERRCODE 23514)
  -- --------------------------------------------------------------------------
  v_caught_23514 := FALSE;
  BEGIN
    UPDATE public.anagu_parcels SET coordinates = v_shifted_coords WHERE id = v_id_final;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_caught_23514 := TRUE;
  END;
  IF NOT v_caught_23514 THEN
    RAISE EXCEPTION 'FAIL [Test 8a]: Coordinate edit on finalized parcel was NOT rejected with 23514.';
  END IF;

  v_caught_23514 := FALSE;
  BEGIN
    UPDATE public.anagu_parcels
    SET geom = public.anagu_coords_jsonb_to_polygon(v_shifted_coords)
    WHERE id = v_id_final;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_caught_23514 := TRUE;
  END;
  IF NOT v_caught_23514 THEN
    RAISE EXCEPTION 'FAIL [Test 8b]: Direct geom tamper on finalized parcel was NOT rejected with 23514.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 9: Direct spatial audit column tampering rejected even with spoofed GUC
  -- --------------------------------------------------------------------------
  PERFORM pg_catalog.set_config('anagu.allow_spatial_audit_write', 'on', TRUE);

  v_caught_23514 := FALSE;
  BEGIN
    UPDATE public.anagu_parcels
    SET spatial_valid = TRUE, spatial_verified_at = NOW()
    WHERE id = v_id_adj_a;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_caught_23514 := TRUE;
  END;
  IF NOT v_caught_23514 THEN
    RAISE EXCEPTION 'FAIL [Test 9]: Direct spatial audit tamper (with spoofed custom GUC) was NOT rejected with 23514.';
  END IF;

  -- Clean up temporary rows and confirm live parcel count unchanged
  DELETE FROM public.anagu_parcels
  WHERE id IN (v_id_legacy, v_id_adj_a, v_id_adj_b, v_id_ov, v_id_final);

  SELECT COUNT(*) INTO v_parcel_count_after FROM public.anagu_parcels;
  IF v_parcel_count_after <> v_parcel_count_before THEN
    RAISE EXCEPTION 'FAIL [Cleanup]: Parcel count mismatch (% vs %).', v_parcel_count_before, v_parcel_count_after;
  END IF;

  RAISE NOTICE 'PASS: All ANAGU Phase 2.2.8 PostGIS integration tests passed (transaction will now ROLLBACK).';
END;
$$;

ROLLBACK;
