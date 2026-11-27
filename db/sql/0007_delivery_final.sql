-- Revision 0007 (owner: Syauqi). Admin assignment, the finalization lock and the final-outcome branch of
-- update_delivery_status. Lock order in every flow: acting account, target account, then parcel.
-- The reconcile helpers (lock_parcel_for_reconcile, proof_key_is_referenced) belong to the Phase 4
-- proof_maintenance_functions revision, owned by maintenance_fn_owner.

-- Target-account check for assignment. domain_writer has no access to app_user, so the account owner
-- locks the target row FOR SHARE (blocking a concurrent disablement until commit) and confirms it is an
-- active Rider. Every failure is the same INVALID_ASSIGNEE so callers cannot probe other account types.
CREATE FUNCTION app.lock_assignee(p_rider_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp AS $$
DECLARE
  v_role text;
  v_active boolean;
BEGIN
  SELECT u.role, u.is_active INTO v_role, v_active
  FROM app.app_user u
  WHERE u.id = p_rider_id
  FOR SHARE;
  IF NOT FOUND OR v_role <> 'RIDER' OR NOT v_active THEN
    RAISE EXCEPTION USING ERRCODE = 'PT005', MESSAGE = 'Invalid assignee';
  END IF;
END;
$$;
ALTER FUNCTION app.lock_assignee(bigint) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.lock_assignee(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.lock_assignee(bigint) TO domain_writer;
RESET ROLE;

SET LOCAL ROLE domain_writer;
CREATE FUNCTION app.assign_parcel(
  p_parcel_id bigint,
  p_rider_id bigint,
  p_expected_version integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp AS $$
DECLARE
  v_actor_id bigint := app.context_user_id();
  v_session_version integer := app.context_session_version();
  v_parcel app.parcel%ROWTYPE;
  v_changed_at timestamptz;
  v_request_id uuid;
BEGIN
  IF v_actor_id IS NULL OR v_session_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT012', MESSAGE = 'Unauthenticated';
  END IF;

  PERFORM app.lock_active_actor(v_actor_id, v_session_version, ARRAY['ADMIN'], 'share', false);
  PERFORM app.lock_assignee(p_rider_id);

  SELECT * INTO v_parcel FROM app.parcel WHERE id = p_parcel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT002', MESSAGE = 'Parcel not found';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_parcel.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT003', MESSAGE = 'Version conflict';
  END IF;
  IF v_parcel.current_status NOT IN ('REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY')
     OR v_parcel.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Invalid transition';
  END IF;

  -- Reassigning the current Rider with a matching version is a no-op: no version, history or audit change.
  IF v_parcel.current_status <> 'REGISTERED' AND v_parcel.assigned_rider_id = p_rider_id THEN
    RETURN;
  END IF;

  SELECT GREATEST(clock_timestamp(), max(changed_at)) INTO v_changed_at
  FROM app.parcel_status_history
  WHERE parcel_id = v_parcel.id;
  v_request_id := COALESCE(NULLIF(current_setting('app.request_id', true), '')::uuid, gen_random_uuid());

  IF v_parcel.current_status = 'REGISTERED' THEN
    UPDATE app.parcel
    SET current_status = 'ASSIGNED', assigned_rider_id = p_rider_id, version = version + 1
    WHERE id = v_parcel.id;

    INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
    VALUES (v_parcel.id, v_actor_id, 'ASSIGNED', v_changed_at);

    INSERT INTO app.audit_event (actor_id, target_user_id, parcel_id, event_type, outcome, occurred_at, request_id, details)
    VALUES (v_actor_id, p_rider_id, v_parcel.id, 'PARCEL_ASSIGNED', 'SUCCESS', v_changed_at, v_request_id,
            jsonb_build_object('newRiderId', p_rider_id::text));
  ELSE
    -- Reassignment keeps the status, so it writes no status history row.
    UPDATE app.parcel SET assigned_rider_id = p_rider_id, version = version + 1
    WHERE id = v_parcel.id;

    INSERT INTO app.audit_event (actor_id, target_user_id, parcel_id, event_type, outcome, occurred_at, request_id, details)
    VALUES (v_actor_id, p_rider_id, v_parcel.id, 'PARCEL_REASSIGNED', 'SUCCESS', v_changed_at, v_request_id,
            jsonb_build_object('oldRiderId', v_parcel.assigned_rider_id::text, 'newRiderId', p_rider_id::text,
                               'status', v_parcel.current_status));
  END IF;
END;
$$;
ALTER FUNCTION app.assign_parcel(bigint,bigint,integer) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.assign_parcel(bigint,bigint,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.assign_parcel(bigint,bigint,integer) TO app_runtime;

-- Taken before the proof upload and held until the caller's transaction ends, so the parcel cannot be
-- reassigned, finalized or anonymized while its object is being published.
CREATE FUNCTION app.lock_delivery_target(p_parcel_id bigint, p_expected_version integer)
RETURNS TABLE (parcel_id bigint, current_status text, version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp AS $$
DECLARE
  v_actor_id bigint := app.context_user_id();
  v_session_version integer := app.context_session_version();
  v_parcel app.parcel%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR v_session_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT012', MESSAGE = 'Unauthenticated';
  END IF;

  PERFORM app.lock_active_actor(v_actor_id, v_session_version, ARRAY['RIDER'], 'share', false);

  SELECT * INTO v_parcel
  FROM app.parcel p
  WHERE p.id = p_parcel_id AND p.assigned_rider_id = v_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT002', MESSAGE = 'Parcel not found';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_parcel.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT003', MESSAGE = 'Version conflict';
  END IF;
  IF v_parcel.current_status <> 'OUT_FOR_DELIVERY' OR v_parcel.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Invalid transition';
  END IF;

  RETURN QUERY SELECT v_parcel.id, v_parcel.current_status, v_parcel.version;
END;
$$;
ALTER FUNCTION app.lock_delivery_target(bigint,integer) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.lock_delivery_target(bigint,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.lock_delivery_target(bigint,integer) TO app_runtime;

-- Replaces the 0006 start-only body with the full Rider transition set. Applied revisions are never
-- edited, so the final branch is added here as a forward replacement with the same signature.
CREATE OR REPLACE FUNCTION app.update_delivery_status(
  p_parcel_id bigint,
  p_expected_version integer,
  p_new_status text,
  p_proof_key text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_size_bytes integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp AS $$
DECLARE
  v_actor_id bigint := app.context_user_id();
  v_session_version integer := app.context_session_version();
  v_parcel app.parcel%ROWTYPE;
  v_changed_at timestamptz;
  v_request_id uuid;
  v_final boolean;
BEGIN
  IF v_actor_id IS NULL OR v_session_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT012', MESSAGE = 'Unauthenticated';
  END IF;

  PERFORM app.lock_active_actor(v_actor_id, v_session_version, ARRAY['RIDER'], 'share', false);

  SELECT * INTO v_parcel
  FROM app.parcel
  WHERE id = p_parcel_id AND assigned_rider_id = v_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT002', MESSAGE = 'Parcel not found';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_parcel.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT003', MESSAGE = 'Version conflict';
  END IF;
  IF v_parcel.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Invalid transition';
  END IF;

  v_final := v_parcel.current_status = 'OUT_FOR_DELIVERY' AND p_new_status IN ('DELIVERED', 'FAILED');
  IF v_final THEN
    IF p_proof_key IS NULL OR p_media_type IS NULL OR p_size_bytes IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PT006', MESSAGE = 'Proof required';
    END IF;
    -- The key must be one generated for this parcel, and its extension must match the stored media type.
    IF p_proof_key !~ ('^' || v_parcel.id::text || '/[0-9a-f]{32}\.(jpg|png)$')
       OR (p_media_type = 'image/jpeg') IS DISTINCT FROM (p_proof_key LIKE '%.jpg')
       OR p_media_type NOT IN ('image/jpeg', 'image/png')
       OR p_size_bytes NOT BETWEEN 1 AND 3145728 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid proof metadata';
    END IF;
  ELSIF v_parcel.current_status <> 'ASSIGNED'
     OR p_new_status IS DISTINCT FROM 'OUT_FOR_DELIVERY'
     OR p_proof_key IS NOT NULL OR p_media_type IS NOT NULL OR p_size_bytes IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Invalid transition';
  END IF;

  SELECT GREATEST(clock_timestamp(), max(changed_at)) INTO v_changed_at
  FROM app.parcel_status_history
  WHERE parcel_id = v_parcel.id;
  v_request_id := COALESCE(NULLIF(current_setting('app.request_id', true), '')::uuid, gen_random_uuid());

  IF v_final THEN
    UPDATE app.parcel
    SET current_status = p_new_status, version = version + 1, terminal_at = v_changed_at,
        delivered_at = CASE WHEN p_new_status = 'DELIVERED' THEN v_changed_at END
    WHERE id = v_parcel.id;

    INSERT INTO app.delivery_proof (parcel_id, uploaded_by_id, storage_key, media_type, size_bytes, uploaded_at)
    VALUES (v_parcel.id, v_actor_id, p_proof_key, p_media_type, p_size_bytes, v_changed_at);
  ELSE
    UPDATE app.parcel SET current_status = p_new_status, version = version + 1
    WHERE id = v_parcel.id;
  END IF;

  INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
  VALUES (v_parcel.id, v_actor_id, p_new_status, v_changed_at);

  INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, occurred_at, request_id, details)
  VALUES (v_actor_id, v_parcel.id, 'STATUS_CHANGED', 'SUCCESS', v_changed_at, v_request_id,
          jsonb_build_object('oldStatus', v_parcel.current_status, 'newStatus', p_new_status));

  IF v_final THEN
    -- The storage key stays out of the audit trail; the parcel's proof row holds it.
    INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, occurred_at, request_id, details)
    VALUES (v_actor_id, v_parcel.id, 'PROOF_UPLOADED', 'SUCCESS', v_changed_at, v_request_id,
            jsonb_build_object('mediaType', p_media_type, 'sizeBytes', p_size_bytes));
  END IF;
END;
$$;
ALTER FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) TO app_runtime;
RESET ROLE;
