GRANT EXECUTE ON FUNCTION app.context_user_id(), app.context_session_version() TO domain_writer;

SET LOCAL ROLE domain_writer;
CREATE FUNCTION app.create_parcel(
  p_recipient_name text,
  p_recipient_phone text,
  p_recipient_address text,
  p_weight_kg numeric,
  p_client_request_id uuid,
  p_creation_fingerprint text,
  p_tracking_number text,
  p_request_id uuid
)
RETURNS app.parcel
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp AS $$
DECLARE
  v_seller_id bigint := app.context_user_id();
  v_session_version integer := app.context_session_version();
  v_created_at timestamptz;
  v_parcel app.parcel%ROWTYPE;
BEGIN
  IF v_seller_id IS NULL OR v_session_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT012', MESSAGE = 'Unauthenticated';
  END IF;
  PERFORM app.lock_active_actor(v_seller_id, v_session_version, ARRAY['SELLER'], 'share', false);

  IF p_weight_kg IS NULL OR p_weight_kg NOT BETWEEN 0.001 AND 100
     OR scale(p_weight_kg) > 3
     OR p_creation_fingerprint IS NULL OR p_creation_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid parcel fields';
  END IF;

  v_created_at := clock_timestamp();
  INSERT INTO app.parcel (
    tracking_number, seller_id, recipient_name, recipient_phone, recipient_address, weight_kg,
    current_status, client_request_id, creation_fingerprint, created_at
  ) VALUES (
    p_tracking_number, v_seller_id, p_recipient_name, p_recipient_phone, p_recipient_address, p_weight_kg,
    'REGISTERED', p_client_request_id, p_creation_fingerprint, v_created_at
  )
  ON CONFLICT (seller_id, client_request_id) DO NOTHING
  RETURNING * INTO v_parcel;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT009', MESSAGE = 'Client request already used';
  END IF;

  INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
  VALUES (v_parcel.id, v_seller_id, 'REGISTERED', v_created_at);

  INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, occurred_at, request_id)
  VALUES (v_seller_id, v_parcel.id, 'PARCEL_REGISTERED', 'SUCCESS', v_created_at, p_request_id);
  RETURN v_parcel;
END;
$$;
ALTER FUNCTION app.create_parcel(text,text,text,numeric,uuid,text,text,uuid) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.create_parcel(text,text,text,numeric,uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.create_parcel(text,text,text,numeric,uuid,text,text,uuid) TO app_runtime;
RESET ROLE;
