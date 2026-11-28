# M3 PH3 proof and dashboard backend evidence

Owner: Syauqi (`Qee110`)

Scope: M3-PH3-T05 to T08; A17 final outcomes, A18, A19; TC04 to TC09, TC19 to TC21. The A14/A15 H37 dependency merged in PR #44 before this slice was committed.

## Implemented behavior

- A17 authenticates the Rider, checks the assigned parcel and releases that transaction before reading or decoding multipart bytes. Unauthorized callers do not consume the body.
- The multipart reader accepts only `status`, `expectedVersion` and at most one `proof`; caps the full streamed body at 4 MiB even without `Content-Length`; limits boundary, filename and part counts; and rejects repeated or unknown fields. It currently holds the bounded body in memory for standards-compliant `FormData` parsing, then stages only the proof bytes in a private mode-0600 temporary file before decoding.
- Final outcomes require one proof; Start delivery forbids it. The server ignores the declared media type for trust decisions, fully decodes one JPEG/PNG frame at no more than 12 MP, and re-encodes it without metadata or trailing payload. Input and sanitized output are each capped at 3 MiB.
- Image work retains the process-wide two-operation Sharp limit and adds one active upload slot per Rider. Busy work returns `503 BUSY` and releases counters in `finally`.
- Finalization takes `lock_delivery_target`, publishes a random parcel-scoped immutable object, calls `update_delivery_status` with server-derived metadata, and returns only after commit. Confirmed rollback compensates by deleting the new object. A commit whose acknowledgement is uncertain raises `CommitUncertainError` and preserves the object for reconciliation.
- A19 resolves only the proof row authorized through parcel and proof RLS, denies anonymized parcels, opens the private object through `ProofStore`, verifies stored length and JPEG/PNG signature, rechecks authorization after the object read, records `PROOF_VIEWED`, and returns `no-store`, `nosniff`, fixed `Content-Disposition` and verified media type. It never returns the bucket, key, service credential or a public/signed URL.
- A18 uses one aggregate statement for all five status counts, the total and `generatedAt`. The response schema zero-fills every status and contains no recipient fields.

## Local verification

Run on 28 November 2026 on Windows with Node.js 24.22.3, Docker Engine 29.9.3 and the repository test Supabase Compose profile.

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed with zero diagnostics |
| Unit and component projects | 27 files, 410 tests passed |
| Full isolated integration project | 22 files, 142 tests passed |
| Proof/dashboard focused regression | 4 files, 33 tests passed |
| Multipart, zero-dashboard and commit-uncertainty unit checks | 6 focused tests passed |
| SQL hardening | Passed; delivery SQL remains constant text with bound values |
| OpenAPI/route/DTO/import parity | Snapshot matches with final A17, A18 and A19 |
| Test database and Storage setup | Bootstrap, migrations, restricted-role/catalog verification, fixtures and private bucket initialization passed |
| Authenticated phone regression | 2 Rider tests passed, including A10 to A15 to A17 Start delivery and Rider B isolation |
| Production build | Passed; route inventory includes `/api/v1/admin/dashboard` and `/api/v1/parcels/{parcelId}/proof` |

## Observed security and failure cases

- Valid JPEG with EXIF and an appended script is stored re-encoded without either canary; valid PNG supports Failed.
- Missing, duplicate, corrupt, disguised, SVG and declared-oversized proofs are rejected without parcel or proof changes.
- A published object is deleted after a forced unique-proof database failure and confirmed rollback; parcel status and version remain unchanged.
- Seller owner, assigned Rider and Admin receive verified proof bytes and one success audit each. Other Sellers/Riders receive the same protected 404; anonymous receives 401; malformed IDs and anonymized parcels do not expose bytes or success audits.
- Dashboard access is Admin-only, totals equal the sum of the five counts, and the zero aggregate serializer is covered independently.

## Remaining work and limitations

- T09 and T10 still own the Airway Admin parcel/dashboard screens, assignment dialog, Rider action panel and proof viewer. H35 is not complete until Zikri consumes the real components in H34.
- T11 still owns the complete disable, flag, reassign and finish continuity journey through UI/API.
- T12 still owns idempotent shared proof fixture files and H38.
- T13 and T14 still own the full feature security worksheet, Compose INT-02/INT-03/INT-05 journeys and A14 to A19 conformance evidence.
- Temporal upload rate limiting, fault-injection expansion, reconciliation and orphan cleanup remain PH4 work. The PH3 counter only sheds concurrent work.
- No group gate is signed off by this slice. Remote CI, teammate review and consumer confirmations are not local evidence.
