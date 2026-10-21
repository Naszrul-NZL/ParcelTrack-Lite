# Module 2 Parcel Registration and Public Tracking

Owner: Zikri, GitHub Zikri809. Deliver backend parcel functionality and the React parcel/tracking feature. This is the full module plan, not only the first checkpoint slice.

Use the [shared contract](../../shared/system-contract.md), [integration plan](../../shared/integration-and-aws.md), [ERD](../../initial-erd.md) and [security worksheet](../../security-tests.md). Exact types, status values, validation, routes and permission rules are defined centrally.

Implement the M2 unit/API/component/browser suites and feature mapping in the [automated testing strategy](../../shared/testing-strategy.md). RLS/grant assertions use the actual restricted PostgreSQL roles; mocks cannot replace them.

## Required functionality

| Feature ID | Function | Observable finished behavior |
| --- | --- | --- |
| M2-F01 | Seller registers a parcel | Valid recipient details/weight create a parcel, random tracking number and initial Registered history in one transaction |
| M2-F02 | Seller views and searches own parcels | Paginated list, literal tracking search, status filter and detail page reveal only the logged-in Seller's parcels |
| M2-F03 | Public tracking | Anyone supplies an exact tracking number and receives only status/date/time history without login |
| M2-F04 | Personal-data lifecycle | Private/public field boundaries remain intact and eligible recipient data is anonymized after the retention period |

Tracking identifiers are generated on the server. Recipient accounts, parcel editing/deletion, batch import/export and courier-provider APIs are outside the required scope. Shared private detail reading serves Seller, assigned Rider and Admin without duplicating permission logic.

## Interfaces and routes

- /seller/parcels: own-parcel table/list, tracking search, status filter, pagination, clear empty state and link to registration/detail.
- /seller/parcels/new: recipient name, international phone, delivery address and weight. Show field constraints, validate on the server, prevent duplicate submission and show the returned tracking number after success.
- /parcels/:id: shared authorized detail/history page. Private recipient fields appear only after a successful authorized response. Qee supplies the Rider action panel and proof viewer; Admin assignment UI links here.
- /track: public tracking form and status timeline. Show no recipient fields, actor names, proof URLs or hidden private payloads. Copy/share UI must not leak tokens into third-party analytics or referrers.

Search/filter changes reset pagination and stale results. A previous user's parcel list is cleared on identity change. Handle 401, inaccessible 404, validation 422, rate-limit 429, unknown tracking number and temporary server/network failures distinctly without disclosing private data.

## API and data ownership

Own A10 through A13 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Own parcel and parcel_status_history schema definitions plus safe summary/detail/public DTOs. Qee authors assignment/delivery writes against those tables through the agreed functions; Zikri reviews shared schema changes. No module creates a second Parcel model or status-history table.

Coordinate the shared RLS transaction-context helper and migration ordering. M2 owns create_parcel and lookup_tracking functions. Qee owns assignment/status functions and proof-table policies. NASZ supplies verified user identity; M2 must not infer it from a submitted seller ID, a browser role or an unsigned header.

## Implementation work packages

1. **M2-W01 Models and constraints:** parcel fields, version/clientRequestId uniqueness, status history, indexes, nullable anonymized fields and immutable ownership. Integrate with M1 user IDs and Qee proof/audit references.
2. **M2-W02 RLS foundation:** forced/enabled policies, non-owner runtime roles, missing-context/session-version denial and transaction-local context. Establish runtime-read versus controlled-function-write grants, apply the shared SECURITY DEFINER hardening to every privileged function, and test connection reuse and hostile search-path shadowing.
3. **M2-W03 Registration:** validate canonical input, derive Seller from session, generate at least 128 random tracking bits, and call create_parcel. Atomically insert parcel, initial history and audit. Retry a tracking-token collision safely without swallowing unrelated constraints.
4. **M2-W04 Retry-safe creation:** preserve clientRequestId in the form across uncertain request failures. Same key/payload returns the original parcel; key with changed data is 409. Generate a new key only for an intentional new registration. Store a canonical creation fingerprint privately.
5. **M2-W05 Seller reads/search:** literal parameterized search, fixed sort/filter allowlists, stable pagination and ownership on list/detail/history. Return the same inaccessible 404 whether another person's ID exists or not.
6. **M2-W06 Public lookup:** isolated tracking database connection, narrow token lookup function, output allowlist, lookup limiter and no-store result. The public path never calls the general private-detail serializer.
7. **M2-W07 React feature:** registration/list/search/detail/tracking routes, shared error handling and responsive forms. Keep a small response model and never rely on hidden UI fields for privacy.
8. **M2-W08 Retention selection:** daily command identifies eligible Delivered/Failed records, anonymizes recipient fields and blocks proof access through the shared maintenance protocol. Qee removes private files and NASZ integrates scheduling/job credentials.
9. **M2-W09 Integration/evidence:** prove that Qee's changes appear in private/public history and dashboard without extra synchronization. Execute attacks, record evidence and validate on AWS.

## Transaction and privacy details

Registration cannot leave a parcel without Registered history. Public lookup must read committed history only. A changed status is displayed by querying the same database; no separate copied tracking database or manual update is introduced.

Use Pydantic response models with explicit field allowlists. For public tracking, return exactly {history:[{status,changedAt}]}. The response must exclude private fields even if the React screen would not display them. A valid unknown token gives safe 404; malformed input gives 422; throttled requests give 429. Display server-returned timestamps in Malaysia time on the frontend.

Private detail calls use the same role/ownership policy for Seller, assigned Rider and Admin. Authorizing the parent parcel is required before reading history or proof metadata. Reassignment immediately removes the old Rider's access. After anonymization, private detail shows the retained history with recipient fields null and an explicit anonymized state; public tracking continues to work.

Retention uses terminalAt, with the P3 Delivered deadline and the documented extension for Failed parcels. Proof access is blocked before file cleanup, and retryable cleanup must be safe to rerun. No browser-triggered cleanup endpoint or public export route is added.

## Security and policies

P1 requires Seller ownership and authorized private reads. P3 requires public-data minimization and retention. P4 requires parameterized SQL, safe text rendering, input validation, synthetic data and generic internal errors. Cryptographic randomness prevents predictable tracking tokens, while lookup limits constrain enumeration attempts.

RLS is tested independently of an application WHERE seller_id filter. It does not replace parameterization or safe serializers. React renders recipient strings as text and never through raw HTML. Prevent SQL injection in both search values and dynamic sort choices. Do not put addresses, passwords or tracking request bodies into routine logs.

## Dependencies and handoffs

| From/to | Required handoff |
| --- | --- |
| M1 to M2 | Active principal, session/CSRF helpers, common rate-limit service and synthetic Seller accounts |
| M2 to M3 | Parcel IDs/status/version, shared private detail DTO, schema/RLS conventions and append-only history rules |
| M3 to M2 | Proof-viewer/action components, final status/history writes and cleanup results |
| M2 to shared operations | Migration sequence, public function grants, RLS test evidence and retention command contract |

The early M2 demo can use seeded authenticated users until M1 login UI is integrated, but final tests must use actual M1 sessions. Test-only principal injection must never ship enabled in cloud.

## Testing and acceptance

Run M2-01 through M2-10, RLS-01/RLS-02/RLS-04 through RLS-09, and shared CSRF/error/cache/data-persistence checks. Add functional cases:

- Successful registration creates exactly one initial history event and returns its unique token.
- Same clientRequestId replay creates no duplicate; same key/different data is a conflict; distinct new registrations produce separate parcels.
- Phone, required fields, length bounds, numeric precision and positive/maximum weight behave at boundaries.
- Seller B cannot find Seller A's parcel through list, search, guessed ID, detail or history.
- Public payload and DOM contain only status/timestamps after each state, including Failed and retained/anonymized records.
- Parameterized tracking/search reject injection without broadening results; XSS text does not execute.
- Public lookup throttles at documented boundaries and resumes after the window, without login-account data leakage.
- Registration rollback, deliberate tracking-token collision and connection-pool reuse preserve consistency.
- Synthetic records immediately before/after the retention boundary behave correctly; failed cleanup is retried without public proof exposure.

Use real PostgreSQL for RLS/transaction tests and browser tests for UI/privacy checks. Record exact input, expected/actual outcomes, safe evidence and Zikri's name. Keep more than five distinct security input types in the final record.

### Checkpoint slice

One registration form creates a real parcel and displays it in the Seller's own list. Show its generated token and persistence after refresh. Public tracking, full filters and retention can follow; this slice is not M2 completion.

### Module definition of done

- [ ] M2-F01 through M2-F04 have observable evidence and all A10 through A13 contracts pass.
- [ ] Seller and public response privacy is verified at API and browser levels.
- [ ] Registration is transactional/retry-safe and tracking tokens are cryptographically random.
- [ ] RLS, injection, XSS, validation, lookup limits and retention checks pass.
- [ ] M2 unit/component and real-PostgreSQL/API suites meet the testing strategy, including concurrent creation/replay, finite numeric input and retention boundaries.
- [ ] M1 sessions and M3 history/proof updates work through the shared detail/tracking screens.
- [ ] Zikri can demonstrate the module and explain its schema, RLS and security controls on AWS.
