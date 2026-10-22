-- Draft only; apply in PH3 after the preceding reviewed domain revisions.
CREATE TABLE app.delivery_proof (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 parcel_id bigint NOT NULL UNIQUE REFERENCES app.parcel(id),
 uploaded_by_id bigint NOT NULL REFERENCES app.app_user(id),
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
CREATE POLICY proof_runtime ON app.delivery_proof FOR SELECT TO app_runtime USING(EXISTS(SELECT 1 FROM app.parcel p WHERE p.id=parcel_id));
CREATE POLICY proof_domain ON app.delivery_proof FOR ALL TO domain_writer USING(true) WITH CHECK(true);
