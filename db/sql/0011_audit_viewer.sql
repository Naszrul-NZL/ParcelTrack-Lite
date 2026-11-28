-- Revision 0011 `audit_viewer` (owner: Naszrul, M1). The Admin audit list (A20) reads `app.audit_event`, which the
-- runtime role cannot select from. This function is the only read path: it re-verifies the acting Admin under the same
-- actor lock as every other privileged function and returns allowlisted fields only. Fix-forward only.

GRANT SELECT ON app.audit_event TO auth_fn_owner;

CREATE FUNCTION app.list_audit_events(p_event_type text,p_parcel_id bigint,p_page integer,p_page_size integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_actor bigint; v_version integer; v_total bigint; v_items jsonb;
BEGIN
 v_actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::bigint;
 v_version:=NULLIF(pg_catalog.current_setting('app.session_version',true),'')::integer;
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
 PERFORM app.lock_active_actor(v_actor,v_version,ARRAY['ADMIN'],'share');
 IF p_page<1 OR p_page>100000 OR p_page_size<1 OR p_page_size>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid page'; END IF;

 SELECT pg_catalog.count(*) INTO v_total FROM app.audit_event e
  WHERE (p_event_type IS NULL OR e.event_type=p_event_type) AND (p_parcel_id IS NULL OR e.parcel_id=p_parcel_id);

 -- Only these detail keys, and only short scalar values, ever leave the database. A writer that stored anything else
 -- (a request body, a token) would still not reach the client.
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',s.id::text,'eventType',s.event_type,'outcome',s.outcome,
   'actorId',s.actor_id::text,'targetUserId',s.target_user_id::text,'parcelId',s.parcel_id::text,
   'occurredAt',pg_catalog.to_char(s.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'requestId',s.request_id::text,
   'details',COALESCE((SELECT pg_catalog.jsonb_object_agg(d.key,d.value) FROM pg_catalog.jsonb_each(s.details) d
     WHERE d.key=ANY(ARRAY['scope','reason','usernameDigest','usernameLength','retryAfter','role','isActive','oldStatus','newStatus','status','oldRiderId','newRiderId','mediaType','sizeBytes'])
       AND ((pg_catalog.jsonb_typeof(d.value)='string' AND pg_catalog.length(d.value #>> '{}')<=128) OR pg_catalog.jsonb_typeof(d.value) IN ('number','boolean'))),'{}'::jsonb)
  ) ORDER BY s.occurred_at DESC,s.id DESC),'[]'::jsonb) INTO v_items
 FROM (SELECT e.* FROM app.audit_event e
        WHERE (p_event_type IS NULL OR e.event_type=p_event_type) AND (p_parcel_id IS NULL OR e.parcel_id=p_parcel_id)
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT p_page_size OFFSET (p_page-1)*p_page_size) s;

 RETURN pg_catalog.jsonb_build_object('items',v_items,'page',p_page,'pageSize',p_page_size,'total',v_total);
END;
$$;
ALTER FUNCTION app.list_audit_events(text,bigint,integer,integer) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.list_audit_events(text,bigint,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_audit_events(text,bigint,integer,integer) TO app_runtime;
RESET ROLE;
