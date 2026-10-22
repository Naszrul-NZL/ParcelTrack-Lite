CREATE FUNCTION app.update_delivery_status(p_parcel_id bigint,p_expected_version integer,p_new_status text,p_proof_key text DEFAULT NULL,p_media_type text DEFAULT NULL,p_size_bytes integer DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='Draft only: implement in PH2'; END;
$$;
ALTER FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) OWNER TO domain_writer;
REVOKE ALL ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_delivery_status(bigint,integer,text,text,text,integer) TO app_runtime;
