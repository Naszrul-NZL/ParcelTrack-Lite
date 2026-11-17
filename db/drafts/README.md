# Delivery migration drafts

These signatures reserve the remaining M3 surface after the planned `0005_create_parcel`. They are outside db/migrations and are never applied by normal startup or migration commands. The agreed schema is implemented by `0004_integrated_erd`, including subclass tables and delivery proof metadata. Live status/assignment endpoints remain later work.

- 0006: `update_delivery_status(parcel_id, expected_version, new_status, proof_key, proof_media_type, proof_size)` implements the PH2 Start delivery branch in the draft. The isolated tests apply it only in per-case databases. Promote it to the migration chain after `0005_create_parcel` merges.
- Delivery proof table, forced RLS, private metadata grants and one-proof constraints are no longer drafts; they are in `db/sql/0004_integrated_erd.sql`.
- 0007: `assign_parcel`, `lock_delivery_target` and the final-outcome branch of `update_delivery_status` run as `domain_writer` in Phase 3.
- The Phase 4 `proof_maintenance_functions` revision defines `lock_parcel_for_reconcile` and `proof_key_is_referenced` with owner `maintenance_fn_owner` and execute limited to `maintenance_runtime`.

Use the common hardening template, account-before-parcel lock order, transaction-local actor/version, immutable object keys, and the documented SQLSTATE registry. See the [contract role matrix](../../docs/shared/system-contract.md) and [finalization design](0007_delivery_final.md).

The A17 handler sets `app.request_id` from the server-generated request ID within the transaction, so the audit row can be correlated with the response. A direct SQL invocation without an HTTP request ID generates one in PostgreSQL.
