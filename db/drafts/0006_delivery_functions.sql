-- Draft revision 0006. Apply in the migration chain only after 0005 merges.
GRANT EXECUTE ON FUNCTION app.context_user_id(), app.context_session_version() TO domain_writer;

SET LOCAL ROLE domain_writer;
CREATE FUNCTION app.update_delivery_status(
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

  IF v_parcel.current_status = 'OUT_FOR_DELIVERY' AND p_new_status IN ('DELIVERED', 'FAILED') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT006', MESSAGE = 'Proof required';
  END IF;
  IF v_parcel.current_status <> 'ASSIGNED'
     OR p_new_status IS DISTINCT FROM 'OUT_FOR_DELIVERY'
     OR p_proof_key IS NOT NULL OR p_media_type IS NOT NULL OR p_size_bytes IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT004', MESSAGE = 'Invalid transition';
  END IF;

  SELECT GREATEST(clock_timestamp(), max(changed_at)) INTO v_changed_at
  FROM app.parcel_status_history
  WHERE parcel_id = v_parcel.id;
  v_request_id := COALESCE(NULLIF(current_setting('app.request_id', true), '')::uuid, gen_random_uuid());

  UPDATE app.parcel SET current_status = p_new_status, version = version + 1
  WHERE id = v_parcel.id;

  INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
  VALUES (v_parcel.id, v_actor_id, p_new_status, v_changed_at);

  INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, occurred_at, request_id, details)
  VALUES (v_actor_id, v_parcel.id, 'STATUS_CHANGED', 'SUCCESS', v_changed_at, v_request_id,
          jsonb_build_object('oldStatus', v_parcel.current_status, 'newStatus', p_new_status));
END;
$$;
ALTER FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer)
  FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) TO app_runtime;
RESET ROLE;
