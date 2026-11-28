-- Revision 0012 `ops_functions` (owner: Naszrul, M1). The private operations commands: creating the first named Admin
-- and switching maintenance mode. Both are owned by `ops_fn_owner` and executable only by `ops_runtime`, the login role
-- of the private command line; neither is reachable from the web service. Follows 0011 in the registered order.
-- Fix-forward only: no applied revision is edited.

-- Admin accounts exist only through this function (A08 creates Riders and A02 Sellers). A rerun for an existing Admin
-- changes nothing and reports `created = false`; a username held by a Seller or Rider is refused, never converted.
-- The first password must be changed at first sign-in. It does not expire: nobody can reset an Admin through the web,
-- so a lapsed Admin credential would lock the case study out of its own staff accounts.
CREATE FUNCTION app.provision_admin(p_username text,p_display_name text,p_password_hash text,p_request_id uuid)
 RETURNS TABLE(id bigint,created boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE v_id bigint; v_role text;
BEGIN
 IF p_username !~ '^[a-z0-9._-]{3,50}$' OR pg_catalog.char_length(pg_catalog.btrim(p_display_name)) NOT BETWEEN 1 AND 80
    OR p_password_hash !~ '^\$argon2id\$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid Admin details';
 END IF;
 INSERT INTO app.app_user(username,display_name,password_hash,role,must_change_password)
  VALUES(p_username,pg_catalog.btrim(p_display_name),p_password_hash,'ADMIN',true)
  ON CONFLICT DO NOTHING RETURNING app.app_user.id INTO v_id;
 IF v_id IS NOT NULL THEN
  INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details)
   VALUES(NULL,v_id,'USER_CREATED','SUCCESS',p_request_id,pg_catalog.jsonb_build_object('role','ADMIN'));
  RETURN QUERY SELECT v_id,true;
  RETURN;
 END IF;
 SELECT u.id,u.role INTO v_id,v_role FROM app.app_user u WHERE u.username=p_username;
 IF v_role IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION USING ERRCODE='PT007',MESSAGE='Target not allowed'; END IF;
 RETURN QUERY SELECT v_id,false;
END;
$$;
ALTER FUNCTION app.provision_admin(text,text,text,uuid) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.provision_admin(text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provision_admin(text,text,text,uuid) TO ops_runtime;
RESET ROLE;

-- Maintenance mode always has an expiry (at most 24 hours ahead), so a forgotten flag cannot block writes for good.
CREATE FUNCTION app.set_maintenance_mode(p_enabled boolean,p_until timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 IF p_enabled THEN
  IF p_until IS NULL OR p_until<=pg_catalog.now() OR p_until>pg_catalog.now()+interval '24 hours' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Maintenance needs an expiry within 24 hours';
  END IF;
  UPDATE app.system_state s SET maintenance_mode=true,set_until=p_until WHERE s.id=1;
 ELSE
  UPDATE app.system_state s SET maintenance_mode=false,set_until=NULL WHERE s.id=1;
 END IF;
END;
$$;
ALTER FUNCTION app.set_maintenance_mode(boolean,timestamptz) OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.set_maintenance_mode(boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_maintenance_mode(boolean,timestamptz) TO ops_runtime;
RESET ROLE;

CREATE FUNCTION app.get_maintenance_state()
 RETURNS TABLE(maintenance_mode boolean,set_until timestamptz,active boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT s.maintenance_mode,s.set_until,(s.maintenance_mode AND s.set_until IS NOT NULL AND s.set_until>pg_catalog.now()) FROM app.system_state s WHERE s.id=1;
$$;
ALTER FUNCTION app.get_maintenance_state() OWNER TO ops_fn_owner;
SET LOCAL ROLE ops_fn_owner;
REVOKE ALL ON FUNCTION app.get_maintenance_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_maintenance_state() TO ops_runtime;
RESET ROLE;
