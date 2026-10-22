CREATE TABLE app.parcel (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tracking_number text NOT NULL UNIQUE CHECK(tracking_number ~ '^PTL-[0-9A-F]{32}$'),
 seller_id bigint NOT NULL REFERENCES app.app_user(id),
 assigned_rider_id bigint REFERENCES app.app_user(id),
 recipient_name text,
 recipient_phone text,
 recipient_address text,
 weight_kg numeric(8,3) NOT NULL CHECK(weight_kg BETWEEN 0.001 AND 100.000),
 current_status text NOT NULL CHECK(current_status IN ('REGISTERED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 client_request_id uuid NOT NULL,
 creation_fingerprint text,
 created_at timestamptz NOT NULL DEFAULT now(),
 terminal_at timestamptz,delivered_at timestamptz,anonymized_at timestamptz,
 UNIQUE(seller_id,client_request_id),
 CHECK(anonymized_at IS NOT NULL OR (recipient_name IS NOT NULL AND recipient_phone IS NOT NULL AND recipient_address IS NOT NULL AND creation_fingerprint IS NOT NULL)),
 CHECK(recipient_name IS NULL OR char_length(recipient_name) BETWEEN 1 AND 120),
 CHECK(recipient_address IS NULL OR char_length(recipient_address) BETWEEN 1 AND 500),
 CHECK(recipient_phone IS NULL OR recipient_phone ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE TABLE app.parcel_status_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 parcel_id bigint NOT NULL REFERENCES app.parcel(id),
 changed_by_id bigint NOT NULL REFERENCES app.app_user(id),
 status text NOT NULL CHECK(status IN ('REGISTERED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED')),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.audit_event ADD CONSTRAINT audit_event_parcel_fk FOREIGN KEY(parcel_id) REFERENCES app.parcel(id);
CREATE INDEX parcel_seller ON app.parcel(seller_id,current_status,created_at DESC,id DESC);
CREATE INDEX parcel_rider ON app.parcel(assigned_rider_id,current_status,created_at DESC,id DESC);
CREATE INDEX history_parcel ON app.parcel_status_history(parcel_id,changed_at,id);
CREATE INDEX parcel_retention ON app.parcel(terminal_at) WHERE anonymized_at IS NULL;

CREATE FUNCTION app.context_user_id() RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT CASE WHEN current_setting('app.user_id',true) ~ '^[1-9][0-9]{0,17}$' THEN current_setting('app.user_id',true)::bigint ELSE NULL END;
$$;
CREATE FUNCTION app.context_session_version() RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT CASE WHEN current_setting('app.session_version',true) ~ '^[1-9][0-9]{0,8}$' THEN current_setting('app.session_version',true)::integer ELSE NULL END;
$$;
CREATE FUNCTION app.current_principal_role() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT u.role FROM app.app_user u WHERE u.id=app.context_user_id() AND u.session_version=app.context_session_version() AND u.is_active AND NOT u.must_change_password;
$$;
REVOKE ALL ON FUNCTION app.context_user_id(),app.context_session_version(),app.current_principal_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.context_user_id(),app.context_session_version(),app.current_principal_role() TO app_runtime;
ALTER TABLE app.parcel ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.parcel FORCE ROW LEVEL SECURITY;
ALTER TABLE app.parcel_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.parcel_status_history FORCE ROW LEVEL SECURITY;
GRANT SELECT ON app.parcel,app.parcel_status_history TO app_runtime;
GRANT SELECT,INSERT,UPDATE ON app.parcel,app.parcel_status_history TO domain_writer;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA app TO domain_writer;
GRANT SELECT(id,tracking_number) ON app.parcel TO lookup_fn_owner;
GRANT SELECT(id,parcel_id,status,changed_at) ON app.parcel_status_history TO lookup_fn_owner;
GRANT SELECT ON app.parcel TO maintenance_fn_owner;
GRANT UPDATE(recipient_name,recipient_phone,recipient_address,creation_fingerprint,anonymized_at,version) ON app.parcel TO maintenance_fn_owner;
CREATE POLICY parcel_runtime_read ON app.parcel FOR SELECT TO app_runtime USING (
 (SELECT app.current_principal_role())='ADMIN'
 OR ((SELECT app.current_principal_role())='SELLER' AND seller_id=(SELECT app.context_user_id()))
 OR ((SELECT app.current_principal_role())='RIDER' AND assigned_rider_id=(SELECT app.context_user_id()))
);
CREATE POLICY history_runtime_read ON app.parcel_status_history FOR SELECT TO app_runtime USING (EXISTS(SELECT 1 FROM app.parcel p WHERE p.id=parcel_id));
CREATE POLICY parcel_domain ON app.parcel FOR ALL TO domain_writer USING(true) WITH CHECK(true);
CREATE POLICY history_domain ON app.parcel_status_history FOR ALL TO domain_writer USING(true) WITH CHECK(true);
CREATE POLICY parcel_lookup ON app.parcel FOR SELECT TO lookup_fn_owner USING(true);
CREATE POLICY history_lookup ON app.parcel_status_history FOR SELECT TO lookup_fn_owner USING(true);
CREATE POLICY parcel_maintenance ON app.parcel FOR ALL TO maintenance_fn_owner USING(true) WITH CHECK(true);
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.context_user_id(),app.context_session_version(),app.current_principal_role() FROM anon,authenticated,service_role;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.lock_active_actor(bigint,integer,text[],text,boolean),app.get_login_snapshot(text) FROM anon,authenticated,service_role;
RESET ROLE;
REVOKE ALL ON SCHEMA app FROM anon,authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO backup_operator;
