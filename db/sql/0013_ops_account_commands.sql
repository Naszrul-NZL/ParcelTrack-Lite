-- Revision 0013 `ops_account_commands` (owner: Naszrul, M1). The private account commands used for incidents and for
-- recovery after a restore: lock an account of any role, recover it, purge sessions, force a password change, and
-- quarantine every account after a restore. Owned by `ops_fn_owner`, executable only by `ops_runtime`; none of them is
-- reachable from the web service. Follows 0012 in the registered order. Fix-forward only.

-- Locks any account, Admins included. Idempotent: an account that is already disabled changes nothing.
CREATE FUNCTION app.lock_account(p_username text,p_request_id uuid)
 RETURNS TABLE(id bigint,changed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_id bigint; v_active boolean;
BEGIN
 SELECT u.id,u.is_active INTO v_id,v_active FROM app.app_user u WHERE u.username=p_username FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='Not found'; END IF;
 IF NOT v_active THEN RETURN QUERY SELECT v_id,false; RETURN; END IF;
 UPDATE app.app_user u SET is_active=false,version=u.version+1,session_version=u.session_version+1 WHERE u.id=v_id;
 DELETE FROM app.auth_session s WHERE s.user_id=v_id;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
  VALUES(NULL,v_id,'ACCOUNT_LOCKED','SUCCESS',p_request_id,'{}');
 RETURN QUERY SELECT v_id,true;
END;
$$;
ALTER FUNCTION app.lock_account(text,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.lock_account(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_account(text,uuid) TO ops_runtime;
RESET ROLE;

-- Recovers an account: new password hash, active again, must change the password at next sign-in, every session ended.
-- A Seller or Rider gets the usual 72-hour expiry; an Admin's does not expire, because nobody can reset an Admin online.
CREATE FUNCTION app.recover_account(p_username text,p_new_hash text,p_request_id uuid)
 RETURNS TABLE(id bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_id bigint; v_role text;
BEGIN
 IF p_new_hash !~ '^\$argon2id\$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid password hash'; END IF;
 SELECT u.id,u.role INTO v_id,v_role FROM app.app_user u WHERE u.username=p_username FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='Not found'; END IF;
 UPDATE app.app_user u SET password_hash=p_new_hash,is_active=true,must_change_password=true,
   credential_expires_at=CASE WHEN v_role='ADMIN' THEN NULL ELSE pg_catalog.now()+interval '72 hours' END,
   version=u.version+1,session_version=u.session_version+1 WHERE u.id=v_id;
 DELETE FROM app.auth_session s WHERE s.user_id=v_id;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
  VALUES(NULL,v_id,'ACCOUNT_RECOVERED','SUCCESS',p_request_id,'{}');
 RETURN QUERY SELECT v_id;
END;
$$;
ALTER FUNCTION app.recover_account(text,text,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.recover_account(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recover_account(text,text,uuid) TO ops_runtime;
RESET ROLE;

-- Ends every session of one account, or of all accounts when no username is given (anonymous sessions included).
CREATE FUNCTION app.purge_sessions(p_username text,p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_id bigint; v_count integer;
BEGIN
 IF p_username IS NULL THEN
  DELETE FROM app.auth_session;
  GET DIAGNOSTICS v_count=ROW_COUNT;
 ELSE
  SELECT u.id INTO v_id FROM app.app_user u WHERE u.username=p_username;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='Not found'; END IF;
  DELETE FROM app.auth_session s WHERE s.user_id=v_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
 END IF;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
  VALUES(NULL,v_id,'SESSIONS_PURGED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('reason',CASE WHEN p_username IS NULL THEN 'all' ELSE 'account' END));
 RETURN v_count;
END;
$$;
ALTER FUNCTION app.purge_sessions(text,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.purge_sessions(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_sessions(text,uuid) TO ops_runtime;
RESET ROLE;

-- After a restore the stored hash of an account whose password changed since the backup is stale: force a change and
-- end its sessions. Looked up by user ID, because that is what the account journal holds.
CREATE FUNCTION app.force_password_change(p_user_id bigint,p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 UPDATE app.app_user u SET must_change_password=true,version=u.version+1,session_version=u.session_version+1 WHERE u.id=p_user_id;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM app.auth_session s WHERE s.user_id=p_user_id;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
  VALUES(NULL,p_user_id,'SESSIONS_PURGED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('reason','restore'));
 RETURN true;
END;
$$;
ALTER FUNCTION app.force_password_change(bigint,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.force_password_change(bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.force_password_change(bigint,uuid) TO ops_runtime;
RESET ROLE;

-- Re-disables an account by user ID after a restore (the journal says it was disabled after the backup). Idempotent.
CREATE FUNCTION app.lock_account_by_id(p_user_id bigint,p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_username text;
BEGIN
 SELECT u.username INTO v_username FROM app.app_user u WHERE u.id=p_user_id;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN (SELECT l.changed FROM app.lock_account(v_username,p_request_id) l);
END;
$$;
ALTER FUNCTION app.lock_account_by_id(bigint,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.lock_account_by_id(bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_account_by_id(bigint,uuid) TO ops_runtime;
RESET ROLE;

-- When the journal is unavailable after a restore: disable every Rider, force a password change for everyone and end all
-- sessions. An Admin then re-enables Riders against the staff roster.
CREATE FUNCTION app.quarantine_after_restore(p_request_id uuid)
 RETURNS TABLE(riders_disabled integer,accounts_flagged integer,sessions_ended integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_riders integer; v_flagged integer; v_sessions integer;
BEGIN
 UPDATE app.app_user u SET is_active=false,version=u.version+1 WHERE u.role='RIDER' AND u.is_active;
 GET DIAGNOSTICS v_riders=ROW_COUNT;
 UPDATE app.app_user u SET must_change_password=true,version=u.version+1,session_version=u.session_version+1;
 GET DIAGNOSTICS v_flagged=ROW_COUNT;
 DELETE FROM app.auth_session;
 GET DIAGNOSTICS v_sessions=ROW_COUNT;
 INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
  VALUES(NULL,NULL,'SESSIONS_PURGED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('reason','quarantine'));
 RETURN QUERY SELECT v_riders,v_flagged,v_sessions;
END;
$$;
ALTER FUNCTION app.quarantine_after_restore(uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.quarantine_after_restore(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.quarantine_after_restore(uuid) TO ops_runtime;
RESET ROLE;

-- Whether an account with this ID exists. `ops_runtime` reads no account rows, so the restore reconciliation asks here
-- which journaled accounts are missing from the restored database.
CREATE FUNCTION app.account_exists(p_user_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM app.app_user u WHERE u.id=p_user_id);
$$;
ALTER FUNCTION app.account_exists(bigint) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.account_exists(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_exists(bigint) TO ops_runtime;
RESET ROLE;
