# Delivery migration drafts

These signatures reserve the M3 surface after migration 0004. They are outside db/migrations and are never applied by normal startup or migration commands. Phase 1 implements pure transition/assignment decisions and Storage validation, not live status/assignment endpoints.

- 0005: update_delivery_status(parcel_id, expected_version, new_status, proof_key, proof_media_type, proof_size); start-delivery behavior is Phase 2.
- 0006: delivery_proof, forced RLS, private metadata grants and one-proof constraints; Phase 3.
- 0007: assign_parcel, lock_delivery_target, lock_parcel_for_reconcile and proof_key_is_referenced; final proof/history compensation is Phase 3/4.

Use the common hardening template, account-before-parcel lock order, transaction-local actor/version, immutable object keys, and the documented SQLSTATE registry. The draft below deliberately raises an unsupported error; it is not a production function or successful implementation.
