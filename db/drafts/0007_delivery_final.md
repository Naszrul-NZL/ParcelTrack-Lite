# Finalization design

1. Authentication and bounded image validation run before row locks or object upload.
2. The domain function reads verified actor/session version from transaction context and calls lock_active_actor.
3. Assignment locks actor, target account, then parcel. Finalization locks actor, then parcel; both recheck expectedVersion and state.
4. Upload the sanitized immutable key through the private Storage API while the controlled transaction holds the lock. Never overwrite an object.
5. Commit parcel, proof metadata, history and audit together. Compensate only after confirmed rollback. Unknown commit keeps the object for locked reconciliation.
6. Reconciliation takes the same parcel lock, checks references in a fresh READ COMMITTED statement and preserves bytes on uncertainty.

Implementation belongs to PH3/PH4. No production stub is installed by Phase 1.
