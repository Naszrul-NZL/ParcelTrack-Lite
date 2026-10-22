CREATE TABLE app.app_user (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,50}$'),
 display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
 password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
 role text NOT NULL CHECK (role IN ('SELLER','RIDER','ADMIN')),
 is_active boolean NOT NULL DEFAULT true,
 must_change_password boolean NOT NULL DEFAULT false,
 session_version integer NOT NULL DEFAULT 1 CHECK (session_version>=1),
 version integer NOT NULL DEFAULT 1 CHECK (version>=1),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.auth_session (
 token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 user_id bigint REFERENCES app.app_user(id),
 user_session_version integer CHECK (user_session_version>0),
 csrf_token text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 absolute_expires_at timestamptz NOT NULL,
 CHECK (expires_at>created_at AND absolute_expires_at>=expires_at),
 CHECK ((user_id IS NULL)=(user_session_version IS NULL))
);
CREATE INDEX auth_session_expiry ON app.auth_session(expires_at);
CREATE INDEX auth_session_user ON app.auth_session(user_id);
CREATE TABLE app.rate_limit_bucket (
 bucket_type text NOT NULL,
 identity_digest text NOT NULL CHECK (identity_digest ~ '^[0-9a-f]{64}$'),
 window_id bigint NOT NULL,
 counter integer NOT NULL CHECK (counter>=0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(bucket_type,identity_digest,window_id)
);
CREATE INDEX rate_limit_expiry ON app.rate_limit_bucket(expires_at);
CREATE TABLE app.audit_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id bigint REFERENCES app.app_user(id),
 target_user_id bigint REFERENCES app.app_user(id),
 parcel_id bigint,
 event_type text NOT NULL CHECK (event_type IN ('LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_THROTTLED','LOGOUT','PASSWORD_CHANGED','PASSWORD_RESET','USER_CREATED','USER_STATUS_CHANGED','ACCOUNT_LOCKED','ACCOUNT_RECOVERED','SESSIONS_PURGED','PARCEL_REGISTERED','PARCEL_ASSIGNED','PARCEL_REASSIGNED','STATUS_CHANGED','PROOF_UPLOADED','PARCEL_VIEWED','PROOF_VIEWED','RETENTION_ANONYMIZED','PROOF_PURGED')),
 outcome text NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,
 details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details)='object')
);
CREATE INDEX audit_event_time ON app.audit_event(occurred_at,id);
CREATE TABLE app.system_state (
 id integer PRIMARY KEY CHECK (id=1),
 maintenance_mode boolean NOT NULL DEFAULT false,
 set_until timestamptz
);
INSERT INTO app.system_state(id) VALUES(1);

GRANT SELECT(id,username,display_name,role,is_active,must_change_password,session_version,version,created_at) ON app.app_user TO app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.auth_session,app.rate_limit_bucket TO app_runtime;
GRANT INSERT ON app.audit_event TO app_runtime,domain_writer;
GRANT SELECT ON app.system_state TO app_runtime,domain_writer,maintenance_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA app TO auth_fn_owner,domain_writer,ops_fn_owner;
GRANT SELECT,INSERT,UPDATE ON app.app_user TO auth_fn_owner,ops_fn_owner;
GRANT SELECT,DELETE ON app.auth_session TO auth_fn_owner,ops_fn_owner;
GRANT INSERT ON app.audit_event TO auth_fn_owner,ops_fn_owner;
GRANT SELECT,UPDATE ON app.system_state TO ops_fn_owner;

CREATE FUNCTION app.reject_audit_mutation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Audit is append-only'; END;
$$;
REVOKE ALL ON FUNCTION app.reject_audit_mutation() FROM PUBLIC;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

CREATE FUNCTION app.lock_active_actor(p_user_id bigint,p_session_version integer,p_allowed_roles text[],p_mode text DEFAULT 'share',p_allow_must_change boolean DEFAULT false)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE u app.app_user%ROWTYPE;
BEGIN
 IF p_mode='share' THEN SELECT * INTO u FROM app.app_user WHERE id=p_user_id FOR SHARE;
 ELSIF p_mode='update' THEN SELECT * INTO u FROM app.app_user WHERE id=p_user_id FOR UPDATE;
 ELSE RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Forbidden'; END IF;
 IF NOT FOUND OR NOT u.is_active OR u.session_version<>p_session_version THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
 IF NOT (u.role=ANY(p_allowed_roles)) THEN RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Forbidden'; END IF;
 IF u.must_change_password AND NOT p_allow_must_change THEN RAISE EXCEPTION USING ERRCODE='PT008',MESSAGE='Password change required'; END IF;
 RETURN u.role;
END;
$$;
ALTER FUNCTION app.lock_active_actor(bigint,integer,text[],text,boolean) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.lock_active_actor(bigint,integer,text[],text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_active_actor(bigint,integer,text[],text,boolean) TO domain_writer;
RESET ROLE;

CREATE FUNCTION app.get_login_snapshot(p_username text)
 RETURNS TABLE(id bigint,password_hash text,session_version integer,is_active boolean,must_change_password boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT u.id,u.password_hash,u.session_version,u.is_active,u.must_change_password FROM app.app_user u WHERE u.username=p_username;
$$;
ALTER FUNCTION app.get_login_snapshot(text) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.get_login_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_login_snapshot(text) TO app_runtime;
RESET ROLE;
