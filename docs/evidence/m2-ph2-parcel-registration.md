# M2 PH2 parcel registration

Issue #8 covers H22 registration and M2-PH2-T01–T03. Migration `0005_create_parcel` adds `app.create_parcel(text,text,text,numeric,uuid,text,text,uuid)`. The arguments are recipient name, phone, address, weight, client request ID, creation fingerprint, tracking number and request ID, in that order. The function returns the registered parcel. Migration 0006 can follow this revision once 0005 merges.

The Seller signs in through A01/A03. A10 uses that session and its CSRF token, validates the request, and returns a committed 201 private parcel detail. The database derives the Seller, status and timestamp and inserts the parcel, first history and audit together. PH2 returns 409 for a repeated request ID. Replay is planned for PH3.

The isolated Supabase run passed 18 focused migration, RLS, registration and authorization-matrix tests, including an upgrade from 0004, direct-write and wrong-role denial, malformed fields, CSRF rejection, tracking collision retry, and rollback when audit insertion fails. The M2 tests used H10 isolated database clones, H20 `loginAs` for real sessions and the H24 matrix for all supported identities. The inactive-account matrix case uses a stale fixture session because that account cannot sign in.

Cross-owner review and consumer acceptance remain pending. This evidence covers the A10 handler and the migration.
