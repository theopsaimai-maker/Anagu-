-- ============================================================================
-- ANAGU LAND ADMINISTRATION PLATFORM — PHASE 2.2 POSTGIS SPATIAL MIGRATION
-- File: supabase/migrations/001_postgis_spatial.sql
-- ============================================================================
-- SAFETY & DESIGN NOTES:
--   1. Non-destructive and idempotent: preserves all existing rows in
--      public.anagu_parcels and keeps the original JSONB `coordinates` column.
--   2. No Nigeria bounding-box CHECK constraint and no EXCLUDE overlap
--      constraint are added, so legacy/out-of-Nigeria or overlapping records
--      (such as existing live test parcels with Paris coordinates) remain intact.
--   3. Storage CRS: EPSG:4326 (WGS 84 Geographic) for nationwide compatibility
--      across Nigeria's three UTM zones (31N / 32N / 33N) and Leaflet/OSM.
--   4. Metric calculations (area in m², perimeter in m, buffer distances in m)
--      use PostGIS `geography` (WGS 84 spheroid) to avoid UTM zone-boundary
--      distortion nationwide.
--   5. Existing `coordinates` JSONB arrays store unclosed `[lat, lng]` pairs.
--      The conversion function swaps each vertex to PostGIS `(lng, lat)` order
--      and automatically closes open polygon rings before calling ST_MakePolygon.
--   6. RPC functions are restricted to `service_role` (and database owner) so
--      anonymous (`anon`) and direct `authenticated` Supabase clients cannot
--      invoke spatial verification functions directly.
-- ============================================================================

-- 1. Pre-flight compatibility checks for existing PostGIS installation in `public` schema
--    - Do NOT reinstall, relocate, drop, or upgrade PostGIS.
--    - Confirm PostGIS (version 3.x, e.g. 3.3.7) is already installed in schema `public`
--      and required types/GiST operator classes are present BEFORE running any DDL.
--    - Confirm `public.anagu_parcels.id` exists and has a `text`-compatible type so
--      the private grant table and all RPC signatures match the live table without guessing.
DO $$
DECLARE
  v_postgis_schema TEXT;
  v_postgis_version TEXT;
  v_postgis_major INTEGER;
  v_parcel_id_type TEXT;
BEGIN
  SELECT n.nspname, e.extversion
  INTO v_postgis_schema, v_postgis_version
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_postgis_schema IS NULL THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: extension "postgis" is not installed.'
      USING
        ERRCODE = '0A000',
        HINT = 'Enable PostGIS 3.x in schema "public" before running supabase/migrations/001_postgis_spatial.sql.';
  ELSIF v_postgis_schema <> 'public' THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: extension "postgis" (version %) is installed in schema "%", but this migration targets the existing PostGIS installation in schema "public".',
      v_postgis_version,
      v_postgis_schema
      USING
        ERRCODE = '0A000',
        HINT = 'Do not relocate PostGIS automatically; verify the target database schema before executing.';
  END IF;

  v_postgis_major := NULLIF(pg_catalog.split_part(v_postgis_version, '.', 1), '')::INTEGER;
  IF v_postgis_major IS NULL OR v_postgis_major < 3 THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: PostGIS version "%" is unsupported (requires 3.x, e.g. 3.3.7).',
      v_postgis_version
      USING ERRCODE = '0A000';
  END IF;

  IF to_regtype('public.geometry') IS NULL OR to_regtype('public.geography') IS NULL THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: required types public.geometry / public.geography were not found.'
      USING ERRCODE = '42704';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_opclass oc
    JOIN pg_catalog.pg_namespace n ON n.oid = oc.opcnamespace
    WHERE n.nspname = 'public' AND oc.opcname = 'gist_geometry_ops_2d'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_opclass oc
    JOIN pg_catalog.pg_namespace n ON n.oid = oc.opcnamespace
    WHERE n.nspname = 'public' AND oc.opcname = 'gist_geography_ops'
  ) THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: required GiST operator classes public.gist_geometry_ops_2d / public.gist_geography_ops were not found.'
      USING ERRCODE = '42704';
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
  INTO v_parcel_id_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'anagu_parcels'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_parcel_id_type IS NULL THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: public.anagu_parcels(id) does not exist.'
      USING
        ERRCODE = '42P01',
        HINT = 'Apply supabase/schema.sql before running supabase/migrations/001_postgis_spatial.sql.';
  ELSIF v_parcel_id_type NOT IN ('text', 'character varying') THEN
    RAISE EXCEPTION
      'PostGIS migration aborted before making changes: public.anagu_parcels.id has type "%", expected "text".',
      v_parcel_id_type
      USING
        ERRCODE = '42804',
        HINT = 'Update anagu_internal.spatial_audit_write_grants.parcel_id and spatial RPC parameter types to match public.anagu_parcels.id before running.';
  END IF;
END;
$$;

-- 1b. Private owner-only schema & single-use transaction grant table for spatial audit writes.
--     No custom PostgreSQL GUC (`set_config`) is used because custom GUCs are user-settable by
--     ordinary sessions. Only SECURITY DEFINER owner functions (`anagu_verify_parcel_spatial`
--     and `trg_fn_anagu_sync_parcel_geom`) can access `anagu_internal.spatial_audit_write_grants`;
--     PUBLIC, anon, authenticated, and service_role receive ZERO privileges on this schema/table.
CREATE SCHEMA IF NOT EXISTS anagu_internal;
REVOKE ALL ON SCHEMA anagu_internal FROM PUBLIC;

CREATE TABLE IF NOT EXISTS anagu_internal.spatial_audit_write_grants (
  txid BIGINT NOT NULL,
  parcel_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (txid, parcel_id)
);
REVOKE ALL ON TABLE anagu_internal.spatial_audit_write_grants FROM PUBLIC;
ALTER TABLE anagu_internal.spatial_audit_write_grants ENABLE ROW LEVEL SECURITY;

-- 2. Add nullable PostGIS geometry & spatial audit columns to public.anagu_parcels
ALTER TABLE public.anagu_parcels
  ADD COLUMN IF NOT EXISTS geom public.geometry(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS geom_srid INTEGER NOT NULL DEFAULT 4326,
  ADD COLUMN IF NOT EXISTS postgis_area_sqm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS postgis_perimeter_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS spatial_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS spatial_valid_reason TEXT,
  ADD COLUMN IF NOT EXISTS spatial_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spatial_buffer_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS spatial_conflicts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.anagu_parcels.geom IS
  'Canonical WGS 84 (EPSG:4326) parcel boundary polygon derived from coordinates JSONB ([lat, lng] -> (lng, lat), auto-closed ring).';
COMMENT ON COLUMN public.anagu_parcels.spatial_buffer_m IS
  'Configured buffer tolerance in meters (WGS 84 geography) used during the latest spatial verification.';

-- 3. Spatial GiST Indexes (explicitly qualified operator classes — no session search_path required)
-- General GiST index on geometry(Polygon, 4326)
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_geom_gist
  ON public.anagu_parcels
  USING GIST (geom public.gist_geometry_ops_2d);

-- Partial GiST index on WGS 84 geography for active cadastral overlap / buffer scans
-- (excludes revoked and rejected parcels from active conflict checks)
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_active_geog_gist
  ON public.anagu_parcels
  USING GIST ((geom::public.geography) public.gist_geography_ops)
  WHERE geom IS NOT NULL AND status NOT IN ('revoked', 'rejected');

-- 4. Safe Coordinate Conversion Function: JSONB [[lat, lng], ...] -> geometry(Polygon, 4326)
--    - Accepts existing `[latitude, longitude]` JSONB arrays (or `{"lat":..,"lng":..}` objects).
--    - Swaps coordinates to PostGIS `(longitude, latitude)` = `(X, Y)` order.
--    - Automatically closes unclosed polygon rings by appending the first vertex.
--    - Normalizes valid polygon rings to counter-clockwise orientation via ST_ForcePolygonCCW().
--    - Never rejects out-of-Nigeria coordinates (only checks global WGS 84 bounds).
--    - Returns NULL on malformed input instead of failing an INSERT/UPDATE/backfill.
CREATE OR REPLACE FUNCTION public.anagu_coords_jsonb_to_polygon(p_coords JSONB)
RETURNS public.geometry(Polygon, 4326)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_elem JSONB;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_first_lat DOUBLE PRECISION;
  v_first_lng DOUBLE PRECISION;
  v_last_lat DOUBLE PRECISION;
  v_last_lng DOUBLE PRECISION;
  v_points public.geometry[] := ARRAY[]::public.geometry[];
  v_ring public.geometry;
  v_poly public.geometry;
BEGIN
  IF p_coords IS NULL OR jsonb_typeof(p_coords) <> 'array' OR jsonb_array_length(p_coords) < 3 THEN
    RETURN NULL;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_coords)
  LOOP
    IF jsonb_typeof(v_elem) = 'array' AND jsonb_array_length(v_elem) >= 2 THEN
      v_lat := NULLIF(v_elem->>0, '')::DOUBLE PRECISION;
      v_lng := NULLIF(v_elem->>1, '')::DOUBLE PRECISION;
    ELSIF jsonb_typeof(v_elem) = 'object' AND (v_elem ? 'lat') AND (v_elem ? 'lng') THEN
      v_lat := NULLIF(v_elem->>'lat', '')::DOUBLE PRECISION;
      v_lng := NULLIF(v_elem->>'lng', '')::DOUBLE PRECISION;
    ELSE
      RETURN NULL;
    END IF;

    -- Global WGS 84 sanity check only (preserves any existing non-Nigeria records)
    IF v_lat IS NULL OR v_lng IS NULL
       OR v_lat < -90 OR v_lat > 90
       OR v_lng < -180 OR v_lng > 180 THEN
      RETURN NULL;
    END IF;

    -- Skip consecutive identical duplicate vertices
    IF array_length(v_points, 1) IS NOT NULL
       AND v_lat = v_last_lat
       AND v_lng = v_last_lng THEN
      CONTINUE;
    END IF;

    IF array_length(v_points, 1) IS NULL THEN
      v_first_lat := v_lat;
      v_first_lng := v_lng;
    END IF;

    v_last_lat := v_lat;
    v_last_lng := v_lng;

    -- PostGIS expects (X = longitude, Y = latitude)
    v_points := array_append(v_points, public.ST_SetSRID(public.ST_MakePoint(v_lng, v_lat), 4326));
  END LOOP;

  -- Need at least 3 distinct vertices to form a polygon
  IF array_length(v_points, 1) IS NULL OR array_length(v_points, 1) < 3 THEN
    RETURN NULL;
  END IF;

  -- Automatically close open linear rings so ST_MakePolygon succeeds
  IF v_last_lat <> v_first_lat OR v_last_lng <> v_first_lng THEN
    v_points := array_append(v_points, public.ST_SetSRID(public.ST_MakePoint(v_first_lng, v_first_lat), 4326));
  END IF;

  -- A closed linear ring requires at least 4 points (3 distinct vertices + closing vertex)
  IF array_length(v_points, 1) < 4 THEN
    RETURN NULL;
  END IF;

  v_ring := public.ST_MakeLine(v_points);
  v_poly := public.ST_SetSRID(public.ST_MakePolygon(v_ring), 4326);
  IF public.ST_IsValid(v_poly) THEN
    v_poly := public.ST_ForcePolygonCCW(v_poly);
  END IF;
  RETURN v_poly;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 5. Automatic Geometry Sync, Stale-Verification Invalidation & Finalized Immutability Trigger
--    - Coordinates JSONB is the single authoritative source for parcel geometry; arbitrary
--      caller-supplied NEW.geom is NEVER accepted as authoritative on INSERT or UPDATE.
--    - Runs as SECURITY DEFINER with a hardened search_path so internal calls to
--      public.anagu_coords_jsonb_to_polygon() always succeed for authorized table
--      writers without granting PUBLIC execution on helper or RPC functions.
--    - Bound to BEFORE INSERT OR UPDATE OF coordinates, geom, and spatial audit columns so
--      unrelated status/title updates never fire this trigger or invalidate spatial verification,
--      while direct tampering on spatial audit columns is blocked unless authorized by a
--      single-use transaction grant from `public.anagu_verify_parcel_spatial()`.
--    - Finalized lifecycle statuses ('oracle_verified', 'legal_approved', 'registered',
--      'revoked', 'rejected') are strictly protected at the database level: any attempt
--      to alter coordinates or supply/mutate a mismatched geom raises a check_violation
--      (23514) exception instead of silently modifying geometry or downgrading status.
--    - Uses exact EWKB comparison (public.ST_AsEWKB) rather than PostGIS `=`
--      (which only compares 2D bounding boxes) to detect any vertex/ring tampering.
--    - Identical-coordinate no-op updates with bit-for-bit unchanged existing geometry
--      (OLD.geom IS NOT NULL) preserve prior spatial verification intact.
--    - One-time NULL-to-geometry backfill (OLD.geom IS NULL) always derives geometry and
--      audit fields from authoritative NEW.coordinates via public.anagu_coords_jsonb_to_polygon(),
--      preserving existing lifecycle status while rejecting mismatched forged geometry on
--      finalized records.
--    - Actual coordinate mutations on eligible 'draft' or 'spatial_verified' parcels
--      recalculate geom/validity/area/perimeter, clear stale spatial_verified_at,
--      spatial_buffer_m, and spatial_conflicts, and unconditionally force NEW.status
--      to 'draft' so modified geometry can neither retain 'spatial_verified' nor
--      simultaneously advance to a later lifecycle state without fresh verification.
CREATE OR REPLACE FUNCTION public.trg_fn_anagu_sync_parcel_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_geom public.geometry(Polygon, 4326);
  v_valid BOOLEAN;
  v_geom_computed BOOLEAN := FALSE;
  v_has_audit_grant BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.coordinates IS DISTINCT FROM OLD.coordinates THEN
      -- Enforce database-level immutability for finalized / non-editable parcel lifecycle states
      IF OLD.status IN ('oracle_verified', 'legal_approved', 'registered', 'revoked', 'rejected')
         OR OLD.status NOT IN ('draft', 'spatial_verified') THEN
        RAISE EXCEPTION
          'Coordinate modification rejected: parcel "%" is in finalized lifecycle state "%" and its coordinates/geometry are immutable.',
          OLD.id,
          OLD.status
          USING
            ERRCODE = '23514',
            HINT = 'Only parcels in "draft" or "spatial_verified" status may have their coordinates modified.';
      END IF;
    ELSE
      -- Coordinates are unchanged (NEW.coordinates IS NOT DISTINCT FROM OLD.coordinates)
      IF OLD.geom IS NOT NULL THEN
        IF public.ST_AsEWKB(NEW.geom) IS NOT DISTINCT FROM public.ST_AsEWKB(OLD.geom) THEN
          -- Check if any spatial audit column is being modified directly
          IF NEW.geom_srid IS DISTINCT FROM OLD.geom_srid
             OR NEW.postgis_area_sqm IS DISTINCT FROM OLD.postgis_area_sqm
             OR NEW.postgis_perimeter_m IS DISTINCT FROM OLD.postgis_perimeter_m
             OR NEW.spatial_valid IS DISTINCT FROM OLD.spatial_valid
             OR NEW.spatial_valid_reason IS DISTINCT FROM OLD.spatial_valid_reason
             OR NEW.spatial_verified_at IS DISTINCT FROM OLD.spatial_verified_at
             OR NEW.spatial_buffer_m IS DISTINCT FROM OLD.spatial_buffer_m
             OR NEW.spatial_conflicts IS DISTINCT FROM OLD.spatial_conflicts THEN
            -- Atomically consume the single-use, transaction- and parcel-scoped grant issued
            -- exclusively by owner-owned SECURITY DEFINER `public.anagu_verify_parcel_spatial()`.
            DELETE FROM anagu_internal.spatial_audit_write_grants
            WHERE txid = pg_catalog.txid_current()
              AND parcel_id = OLD.id;
            IF FOUND THEN
              RETURN NEW;
            END IF;

            RAISE EXCEPTION
              'Spatial audit modification rejected: direct writes to spatial audit columns on parcel "%" are prohibited.',
              OLD.id
              USING
                ERRCODE = '23514',
                HINT = 'Use public.anagu_verify_parcel_spatial() to record PostGIS spatial verification metadata.';
          END IF;

          -- True no-op: identical coordinates, identical geometry, and unchanged spatial audit columns.
          RETURN NEW;
        END IF;

        -- Reject direct tampering with stored PostGIS geom on finalized / non-editable records
        IF OLD.status IN ('oracle_verified', 'legal_approved', 'registered', 'revoked', 'rejected')
           OR OLD.status NOT IN ('draft', 'spatial_verified') THEN
          RAISE EXCEPTION
            'Geometry modification rejected: parcel "%" is in finalized lifecycle state "%" and its geometry is immutable.',
            OLD.id,
            OLD.status
            USING
              ERRCODE = '23514',
              HINT = 'Finalized parcel boundaries cannot be altered directly.';
        END IF;

        -- Reject piggybacked spatial verification tampering alongside an editable geom overwrite
        IF NEW.spatial_verified_at IS DISTINCT FROM OLD.spatial_verified_at
           OR NEW.spatial_buffer_m IS DISTINCT FROM OLD.spatial_buffer_m
           OR NEW.spatial_conflicts IS DISTINCT FROM OLD.spatial_conflicts THEN
          RAISE EXCEPTION
            'Spatial audit modification rejected: direct writes to spatial verification fields on parcel "%" are prohibited.',
            OLD.id
            USING
              ERRCODE = '23514',
              HINT = 'Use public.anagu_verify_parcel_spatial() to record PostGIS spatial verification metadata.';
        END IF;
        -- Editable ('draft' / 'spatial_verified') direct geom tamper falls through and is
        -- overwritten from authoritative NEW.coordinates below.
      ELSE
        -- OLD.geom IS NULL (one-time NULL-to-geometry backfill or unpopulated legacy row).
        -- Always derive geometry from authoritative NEW.coordinates; never trust caller-supplied NEW.geom.
        IF NEW.spatial_verified_at IS DISTINCT FROM OLD.spatial_verified_at
           OR NEW.spatial_buffer_m IS DISTINCT FROM OLD.spatial_buffer_m
           OR NEW.spatial_conflicts IS DISTINCT FROM OLD.spatial_conflicts THEN
          DELETE FROM anagu_internal.spatial_audit_write_grants
          WHERE txid = pg_catalog.txid_current()
            AND parcel_id = OLD.id;
          v_has_audit_grant := FOUND;

          IF NOT v_has_audit_grant THEN
            RAISE EXCEPTION
              'Spatial audit modification rejected: direct writes to spatial verification fields on parcel "%" are prohibited.',
              OLD.id
              USING
                ERRCODE = '23514',
                HINT = 'Use public.anagu_verify_parcel_spatial() to record PostGIS spatial verification metadata.';
          END IF;
        END IF;

        v_geom := public.anagu_coords_jsonb_to_polygon(NEW.coordinates);
        v_geom_computed := TRUE;

        IF NEW.geom IS NOT NULL
           AND (v_geom IS NULL OR public.ST_AsEWKB(NEW.geom) IS DISTINCT FROM public.ST_AsEWKB(v_geom)) THEN
          IF OLD.status IN ('oracle_verified', 'legal_approved', 'registered', 'revoked', 'rejected')
             OR OLD.status NOT IN ('draft', 'spatial_verified') THEN
            RAISE EXCEPTION
              'Geometry modification rejected: supplied geometry does not match authoritative coordinates for finalized parcel "%" (status "%").',
              OLD.id,
              OLD.status
              USING
                ERRCODE = '23514',
                HINT = 'Parcel geometry must be derived exclusively from authoritative coordinates JSONB.';
          END IF;
        END IF;
        -- Falls through to assign authoritative derived v_geom and synchronize all audit columns
        -- without altering status or spatial_verified_at.
      END IF;
    END IF;
  END IF;

  IF NOT v_geom_computed THEN
    v_geom := public.anagu_coords_jsonb_to_polygon(NEW.coordinates);
  END IF;

  NEW.geom := v_geom;
  NEW.geom_srid := 4326;

  IF v_geom IS NULL THEN
    NEW.spatial_valid := FALSE;
    NEW.spatial_valid_reason := 'Insufficient or invalid coordinates (minimum 3 valid [lat, lng] vertices required)';
    NEW.postgis_area_sqm := NULL;
    NEW.postgis_perimeter_m := NULL;
  ELSE
    v_valid := public.ST_IsValid(v_geom);
    NEW.spatial_valid := v_valid;
    NEW.spatial_valid_reason := public.ST_IsValidReason(v_geom);
    IF v_valid THEN
      NEW.postgis_area_sqm := ROUND(public.ST_Area(v_geom::public.geography)::NUMERIC, 2)::DOUBLE PRECISION;
      NEW.postgis_perimeter_m := ROUND(public.ST_Perimeter(v_geom::public.geography)::NUMERIC, 2)::DOUBLE PRECISION;
    ELSE
      NEW.postgis_area_sqm := NULL;
      NEW.postgis_perimeter_m := NULL;
    END IF;
  END IF;

  -- On INSERT, unconditionally clear spatial verification audit fields so no INSERT can forge verification
  IF TG_OP = 'INSERT' THEN
    NEW.spatial_verified_at := NULL;
    NEW.spatial_buffer_m := NULL;
    NEW.spatial_conflicts := '[]'::jsonb;
  END IF;

  -- Invalidate stale spatial verification whenever eligible parcel coordinates actually change
  IF TG_OP = 'UPDATE' AND NEW.coordinates IS DISTINCT FROM OLD.coordinates THEN
    NEW.spatial_verified_at := NULL;
    NEW.spatial_buffer_m := NULL;
    NEW.spatial_conflicts := '[]'::jsonb;

    -- Unconditionally force status to 'draft' for editable parcels so modified geometry
    -- cannot retain 'spatial_verified' or advance to a later lifecycle state in the same UPDATE.
    IF OLD.status IN ('draft', 'spatial_verified') THEN
      NEW.status := 'draft';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anagu_parcels_sync_geom ON public.anagu_parcels;
CREATE TRIGGER trg_anagu_parcels_sync_geom
  BEFORE INSERT OR UPDATE OF
    coordinates,
    geom,
    geom_srid,
    postgis_area_sqm,
    postgis_perimeter_m,
    spatial_valid,
    spatial_valid_reason,
    spatial_verified_at,
    spatial_buffer_m,
    spatial_conflicts
  ON public.anagu_parcels
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_anagu_sync_parcel_geom();

-- 6. Safe Non-Destructive Backfill for All Existing Parcel Records
--    Updates only rows where `geom IS NULL`, preserving original `coordinates`,
--    `area_sqm`, `perimeter_m`, and `status`. Never deletes or rejects legacy rows.
UPDATE public.anagu_parcels p
SET
  geom = calc.g,
  geom_srid = 4326,
  spatial_valid = CASE WHEN calc.g IS NULL THEN FALSE ELSE public.ST_IsValid(calc.g) END,
  spatial_valid_reason = CASE
    WHEN calc.g IS NULL THEN 'Insufficient or invalid coordinates (minimum 3 valid [lat, lng] vertices required)'
    ELSE public.ST_IsValidReason(calc.g)
  END,
  postgis_area_sqm = CASE
    WHEN calc.g IS NOT NULL AND public.ST_IsValid(calc.g)
      THEN ROUND(public.ST_Area(calc.g::public.geography)::NUMERIC, 2)::DOUBLE PRECISION
    ELSE NULL
  END,
  postgis_perimeter_m = CASE
    WHEN calc.g IS NOT NULL AND public.ST_IsValid(calc.g)
      THEN ROUND(public.ST_Perimeter(calc.g::public.geography)::NUMERIC, 2)::DOUBLE PRECISION
    ELSE NULL
  END
FROM (
  SELECT id, public.anagu_coords_jsonb_to_polygon(coordinates) AS g
  FROM public.anagu_parcels
  WHERE geom IS NULL
) calc
WHERE p.id = calc.id;

-- 7. Spatial RPC 1: Geometry Validity Inspection
CREATE OR REPLACE FUNCTION public.anagu_validate_parcel_geometry(p_parcel_id TEXT)
RETURNS TABLE (
  parcel_id TEXT,
  has_geometry BOOLEAN,
  is_valid BOOLEAN,
  valid_reason TEXT,
  srid INTEGER,
  vertex_count INTEGER,
  computed_area_sqm DOUBLE PRECISION,
  computed_perimeter_m DOUBLE PRECISION,
  centroid_lat DOUBLE PRECISION,
  centroid_lng DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_geom public.geometry(Polygon, 4326);
  v_coords JSONB;
  v_valid BOOLEAN;
  v_centroid public.geometry;
BEGIN
  SELECT p.geom, p.coordinates
  INTO v_geom, v_coords
  FROM public.anagu_parcels p
  WHERE p.id = p_parcel_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_geom IS NULL THEN
    v_geom := public.anagu_coords_jsonb_to_polygon(v_coords);
  END IF;

  IF v_geom IS NULL THEN
    RETURN QUERY SELECT
      p_parcel_id,
      FALSE,
      FALSE,
      'Parcel has no valid polygon geometry (minimum 3 valid [lat, lng] vertices required)'::TEXT,
      4326,
      0,
      NULL::DOUBLE PRECISION,
      NULL::DOUBLE PRECISION,
      NULL::DOUBLE PRECISION,
      NULL::DOUBLE PRECISION;
    RETURN;
  END IF;

  v_valid := public.ST_IsValid(v_geom);
  v_centroid := CASE WHEN v_valid THEN public.ST_Centroid(v_geom) ELSE NULL END;

  RETURN QUERY SELECT
    p_parcel_id,
    TRUE,
    v_valid,
    public.ST_IsValidReason(v_geom)::TEXT,
    public.ST_SRID(v_geom),
    GREATEST(public.ST_NPoints(v_geom) - 1, 0),
    CASE WHEN v_valid THEN ROUND(public.ST_Area(v_geom::public.geography)::NUMERIC, 2)::DOUBLE PRECISION ELSE NULL END,
    CASE WHEN v_valid THEN ROUND(public.ST_Perimeter(v_geom::public.geography)::NUMERIC, 2)::DOUBLE PRECISION ELSE NULL END,
    CASE WHEN v_centroid IS NOT NULL THEN public.ST_Y(v_centroid) ELSE NULL END,
    CASE WHEN v_centroid IS NOT NULL THEN public.ST_X(v_centroid) ELSE NULL END;
END;
$$;

-- 8. Spatial RPC 2: Overlap, Shared Boundary, and Buffer-Distance Detection
--    Parameters:
--      p_parcel_id       : Target parcel ID in public.anagu_parcels
--      p_buffer_meters   : Configurable clearance buffer in METERS (WGS 84 geography; default 0.5m, clamped 0..500m)
--      p_min_overlap_sqm : Minimum positive intersection area in m² treated as true land overlap (default 0.01 m²)
--    Classification rules:
--      - `true_overlap`     : ST_Intersects is true, NOT boundary-only ST_Touches, and ST_Area(ST_Intersection) > p_min_overlap_sqm
--      - `boundary_contact` : ST_Touches is true (shared boundary line/point only) with zero/negligible interior intersection area
--      - `buffer_breach`    : Non-touching, non-overlapping neighbor within `p_buffer_meters` (distance <= p_buffer_meters)
CREATE OR REPLACE FUNCTION public.anagu_check_parcel_overlaps(
  p_parcel_id TEXT,
  p_buffer_meters DOUBLE PRECISION DEFAULT 0.5,
  p_min_overlap_sqm DOUBLE PRECISION DEFAULT 0.01
)
RETURNS TABLE (
  conflict_parcel_id TEXT,
  conflict_cadastral_ref TEXT,
  conflict_status TEXT,
  classification TEXT,
  direct_intersects BOOLEAN,
  is_boundary_contact BOOLEAN,
  is_true_overlap BOOLEAN,
  is_buffer_breach BOOLEAN,
  overlap_area_sqm DOUBLE PRECISION,
  buffer_overlap_sqm DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_target_geom public.geometry(Polygon, 4326);
  v_target_coords JSONB;
  v_buffer_m DOUBLE PRECISION := LEAST(GREATEST(COALESCE(p_buffer_meters, 0.5), 0.0), 500.0);
  v_min_area DOUBLE PRECISION := GREATEST(COALESCE(p_min_overlap_sqm, 0.01), 0.0);
  v_buffered_geom public.geometry;
BEGIN
  SELECT p.geom, p.coordinates
  INTO v_target_geom, v_target_coords
  FROM public.anagu_parcels p
  WHERE p.id = p_parcel_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_target_geom IS NULL THEN
    v_target_geom := public.anagu_coords_jsonb_to_polygon(v_target_coords);
  END IF;

  IF v_target_geom IS NULL OR NOT public.ST_IsValid(v_target_geom) THEN
    RETURN;
  END IF;

  IF v_buffer_m > 0 THEN
    v_buffered_geom := public.ST_Buffer(v_target_geom::public.geography, v_buffer_m)::public.geometry;
  ELSE
    v_buffered_geom := v_target_geom;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      other.id,
      other.cadastral_ref,
      other.status,
      other.geom AS other_geom,
      public.ST_Intersects(v_target_geom, other.geom) AS raw_intersects,
      public.ST_Touches(v_target_geom, other.geom) AS raw_touches,
      public.ST_Distance(v_target_geom::public.geography, other.geom::public.geography) AS dist_m
    FROM public.anagu_parcels other
    WHERE other.id <> p_parcel_id
      AND other.geom IS NOT NULL
      AND other.status NOT IN ('revoked', 'rejected')
      AND public.ST_IsValid(other.geom)
      AND public.ST_DWithin(v_target_geom::public.geography, other.geom::public.geography, v_buffer_m)
  ),
  intersections AS (
    SELECT
      c.*,
      CASE
        WHEN c.raw_intersects AND NOT c.raw_touches THEN
          public.ST_CollectionExtract(public.ST_Intersection(v_target_geom, c.other_geom), 3)
        ELSE NULL::public.geometry
      END AS direct_poly_geom,
      CASE
        WHEN v_buffer_m > 0 AND public.ST_Intersects(v_buffered_geom, c.other_geom) THEN
          public.ST_CollectionExtract(public.ST_Intersection(v_buffered_geom, c.other_geom), 3)
        ELSE NULL::public.geometry
      END AS buf_poly_geom
    FROM candidates c
  ),
  measured AS (
    SELECT
      i.id,
      i.cadastral_ref,
      i.status,
      i.raw_intersects,
      i.raw_touches,
      i.dist_m,
      CASE
        WHEN i.direct_poly_geom IS NOT NULL AND NOT public.ST_IsEmpty(i.direct_poly_geom) THEN
          ROUND(public.ST_Area(i.direct_poly_geom::public.geography)::NUMERIC, 4)::DOUBLE PRECISION
        ELSE 0.0
      END AS direct_area_sqm,
      CASE
        WHEN i.buf_poly_geom IS NOT NULL AND NOT public.ST_IsEmpty(i.buf_poly_geom) THEN
          ROUND(public.ST_Area(i.buf_poly_geom::public.geography)::NUMERIC, 4)::DOUBLE PRECISION
        ELSE 0.0
      END AS buf_area_sqm
    FROM intersections i
  )
  SELECT
    m.id AS conflict_parcel_id,
    m.cadastral_ref AS conflict_cadastral_ref,
    m.status AS conflict_status,
    CASE
      WHEN m.direct_area_sqm > v_min_area THEN 'true_overlap'
      WHEN m.raw_touches THEN 'boundary_contact'
      ELSE 'buffer_breach'
    END::TEXT AS classification,
    m.raw_intersects AS direct_intersects,
    (m.raw_touches AND m.direct_area_sqm <= v_min_area) AS is_boundary_contact,
    (m.direct_area_sqm > v_min_area) AS is_true_overlap,
    (
      v_buffer_m > 0
      AND m.direct_area_sqm <= v_min_area
      AND NOT m.raw_touches
      AND m.dist_m <= v_buffer_m
    ) AS is_buffer_breach,
    m.direct_area_sqm AS overlap_area_sqm,
    m.buf_area_sqm AS buffer_overlap_sqm,
    ROUND(m.dist_m::NUMERIC, 4)::DOUBLE PRECISION AS distance_meters
  FROM measured m
  WHERE m.direct_area_sqm > v_min_area
     OR m.raw_touches
     OR (v_buffer_m > 0 AND m.dist_m <= v_buffer_m)
  ORDER BY
    (m.direct_area_sqm > v_min_area) DESC,
    m.direct_area_sqm DESC,
    m.dist_m ASC;
END;
$$;

-- 9. Spatial RPC 3: Unified Spatial Verification & Optional Atomic Approval
--    Callable via both direct `pg` (`SELECT public.anagu_verify_parcel_spatial(...)`)
--    and Supabase PostgREST (`POST /rest/v1/rpc/anagu_verify_parcel_spatial`).
--    NEVER marks a parcel `spatial_verified` unless:
--      1. `p_persist_verification = TRUE`,
--      2. geometry exists and passes `ST_IsValid`,
--      3. zero `true_overlap` parcels exist,
--      4. if `p_enforce_buffer = TRUE`, zero `buffer_breach` parcels exist, and
--      5. parcel is currently in an eligible lifecycle state ('draft' or 'spatial_verified').
CREATE OR REPLACE FUNCTION public.anagu_verify_parcel_spatial(
  p_parcel_id TEXT,
  p_buffer_meters DOUBLE PRECISION DEFAULT 0.5,
  p_enforce_buffer BOOLEAN DEFAULT FALSE,
  p_persist_verification BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_started_at TIMESTAMPTZ := clock_timestamp();
  v_buffer_m DOUBLE PRECISION := LEAST(GREATEST(COALESCE(p_buffer_meters, 0.5), 0.0), 500.0);
  v_val RECORD;
  v_true_overlaps JSONB := '[]'::jsonb;
  v_boundary_contacts JSONB := '[]'::jsonb;
  v_buffer_breaches JSONB := '[]'::jsonb;
  v_true_overlap_count INTEGER := 0;
  v_boundary_contact_count INTEGER := 0;
  v_buffer_breach_count INTEGER := 0;
  v_update_found BOOLEAN := FALSE;
  v_passed BOOLEAN := FALSE;
  v_persisted BOOLEAN := FALSE;
  v_persistence_refused BOOLEAN := FALSE;
  v_persistence_refused_reason TEXT := NULL;
  v_duration_ms INTEGER;
  v_current_status TEXT;
  v_updated_status TEXT;
BEGIN
  SELECT * INTO v_val
  FROM public.anagu_validate_parcel_geometry(p_parcel_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', FALSE,
      'engine', 'postgis',
      'parcelId', p_parcel_id,
      'passed', FALSE,
      'persisted', FALSE,
      'persistenceRefused', FALSE,
      'persistenceRefusedReason', NULL,
      'error', 'Parcel not found.'
    );
  END IF;

  SELECT status INTO v_current_status
  FROM public.anagu_parcels
  WHERE id = p_parcel_id;

  IF v_val.is_valid THEN
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'parcelId', o.conflict_parcel_id,
            'cadastralRef', o.conflict_cadastral_ref,
            'status', o.conflict_status,
            'classification', o.classification,
            'overlapAreaSqm', o.overlap_area_sqm,
            'bufferOverlapSqm', o.buffer_overlap_sqm,
            'distanceMeters', o.distance_meters
          )
        ) FILTER (WHERE o.is_true_overlap),
        '[]'::jsonb
      ),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'parcelId', o.conflict_parcel_id,
            'cadastralRef', o.conflict_cadastral_ref,
            'status', o.conflict_status,
            'classification', o.classification,
            'overlapAreaSqm', o.overlap_area_sqm,
            'bufferOverlapSqm', o.buffer_overlap_sqm,
            'distanceMeters', o.distance_meters
          )
        ) FILTER (WHERE o.is_boundary_contact),
        '[]'::jsonb
      ),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'parcelId', o.conflict_parcel_id,
            'cadastralRef', o.conflict_cadastral_ref,
            'status', o.conflict_status,
            'classification', o.classification,
            'overlapAreaSqm', o.overlap_area_sqm,
            'bufferOverlapSqm', o.buffer_overlap_sqm,
            'distanceMeters', o.distance_meters
          )
        ) FILTER (WHERE o.is_buffer_breach),
        '[]'::jsonb
      ),
      COUNT(*) FILTER (WHERE o.is_true_overlap)::INTEGER,
      COUNT(*) FILTER (WHERE o.is_boundary_contact)::INTEGER,
      COUNT(*) FILTER (WHERE o.is_buffer_breach)::INTEGER
    INTO
      v_true_overlaps,
      v_boundary_contacts,
      v_buffer_breaches,
      v_true_overlap_count,
      v_boundary_contact_count,
      v_buffer_breach_count
    FROM public.anagu_check_parcel_overlaps(p_parcel_id, v_buffer_m, 0.01) o;
  END IF;

  v_passed :=
    COALESCE(v_val.has_geometry, FALSE)
    AND COALESCE(v_val.is_valid, FALSE)
    AND v_true_overlap_count = 0
    AND (NOT COALESCE(p_enforce_buffer, FALSE) OR v_buffer_breach_count = 0);

  IF COALESCE(p_persist_verification, FALSE) AND v_passed THEN
    -- Issue an unforgeable, owner-only, single-use grant scoped to this exact transaction & parcel
    INSERT INTO anagu_internal.spatial_audit_write_grants (txid, parcel_id)
    VALUES (pg_catalog.txid_current(), p_parcel_id)
    ON CONFLICT (txid, parcel_id) DO UPDATE
      SET granted_at = clock_timestamp();

    UPDATE public.anagu_parcels
    SET
      status = 'spatial_verified',
      spatial_valid = v_val.is_valid,
      spatial_valid_reason = v_val.valid_reason,
      postgis_area_sqm = v_val.computed_area_sqm,
      postgis_perimeter_m = v_val.computed_perimeter_m,
      spatial_buffer_m = v_buffer_m,
      spatial_conflicts = v_true_overlaps || v_buffer_breaches,
      spatial_verified_at = NOW(),
      updated_at = NOW()
    WHERE id = p_parcel_id
      AND status IN ('draft', 'spatial_verified')
    RETURNING status INTO v_updated_status;

    v_update_found := FOUND;

    -- Defensive cleanup in case WHERE matched 0 rows (finalized parcel) so no unused grant lingers
    DELETE FROM anagu_internal.spatial_audit_write_grants
    WHERE txid = pg_catalog.txid_current()
      AND parcel_id = p_parcel_id;

    IF v_update_found THEN
      v_persisted := TRUE;
    ELSE
      SELECT status INTO v_updated_status
      FROM public.anagu_parcels
      WHERE id = p_parcel_id;
      v_persisted := FALSE;
      v_persistence_refused := TRUE;
      v_persistence_refused_reason := format(
        'Persistence refused: parcel is currently in "%s" lifecycle state. Only "draft" or "spatial_verified" parcels can persist spatial_verified.',
        COALESCE(v_updated_status, v_current_status, 'unknown')
      );
    END IF;
  ELSE
    v_updated_status := v_current_status;
    v_persisted := FALSE;
  END IF;

  v_duration_ms := GREATEST(
    ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::INTEGER,
    1
  );

  RETURN jsonb_build_object(
    'found', TRUE,
    'engine', 'postgis',
    'parcelId', p_parcel_id,
    'srid', COALESCE(v_val.srid, 4326),
    'bufferMeters', v_buffer_m,
    'enforceBuffer', COALESCE(p_enforce_buffer, FALSE),
    'hasGeometry', COALESCE(v_val.has_geometry, FALSE),
    'isValid', COALESCE(v_val.is_valid, FALSE),
    'validReason', COALESCE(v_val.valid_reason, 'Unknown geometry error'),
    'vertexCount', COALESCE(v_val.vertex_count, 0),
    'computedAreaSqm', v_val.computed_area_sqm,
    'computedPerimeterM', v_val.computed_perimeter_m,
    'centroidLat', v_val.centroid_lat,
    'centroidLng', v_val.centroid_lng,
    'hasTrueOverlap', v_true_overlap_count > 0,
    'trueOverlapCount', v_true_overlap_count,
    'boundaryContactCount', v_boundary_contact_count,
    'bufferBreachCount', v_buffer_breach_count,
    'trueOverlaps', v_true_overlaps,
    'boundaryContacts', v_boundary_contacts,
    'bufferBreaches', v_buffer_breaches,
    'passed', v_passed,
    'persisted', v_persisted,
    'persistenceRefused', v_persistence_refused,
    'persistenceRefusedReason', v_persistence_refused_reason,
    'status', v_updated_status,
    'queryDurationMs', v_duration_ms
  );
END;
$$;

-- 10. Restrict Table, Internal Schema, Public CREATE, Trigger, and Spatial RPC Privileges
--     - Architecture audit confirmed NO browser/frontend client connects to Supabase directly;
--       all reads and writes to `public.anagu_parcels` go through the Express backend using
--       either `service_role` (PostgREST) or the database owner (`DATABASE_URL`).
--     - Enable default-deny Row-Level Security on `public.anagu_parcels` (no anon/authenticated
--       policies) and revoke all direct table grants from PUBLIC, anon, and authenticated.
--     - Revoke CREATE on schema `public` from PUBLIC, anon, and authenticated (preserving USAGE)
--       so untrusted roles cannot plant shadow objects in `public` while SECURITY DEFINER
--       functions resolve PostGIS 3.3.7 SQL wrappers via `SET search_path = pg_catalog, public, pg_temp`.
--     - Ensure `anagu_internal` and `anagu_internal.spatial_audit_write_grants` are inaccessible
--       to PUBLIC, anon, authenticated, AND service_role so only owner SECURITY DEFINER functions
--       can issue or consume spatial audit write grants.
--     - Grant direct EXECUTE on the spatial RPCs and conversion helper to `service_role` only.
ALTER TABLE public.anagu_parcels ENABLE ROW LEVEL SECURITY;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON TABLE public.anagu_parcels FROM PUBLIC;
REVOKE ALL ON SCHEMA anagu_internal FROM PUBLIC;
REVOKE ALL ON TABLE anagu_internal.spatial_audit_write_grants FROM PUBLIC;

REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fn_anagu_sync_parcel_geom() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE CREATE ON SCHEMA public FROM anon;
    REVOKE ALL ON TABLE public.anagu_parcels FROM anon;
    REVOKE ALL ON SCHEMA anagu_internal FROM anon;
    REVOKE ALL ON TABLE anagu_internal.spatial_audit_write_grants FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM anon;
    REVOKE ALL ON FUNCTION public.trg_fn_anagu_sync_parcel_geom() FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE CREATE ON SCHEMA public FROM authenticated;
    REVOKE ALL ON TABLE public.anagu_parcels FROM authenticated;
    REVOKE ALL ON SCHEMA anagu_internal FROM authenticated;
    REVOKE ALL ON TABLE anagu_internal.spatial_audit_write_grants FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM authenticated;
    REVOKE ALL ON FUNCTION public.trg_fn_anagu_sync_parcel_geom() FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    REVOKE CREATE ON SCHEMA public FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.anagu_parcels TO service_role;
    REVOKE ALL ON SCHEMA anagu_internal FROM service_role;
    REVOKE ALL ON TABLE anagu_internal.spatial_audit_write_grants FROM service_role;
    REVOKE ALL ON FUNCTION public.trg_fn_anagu_sync_parcel_geom() FROM service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) TO service_role;
  END IF;
END;
$$;

-- 10b. Verify consistent ownership across private grant objects and SECURITY DEFINER functions
DO $$
DECLARE
  v_schema_owner OID;
  v_table_owner OID;
  v_trigger_owner OID;
  v_verify_owner OID;
  v_validate_owner OID;
  v_overlap_owner OID;
  v_owner_name TEXT;
BEGIN
  SELECT nspowner INTO v_schema_owner
  FROM pg_catalog.pg_namespace
  WHERE nspname = 'anagu_internal';

  SELECT c.relowner INTO v_table_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'anagu_internal'
    AND c.relname = 'spatial_audit_write_grants';

  SELECT p.proowner INTO STRICT v_trigger_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.trg_fn_anagu_sync_parcel_geom()'::regprocedure;

  SELECT p.proowner INTO STRICT v_verify_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.anagu_verify_parcel_spatial(text, double precision, boolean, boolean)'::regprocedure;

  SELECT p.proowner INTO STRICT v_validate_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.anagu_validate_parcel_geometry(text)'::regprocedure;

  SELECT p.proowner INTO STRICT v_overlap_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.anagu_check_parcel_overlaps(text, double precision, double precision)'::regprocedure;

  IF v_schema_owner IS DISTINCT FROM v_table_owner
     OR v_table_owner IS DISTINCT FROM v_trigger_owner
     OR v_table_owner IS DISTINCT FROM v_verify_owner
     OR v_table_owner IS DISTINCT FROM v_validate_owner
     OR v_table_owner IS DISTINCT FROM v_overlap_owner THEN
    RAISE EXCEPTION
      'Ownership mismatch detected between anagu_internal.spatial_audit_write_grants and SECURITY DEFINER spatial functions.'
      USING HINT = 'Run supabase/migrations/001_postgis_spatial.sql as a single consistent database owner role (e.g., postgres).';
  END IF;

  SELECT rolname INTO v_owner_name
  FROM pg_catalog.pg_roles
  WHERE oid = v_table_owner;

  IF v_owner_name IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION
      'Unsafe ownership: private grant table and SECURITY DEFINER functions must not be owned by "%".',
      v_owner_name;
  END IF;
END;
$$;

-- 11. Refresh Supabase PostgREST schema cache so new RPCs are immediately discoverable
NOTIFY pgrst, 'reload schema';
