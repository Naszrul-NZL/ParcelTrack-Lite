-- USER in the ERD is app_user; shared attributes remain on that superclass.
LOCK TABLE app.app_user,app.parcel,app.parcel_status_history IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE app.seller (
 user_id bigint PRIMARY KEY REFERENCES app.app_user(id) ON DELETE CASCADE
);
CREATE TABLE app.rider (
 user_id bigint PRIMARY KEY REFERENCES app.app_user(id) ON DELETE CASCADE
);
CREATE TABLE app.admin (
 user_id bigint PRIMARY KEY REFERENCES app.app_user(id) ON DELETE CASCADE
);

INSERT INTO app.seller(user_id) SELECT id FROM app.app_user WHERE role='SELLER';
INSERT INTO app.rider(user_id) SELECT id FROM app.app_user WHERE role='RIDER';
INSERT INTO app.admin(user_id) SELECT id FROM app.app_user WHERE role='ADMIN';

GRANT SELECT,INSERT,DELETE ON app.seller,app.rider,app.admin TO auth_fn_owner;
CREATE POLICY seller_auth ON app.seller FOR ALL TO auth_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY rider_auth ON app.rider FOR ALL TO auth_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY admin_auth ON app.admin FOR ALL TO auth_fn_owner USING(true) WITH CHECK(true);

-- Serialize membership changes on the parent. Removing its matching subclass
-- is allowed only during parent deletion or after a role change in this transaction.
CREATE FUNCTION app.enforce_user_subclass() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE parent_role text; parent_id bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Subclass user_id is immutable';
 END IF;
 IF TG_OP='DELETE' THEN parent_id:=OLD.user_id; ELSE parent_id:=NEW.user_id; END IF;
 SELECT role INTO parent_role FROM app.app_user WHERE id=parent_id FOR UPDATE;
 IF TG_OP='DELETE' THEN
  IF parent_role=TG_ARGV[0] THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Every user must retain its matching subclass';
  END IF;
  RETURN OLD;
 END IF;
 IF parent_role IS DISTINCT FROM TG_ARGV[0] THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Subclass must match user role';
 END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION app.enforce_user_subclass() OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.enforce_user_subclass() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enforce_user_subclass() TO auth_fn_owner,migration_owner;
RESET ROLE;
CREATE TRIGGER seller_membership BEFORE INSERT OR UPDATE OR DELETE ON app.seller
 FOR EACH ROW EXECUTE FUNCTION app.enforce_user_subclass('SELLER');
CREATE TRIGGER rider_membership BEFORE INSERT OR UPDATE OR DELETE ON app.rider
 FOR EACH ROW EXECUTE FUNCTION app.enforce_user_subclass('RIDER');
CREATE TRIGGER admin_membership BEFORE INSERT OR UPDATE OR DELETE ON app.admin
 FOR EACH ROW EXECUTE FUNCTION app.enforce_user_subclass('ADMIN');

CREATE FUNCTION app.sync_user_subclass() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 IF NEW.role='SELLER' THEN
  INSERT INTO app.seller(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  DELETE FROM app.rider WHERE user_id=NEW.id;
  DELETE FROM app.admin WHERE user_id=NEW.id;
 ELSIF NEW.role='RIDER' THEN
  INSERT INTO app.rider(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  DELETE FROM app.seller WHERE user_id=NEW.id;
  DELETE FROM app.admin WHERE user_id=NEW.id;
 ELSE
  INSERT INTO app.admin(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  DELETE FROM app.seller WHERE user_id=NEW.id;
  DELETE FROM app.rider WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION app.sync_user_subclass() OWNER TO auth_fn_owner;
SET LOCAL ROLE auth_fn_owner;
REVOKE ALL ON FUNCTION app.sync_user_subclass() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_user_subclass() TO auth_fn_owner,migration_owner;
RESET ROLE;
CREATE TRIGGER user_subclass AFTER INSERT OR UPDATE OF role ON app.app_user
 FOR EACH ROW EXECUTE FUNCTION app.sync_user_subclass();

-- Replacing these constraints validates existing ownership and assignments.
-- Invalid legacy rows abort the migration rather than changing their owners.
-- The table owner must see every parcel during validation. FORCE is restored
-- inside this migration transaction, before any schema changes become visible.
ALTER TABLE app.parcel NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.parcel DROP CONSTRAINT parcel_seller_id_fkey;
ALTER TABLE app.parcel ADD CONSTRAINT parcel_seller_id_fkey
 FOREIGN KEY(seller_id) REFERENCES app.seller(user_id);
ALTER TABLE app.parcel DROP CONSTRAINT parcel_assigned_rider_id_fkey;
ALTER TABLE app.parcel ADD CONSTRAINT parcel_assigned_rider_id_fkey
 FOREIGN KEY(assigned_rider_id) REFERENCES app.rider(user_id);
ALTER TABLE app.parcel FORCE ROW LEVEL SECURITY;
ALTER TABLE app.seller ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.seller FORCE ROW LEVEL SECURITY;
ALTER TABLE app.rider ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rider FORCE ROW LEVEL SECURITY;
ALTER TABLE app.admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin FORCE ROW LEVEL SECURITY;

CREATE TABLE app.delivery_proof (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 parcel_id bigint NOT NULL UNIQUE REFERENCES app.parcel(id),
 uploaded_by_id bigint NOT NULL REFERENCES app.rider(user_id),
 storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[1-9][0-9]{0,17}/[0-9a-f]{32}\.(jpg|png)$'),
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 3145728),
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.delivery_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.delivery_proof FORCE ROW LEVEL SECURITY;
GRANT SELECT ON app.delivery_proof TO app_runtime;
GRANT SELECT,INSERT,UPDATE ON app.delivery_proof TO domain_writer;
GRANT USAGE,SELECT ON SEQUENCE app.delivery_proof_id_seq TO domain_writer;
CREATE POLICY proof_runtime ON app.delivery_proof FOR SELECT TO app_runtime
 USING(EXISTS(SELECT 1 FROM app.parcel p WHERE p.id=parcel_id));
CREATE POLICY proof_domain ON app.delivery_proof FOR ALL TO domain_writer USING(true) WITH CHECK(true);
REVOKE ALL ON app.seller,app.rider,app.admin,app.delivery_proof FROM anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE app.delivery_proof_id_seq FROM anon,authenticated,service_role;

CREATE FUNCTION app.require_parcel_history() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.parcel WHERE id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM app.parcel_status_history WHERE parcel_id=NEW.id AND status='REGISTERED') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Parcel requires initial Registered history in the same transaction';
 END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION app.require_parcel_history() OWNER TO domain_writer;
SET LOCAL ROLE domain_writer;
REVOKE ALL ON FUNCTION app.require_parcel_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_parcel_history() TO domain_writer,migration_owner;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.parcel p WHERE NOT EXISTS(
  SELECT 1 FROM app.parcel_status_history h WHERE h.parcel_id=p.id AND h.status='REGISTERED'
 )) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Existing parcels require initial Registered history before ERD migration';
 END IF;
END;
$$;
RESET ROLE;
CREATE CONSTRAINT TRIGGER parcel_requires_history AFTER INSERT ON app.parcel
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_parcel_history();

CREATE FUNCTION app.reject_history_mutation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Parcel status history is append-only'; END;
$$;
REVOKE ALL ON FUNCTION app.reject_history_mutation() FROM PUBLIC;
CREATE TRIGGER history_append_only BEFORE UPDATE OR DELETE ON app.parcel_status_history
 FOR EACH ROW EXECUTE FUNCTION app.reject_history_mutation();
