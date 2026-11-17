# Delivery migration drafts

These signatures reserve the remaining M3 surface after the planned `0005_create_parcel`. They are outside db/migrations and are never applied by normal startup or migration commands. The agreed schema is implemented by `0004_integrated_erd`, including subclass tables and delivery proof metadata. Live status/assignment endpoints remain later work.

- 0006: update_delivery_status(parcel_id, expected_version, new_status, proof_key, proof_media_type, proof_size); start-delivery behavior is Phase 2.
- Delivery proof table, forced RLS, private metadata grants and one-proof constraints are no longer drafts; they are in `db/sql/0004_integrated_erd.sql`.
- 0007: assign_parcel, lock_delivery_target, lock_parcel_for_reconcile and proof_key_is_referenced; final proof/history compensation is Phase 3/4.

- account_functions (M1 PH3, working draft, not a stub): `register_account`, `change_password`, `set_user_active`, `admin_reset_password`, the 72-hour `credential_expires_at` column, `get_login_snapshot` with `credential_expired`, and the directory/audit indexes. It follows 0007 in the registered order, so it is applied only by `tests/integration/account-functions.test.ts` until 0005 to 0007 merge; then it moves to `db/sql` with the next revision number.

Use the common hardening template, account-before-parcel lock order, transaction-local actor/version, immutable object keys, and the documented SQLSTATE registry. The draft below deliberately raises an unsupported error; it is not a production function or successful implementation.
