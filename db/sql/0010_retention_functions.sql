-- Revision 0010 `retention_functions` (owner: Zikri, M2-PH3-T08). Selection and anonymization for retention
-- (policy P3; D-06, D-31). Follows 0009 in the registered order. Fix-forward only: no applied revision is edited.
--
-- Rule. A parcel that is not yet anonymized becomes due 12 months after:
--   * its terminal_at, when it is DELIVERED or FAILED (D-06: both outcomes alike); or
--   * its last status change, when it never became terminal (D-31, SHOULD tier).
-- "12 months" is calendar months in UTC, so the boundary does not depend on the session time zone; month ends
-- clamp the PostgreSQL way (2028-02-29 + 12 months = 2029-02-28). A parcel is due at that instant exactly.
--
-- Both functions are executable only by maintenance_runtime, which no web request uses, so no request path can call
-- them or choose `as_of`. anonymize_parcel re-checks the rule under the parcel row lock, clears the recipient fields
-- and the creation fingerprint, sets anonymized_at to the server time, bumps the version (so a stale write gets 409)
-- and audits RETENTION_ANONYMIZED. History, proof metadata and the tracking number are left alone; proof files are
-- purged later by M3's job, which reads anonymized_at. A second call on the same parcel is a no-op.

-- Privileges these functions need beyond 0003 (maintenance_fn_owner already has SELECT on parcel and column UPDATE
-- on the recipient fields, fingerprint, anonymized_at and version): append the audit row, and read the time of each
-- history event for the D-31 rule. The history grant is limited to the two columns the rule uses.
GRANT INSERT ON app.audit_event TO maintenance_fn_owner;
GRANT SELECT(parcel_id,changed_at) ON app.parcel_status_history TO maintenance_fn_owner;
CREATE POLICY history_maintenance ON app.parcel_status_history FOR SELECT TO maintenance_fn_owner USING (true);

SET LOCAL ROLE maintenance_fn_owner;
CREATE FUNCTION app.list_retention_candidates(p_batch integer, p_as_of timestamptz)
 RETURNS TABLE(parcel_id bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
  IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 OR p_as_of IS NULL OR NOT isfinite(p_as_of) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid retention batch or time';
  END IF;
  RETURN QUERY
  SELECT p.id
  FROM app.parcel p
  WHERE p.anonymized_at IS NULL
    AND (
      (p.current_status IN ('DELIVERED','FAILED') AND p.terminal_at IS NOT NULL
        AND ((p.terminal_at AT TIME ZONE 'UTC') + interval '12 months') AT TIME ZONE 'UTC' <= p_as_of)
      OR
      (p.current_status NOT IN ('DELIVERED','FAILED')
        AND ((SELECT max(h.changed_at) FROM app.parcel_status_history h WHERE h.parcel_id = p.id) AT TIME ZONE 'UTC'
          + interval '12 months') AT TIME ZONE 'UTC' <= p_as_of)
    )
  ORDER BY p.id
  LIMIT p_batch;
END;
$$;
ALTER FUNCTION app.list_retention_candidates(integer,timestamptz) OWNER TO maintenance_fn_owner;
REVOKE ALL ON FUNCTION app.list_retention_candidates(integer,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.list_retention_candidates(integer,timestamptz) TO maintenance_runtime;

CREATE FUNCTION app.anonymize_parcel(p_parcel_id bigint, p_as_of timestamptz)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE
  v_parcel app.parcel%ROWTYPE;
  v_since timestamptz;
BEGIN
  IF p_parcel_id IS NULL OR p_as_of IS NULL OR NOT isfinite(p_as_of) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid retention parcel or time';
  END IF;
  SELECT * INTO v_parcel FROM app.parcel WHERE id = p_parcel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT002', MESSAGE = 'Parcel not found';
  END IF;
  -- Already anonymized: nothing to do, and no second audit row.
  IF v_parcel.anonymized_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_parcel.current_status IN ('DELIVERED','FAILED') THEN
    v_since := v_parcel.terminal_at;
  ELSE
    SELECT max(h.changed_at) INTO v_since FROM app.parcel_status_history h WHERE h.parcel_id = p_parcel_id;
  END IF;
  IF v_since IS NULL OR ((v_since AT TIME ZONE 'UTC') + interval '12 months') AT TIME ZONE 'UTC' > p_as_of THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Parcel is not due for anonymization';
  END IF;

  UPDATE app.parcel
  SET recipient_name = NULL, recipient_phone = NULL, recipient_address = NULL, creation_fingerprint = NULL,
      anonymized_at = clock_timestamp(), version = version + 1
  WHERE id = p_parcel_id;

  INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, request_id, details)
  VALUES (NULL, p_parcel_id, 'RETENTION_ANONYMIZED', 'SUCCESS', gen_random_uuid(),
    jsonb_build_object('status', v_parcel.current_status));
  RETURN true;
END;
$$;
ALTER FUNCTION app.anonymize_parcel(bigint,timestamptz) OWNER TO maintenance_fn_owner;
REVOKE ALL ON FUNCTION app.anonymize_parcel(bigint,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.anonymize_parcel(bigint,timestamptz) TO maintenance_runtime;
RESET ROLE;
