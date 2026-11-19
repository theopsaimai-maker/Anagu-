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

-- 1. Enable PostGIS in Supabase's standard `extensions` schema (idempotent)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

SET search_path TO public, extensions;

-- 2. Add nullable PostGIS geometry & spatial audit columns to public.anagu_parcels
ALTER TABLE public.anagu_parcels
  ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326),
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

-- 3. Spatial GiST Indexes
-- General GiST index on geometry(Polygon, 4326)
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_geom_gist
  ON public.anagu_parcels
  USING GIST (geom);

-- Partial GiST index on WGS 84 geography for active cadastral overlap / buffer scans
-- (excludes revoked and rejected parcels from active conflict checks)
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_active_geog_gist
  ON public.anagu_parcels
  USING GIST ((geom::geography))
  WHERE geom IS NOT NULL AND status NOT IN ('revoked', 'rejected');

-- 4. Safe Coordinate Conversion Function: JSONB [[lat, lng], ...] -> geometry(Polygon, 4326)
--    - Accepts existing `[latitude, longitude]` JSONB arrays (or `{"lat":..,"lng":..}` objects).
--    - Swaps coordinates to PostGIS `(longitude, latitude)` = `(X, Y)` order.
--    - Automatically closes unclosed polygon rings by appending the first vertex.
--    - Never rejects out-of-Nigeria coordinates (only checks global WGS 84 bounds).
--    - Returns NULL on malformed input instead of failing an INSERT/UPDATE/backfill.
CREATE OR REPLACE FUNCTION public.anagu_coords_jsonb_to_polygon(p_coords JSONB)
RETURNS geometry(Polygon, 4326)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_elem JSONB;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_first_lat DOUBLE PRECISION;
  v_first_lng DOUBLE PRECISION;
  v_last_lat DOUBLE PRECISION;
  v_last_lng DOUBLE PRECISION;
  v_points geometry[] := ARRAY[]::geometry[];
  v_ring geometry;
  v_poly geometry;
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
    v_points := array_append(v_points, ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326));
  END LOOP;

  -- Need at least 3 distinct vertices to form a polygon
  IF array_length(v_points, 1) IS NULL OR array_length(v_points, 1) < 3 THEN
    RETURN NULL;
  END IF;

  -- Automatically close open linear rings so ST_MakePolygon succeeds
  IF v_last_lat <> v_first_lat OR v_last_lng <> v_first_lng THEN
    v_points := array_append(v_points, ST_SetSRID(ST_MakePoint(v_first_lng, v_first_lat), 4326));
  END IF;

  -- A closed linear ring requires at least 4 points (3 distinct vertices + closing vertex)
  IF array_length(v_points, 1) < 4 THEN
    RETURN NULL;
  END IF;

  v_ring := ST_MakeLine(v_points);
  v_poly := ST_SetSRID(ST_MakePolygon(v_ring), 4326);
  RETURN v_poly;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 5. Automatic Geometry Sync Trigger on public.anagu_parcels
--    Keeps `geom`, `spatial_valid`, `spatial_valid_reason`, `postgis_area_sqm`,
--    and `postgis_perimeter_m` synchronized whenever `coordinates` is inserted or updated
--    via either direct `pg` or Supabase PostgREST.
CREATE OR REPLACE FUNCTION public.trg_fn_anagu_sync_parcel_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry(Polygon, 4326);
  v_valid BOOLEAN;
BEGIN
  v_geom := public.anagu_coords_jsonb_to_polygon(NEW.coordinates);
  NEW.geom := v_geom;
  NEW.geom_srid := 4326;

  IF v_geom IS NULL THEN
    NEW.spatial_valid := FALSE;
    NEW.spatial_valid_reason := 'Insufficient or invalid coordinates (minimum 3 valid [lat, lng] vertices required)';
    NEW.postgis_area_sqm := NULL;
    NEW.postgis_perimeter_m := NULL;
  ELSE
    v_valid := ST_IsValid(v_geom);
    NEW.spatial_valid := v_valid;
    NEW.spatial_valid_reason := ST_IsValidReason(v_geom);
    IF v_valid THEN
      NEW.postgis_area_sqm := ROUND(ST_Area(v_geom::geography)::NUMERIC, 2)::DOUBLE PRECISION;
      NEW.postgis_perimeter_m := ROUND(ST_Perimeter(v_geom::geography)::NUMERIC, 2)::DOUBLE PRECISION;
    ELSE
      NEW.postgis_area_sqm := NULL;
      NEW.postgis_perimeter_m := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anagu_parcels_sync_geom ON public.anagu_parcels;
CREATE TRIGGER trg_anagu_parcels_sync_geom
  BEFORE INSERT OR UPDATE OF coordinates ON public.anagu_parcels
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_anagu_sync_parcel_geom();

-- 6. Safe Non-Destructive Backfill for All Existing Parcel Records
--    Updates only rows where `geom IS NULL`, preserving original `coordinates`,
--    `area_sqm`, `perimeter_m`, and `status`. Never deletes or rejects legacy rows.
UPDATE public.anagu_parcels p
SET
  geom = calc.g,
  geom_srid = 4326,
  spatial_valid = CASE WHEN calc.g IS NULL THEN FALSE ELSE ST_IsValid(calc.g) END,
  spatial_valid_reason = CASE
    WHEN calc.g IS NULL THEN 'Insufficient or invalid coordinates (minimum 3 valid [lat, lng] vertices required)'
    ELSE ST_IsValidReason(calc.g)
  END,
  postgis_area_sqm = CASE
    WHEN calc.g IS NOT NULL AND ST_IsValid(calc.g)
      THEN ROUND(ST_Area(calc.g::geography)::NUMERIC, 2)::DOUBLE PRECISION
    ELSE NULL
  END,
  postgis_perimeter_m = CASE
    WHEN calc.g IS NOT NULL AND ST_IsValid(calc.g)
      THEN ROUND(ST_Perimeter(calc.g::geography)::NUMERIC, 2)::DOUBLE PRECISION
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
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry(Polygon, 4326);
  v_coords JSONB;
  v_valid BOOLEAN;
  v_centroid geometry;
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

  v_valid := ST_IsValid(v_geom);
  v_centroid := CASE WHEN v_valid THEN ST_Centroid(v_geom) ELSE NULL END;

  RETURN QUERY SELECT
    p_parcel_id,
    TRUE,
    v_valid,
    ST_IsValidReason(v_geom)::TEXT,
    ST_SRID(v_geom),
    GREATEST(ST_NPoints(v_geom) - 1, 0),
    CASE WHEN v_valid THEN ROUND(ST_Area(v_geom::geography)::NUMERIC, 2)::DOUBLE PRECISION ELSE NULL END,
    CASE WHEN v_valid THEN ROUND(ST_Perimeter(v_geom::geography)::NUMERIC, 2)::DOUBLE PRECISION ELSE NULL END,
    CASE WHEN v_centroid IS NOT NULL THEN ST_Y(v_centroid) ELSE NULL END,
    CASE WHEN v_centroid IS NOT NULL THEN ST_X(v_centroid) ELSE NULL END;
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
SET search_path = public, extensions
AS $$
DECLARE
  v_target_geom geometry(Polygon, 4326);
  v_target_coords JSONB;
  v_buffer_m DOUBLE PRECISION := LEAST(GREATEST(COALESCE(p_buffer_meters, 0.5), 0.0), 500.0);
  v_min_area DOUBLE PRECISION := GREATEST(COALESCE(p_min_overlap_sqm, 0.01), 0.0);
  v_buffered_geom geometry;
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

  IF v_target_geom IS NULL OR NOT ST_IsValid(v_target_geom) THEN
    RETURN;
  END IF;

  IF v_buffer_m > 0 THEN
    v_buffered_geom := ST_Buffer(v_target_geom::geography, v_buffer_m)::geometry;
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
      ST_Intersects(v_target_geom, other.geom) AS raw_intersects,
      ST_Touches(v_target_geom, other.geom) AS raw_touches,
      ST_Distance(v_target_geom::geography, other.geom::geography) AS dist_m
    FROM public.anagu_parcels other
    WHERE other.id <> p_parcel_id
      AND other.geom IS NOT NULL
      AND other.status NOT IN ('revoked', 'rejected')
      AND ST_IsValid(other.geom)
      AND ST_DWithin(v_target_geom::geography, other.geom::geography, v_buffer_m)
  ),
  measured AS (
    SELECT
      c.id,
      c.cadastral_ref,
      c.status,
      c.raw_intersects,
      c.raw_touches,
      c.dist_m,
      CASE
        WHEN c.raw_intersects AND NOT c.raw_touches THEN
          ROUND(ST_Area(ST_Intersection(v_target_geom, c.other_geom)::geography)::NUMERIC, 4)::DOUBLE PRECISION
        ELSE 0.0
      END AS direct_area_sqm,
      CASE
        WHEN v_buffer_m > 0 AND ST_Intersects(v_buffered_geom, c.other_geom) THEN
          ROUND(ST_Area(ST_Intersection(v_buffered_geom, c.other_geom)::geography)::NUMERIC, 4)::DOUBLE PRECISION
        ELSE 0.0
      END AS buf_area_sqm
    FROM candidates c
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
--      3. zero `true_overlap` parcels exist, and
--      4. if `p_enforce_buffer = TRUE`, zero `buffer_breach` parcels exist.
CREATE OR REPLACE FUNCTION public.anagu_verify_parcel_spatial(
  p_parcel_id TEXT,
  p_buffer_meters DOUBLE PRECISION DEFAULT 0.5,
  p_enforce_buffer BOOLEAN DEFAULT FALSE,
  p_persist_verification BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_passed BOOLEAN := FALSE;
  v_duration_ms INTEGER;
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
      'error', 'Parcel not found.'
    );
  END IF;

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
    RETURNING status INTO v_updated_status;
  ELSE
    SELECT status INTO v_updated_status
    FROM public.anagu_parcels
    WHERE id = p_parcel_id;
  END IF;

  v_duration_ms := GREATEST(
    EXTRACT(MILLISECOND FROM (clock_timestamp() - v_started_at))::INTEGER,
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
    'persisted', (COALESCE(p_persist_verification, FALSE) AND v_passed),
    'status', v_updated_status,
    'queryDurationMs', v_duration_ms
  );
END;
$$;

-- 10. Restrict Spatial RPC Execution Privileges (Backend Service Role Only)
--     Explicitly revoke PUBLIC, anon, and authenticated access so PostgREST
--     never exposes spatial RPCs to unauthenticated or browser callers.
REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM anon;
    REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM authenticated;
    REVOKE ALL ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.anagu_coords_jsonb_to_polygon(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_validate_parcel_geometry(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_check_parcel_overlaps(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
    GRANT EXECUTE ON FUNCTION public.anagu_verify_parcel_spatial(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN) TO service_role;
  END IF;
END;
$$;

-- 11. Refresh Supabase PostgREST schema cache so new RPCs are immediately discoverable
NOTIFY pgrst, 'reload schema';
