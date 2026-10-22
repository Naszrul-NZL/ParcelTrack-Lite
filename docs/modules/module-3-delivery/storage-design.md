# Phase 1 storage and reconciliation design

ProofStore uses the self-hosted Supabase Storage API, not direct access to vendor files or storage.objects. The bucket is private. Keys contain the parcel ID and 128 random bits; traversal, malformed keys and overwrite are rejected. The web service's privileged Storage credential stays outside client imports and never supplies parcel authorization by itself.

Phase 1 supplies bounded image decoding/re-encoding, the Storage API adapter and test fixtures. The finalization endpoint is later work: pre-authorize before decode, take the verified actor/parcel locks, upload sanitized immutable bytes, then commit metadata/history. Confirmed rollback compensates; unknown commit retains the object. Cleanup waits at least 24 hours, takes the same parcel lock and checks references in a fresh READ COMMITTED statement. Any uncertainty preserves bytes for a later retry.

Keep input and output at most 3 MiB, full multipart at most 4 MiB, one JPEG/PNG frame and at most 12 million pixels. Generated staging data is private and temporary. Sanitize EXIF/GPS and trailing bytes through re-encoding. Native memory/time measurements are local evidence, not an assurance of 15 concurrent uploads or the case study's full traffic.

Current provisional process limits are two image operations, one libvips worker per operation and a 16 MiB Sharp cache. Argon2 work also has a process-wide counter (default two), with one cached dummy hash initialized once. The future upload route still owns the total multipart-body limit, early authorization and guaranteed response-byte headers; none is implied by the standalone sanitizer.

The writer helper checks the maintenance flag, takes a nonblocking transaction-level shared advisory lock, then checks the flag again. A backup runner must commit the expiring maintenance flag before requesting its session-level exclusive lock, retain that same session while exporting, and clear the flag in cleanup. Existing writers drain; new writers fail with MAINTENANCE rather than waiting behind the backup. GET paths remain available. The tested prototype exercises these locks directly; a production backup runner is later work.

Backups capture application SQL data plus matching Storage API objects while writers/jobs are drained under the exclusive advisory lock. Restore into a separate full stack through application migrations and supported Storage APIs; purge sessions, reconcile account changes or quarantine, and rerun retention before reopening.
