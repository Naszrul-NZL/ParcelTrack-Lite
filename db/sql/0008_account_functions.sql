-- Revision 0008 `account_functions` (owner: Naszrul, M1). Account creation, password change, disablement and
-- Admin password reset, plus the credential-expiry column and the indexes behind the Admin user and audit lists.
-- Follows 0007 in the registered order. Fix-forward only: no applied revision is edited.

-- Initial and reset passwords expire (72 hours). NULL means the credential does not expire.
ALTER TABLE app.app_user ADD COLUMN credential_expires_at timestamptz;
CREATE INDEX app_user_directory ON app.app_user(role,is_active,created_at DESC,id DESC);
CREATE INDEX audit_event_type_time ON app.audit_event(event_type,occurred_at DESC,id DESC);

-- Login must refuse an expired initial or reset password, so the snapshot reports it.
DROP FUNCTION app.get_login_snapshot(text);
CREATE FUNCTION app.get_login_snapshot(p_username text)
 RETURNS TABLE(id bigint,password_hash text,session_version integer,is_active boolean,must_change_password boolean,credential_expired boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT u.id,u.password_hash,u.session_version,u.is_active,u.must_change_password,
  (u.credential_expires_at IS NOT NULL AND u.credential_expires_at<=pg_catalog.now())
 FROM app.app_user u WHERE u.username=p_username;
$$;
ALTER FUNCTION app.get_login_snapshot(text) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.get_login_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_login_snapshot(text) TO app_runtime;
RESET ROLE;

-- Seller self-registration (no signed-in actor) or Admin creation of a Rider (verified Admin actor). The role is a
-- parameter of this function only, never of the web request: the caller passes SELLER or RIDER and the function
-- decides whether the verified context may create it. Admin accounts come only from the private provision command.
CREATE FUNCTION app.register_account(p_username text,p_display_name text,p_password_hash text,p_role text,p_request_id uuid)
 RETURNS TABLE(id bigint,username text,display_name text,role text,is_active boolean,must_change_password boolean,version integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
#variable_conflict use_column
DECLARE v_actor bigint; v_version integer; v_new app.app_user%ROWTYPE;
BEGIN
 IF p_role NOT IN ('SELLER','RIDER') THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 v_actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::bigint;
 v_version:=NULLIF(pg_catalog.current_setting('app.session_version',true),'')::integer;
 IF p_role='RIDER' THEN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
  PERFORM app.lock_active_actor(v_actor,v_version,ARRAY['ADMIN'],'share');
 ELSIF v_actor IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Forbidden';
 END IF;
 BEGIN
  INSERT INTO app.app_user(username,display_name,password_hash,role,must_change_password,credential_expires_at)
  VALUES(p_username,p_display_name,p_password_hash,p_role,p_role='RIDER',CASE WHEN p_role='RIDER' THEN pg_catalog.now()+interval '72 hours' END)
  RETURNING * INTO v_new;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='PT011',MESSAGE='Username taken';
 END;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
 VALUES(COALESCE(v_actor,v_new.id),v_new.id,'USER_CREATED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('role',p_role));
 RETURN QUERY SELECT v_new.id,v_new.username,v_new.display_name,v_new.role,v_new.is_active,v_new.must_change_password,v_new.version;
END;
$$;
ALTER FUNCTION app.register_account(text,text,text,text,uuid) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.register_account(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.register_account(text,text,text,text,uuid) TO app_runtime;
RESET ROLE;

-- The caller changes their own password. The service verified the current password against the hash it read from
-- get_login_snapshot and passes that hash back, so a change made in between is detected under the row lock.
CREATE FUNCTION app.change_password(p_expected_hash text,p_new_hash text,p_request_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_actor bigint; v_version integer; v_current text;
BEGIN
 v_actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::bigint;
 v_version:=NULLIF(pg_catalog.current_setting('app.session_version',true),'')::integer;
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
 -- A must-change account is allowed to reach this function.
 PERFORM app.lock_active_actor(v_actor,v_version,ARRAY['SELLER','RIDER','ADMIN'],'update',true);
 SELECT u.password_hash INTO v_current FROM app.app_user u WHERE u.id=v_actor;
 IF v_current IS DISTINCT FROM p_expected_hash THEN RAISE EXCEPTION USING ERRCODE='PT003',MESSAGE='Credential changed'; END IF;
 UPDATE app.app_user u SET password_hash=p_new_hash,must_change_password=false,credential_expires_at=NULL,version=u.version+1,session_version=u.session_version+1 WHERE u.id=v_actor;
 DELETE FROM app.auth_session s WHERE s.user_id=v_actor;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
 VALUES(v_actor,v_actor,'PASSWORD_CHANGED','SUCCESS',p_request_id,'{}');
END;
$$;
ALTER FUNCTION app.change_password(text,text,uuid) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.change_password(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.change_password(text,text,uuid) TO app_runtime;
RESET ROLE;

-- Admin disables or reactivates a Seller or Rider. Lock order: acting Admin, then the target. Every call bumps the
-- target's session_version and deletes their sessions, so reactivation never revives an old cookie.
CREATE FUNCTION app.set_user_active(p_target_id bigint,p_is_active boolean,p_expected_version integer,p_request_id uuid)
 RETURNS TABLE(id bigint,username text,display_name text,role text,is_active boolean,must_change_password boolean,version integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
#variable_conflict use_column
DECLARE v_actor bigint; v_version integer; v_target app.app_user%ROWTYPE;
BEGIN
 v_actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::bigint;
 v_version:=NULLIF(pg_catalog.current_setting('app.session_version',true),'')::integer;
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
 PERFORM app.lock_active_actor(v_actor,v_version,ARRAY['ADMIN'],'share');
 IF p_target_id=v_actor THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 SELECT * INTO v_target FROM app.app_user u WHERE u.id=p_target_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='Not found'; END IF;
 IF v_target.role='ADMIN' THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 IF v_target.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION USING ERRCODE='PT003',MESSAGE='Version conflict'; END IF;
 UPDATE app.app_user u SET is_active=p_is_active,version=u.version+1,session_version=u.session_version+1 WHERE u.id=p_target_id RETURNING * INTO v_target;
 DELETE FROM app.auth_session s WHERE s.user_id=p_target_id;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
 VALUES(v_actor,p_target_id,'USER_STATUS_CHANGED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('isActive',p_is_active));
 RETURN QUERY SELECT v_target.id,v_target.username,v_target.display_name,v_target.role,v_target.is_active,v_target.must_change_password,v_target.version;
END;
$$;
ALTER FUNCTION app.set_user_active(bigint,boolean,integer,uuid) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.set_user_active(bigint,boolean,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_user_active(bigint,boolean,integer,uuid) TO app_runtime;
RESET ROLE;

-- Admin sets a one-time password for a Seller or Rider (A21). The service generates the password, hashes it and
-- returns it to the Admin once; only the hash reaches this function.
CREATE FUNCTION app.admin_reset_password(p_target_id bigint,p_new_hash text,p_request_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_actor bigint; v_version integer; v_role text;
BEGIN
 v_actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::bigint;
 v_version:=NULLIF(pg_catalog.current_setting('app.session_version',true),'')::integer;
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT012',MESSAGE='Unauthenticated'; END IF;
 PERFORM app.lock_active_actor(v_actor,v_version,ARRAY['ADMIN'],'share');
 IF p_target_id=v_actor THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 SELECT u.role INTO v_role FROM app.app_user u WHERE u.id=p_target_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='Not found'; END IF;
 IF v_role='ADMIN' THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 UPDATE app.app_user u SET password_hash=p_new_hash,must_change_password=true,credential_expires_at=pg_catalog.now()+interval '72 hours',version=u.version+1,session_version=u.session_version+1 WHERE u.id=p_target_id;
 DELETE FROM app.auth_session s WHERE s.user_id=p_target_id;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
 VALUES(v_actor,p_target_id,'PASSWORD_RESET','SUCCESS',p_request_id,'{}');
END;
$$;
ALTER FUNCTION app.admin_reset_password(bigint,text,uuid) OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.admin_reset_password(bigint,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_reset_password(bigint,text,uuid) TO app_runtime;
RESET ROLE;
