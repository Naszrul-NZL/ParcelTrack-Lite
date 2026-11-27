-- Revision 0009 `tracking_lookup` (owner: Zikri, M2-PH3-T04). The one function behind public tracking (A13).
-- Follows 0008 in the registered order. Fix-forward only: no applied revision is edited.
--
-- tracking_runtime may execute only this function and has no table access. The owner, lookup_fn_owner, already has
-- exactly the column SELECT grants it needs (0003: parcel id and tracking_number; history id, parcel_id, status and
-- changed_at) and explicit read policies for them, so the function cannot read recipient data, actors or proofs.
-- The token must match exactly (no pattern, no prefix), so a caller cannot enumerate parcels. Rows come back in
-- time order with the history id as tie-break; only status and timestamp leave the function.

SET LOCAL ROLE lookup_fn_owner;
CREATE FUNCTION app.lookup_tracking(p_token text)
 RETURNS TABLE(status text, changed_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
 SELECT h.status, h.changed_at
 FROM app.parcel p
 JOIN app.parcel_status_history h ON h.parcel_id = p.id
 WHERE p_token ~ '^PTL-[0-9A-F]{32}$' AND p.tracking_number = p_token
 ORDER BY h.changed_at, h.id;
$$;
ALTER FUNCTION app.lookup_tracking(text) OWNER TO lookup_fn_owner;
REVOKE ALL ON FUNCTION app.lookup_tracking(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.lookup_tracking(text) TO tracking_runtime;
RESET ROLE;
