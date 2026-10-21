# Module 3 Delivery Update and Admin Dashboard

Owner: Qee, GitHub Qee110. Deliver backend delivery operations and React delivery/Admin screens. This plan covers the full module after the checkpoint.

Follow the [shared contract](../../shared/system-contract.md), [integration plan](../../shared/integration-and-aws.md), [ERD](../../initial-erd.md) and [security worksheet](../../security-tests.md). Use the shared state/permission rules and DTOs rather than duplicating them here.

Implement the M3 unit/API/component/browser suites and feature mapping in the [automated testing strategy](../../shared/testing-strategy.md). Transaction/file failure cases require actual PostgreSQL and private filesystem integration.

## Required functionality

| Feature ID | Function | Observable finished behavior |
| --- | --- | --- |
| M3-F01 | Admin assignment | Admin assigns a Registered parcel to an active Rider; Assigned history appears and the Rider gains access |
| M3-F02 | Rider parcel list | Rider sees only assigned parcels, with status filtering, pagination and private detail access |
| M3-F03 | Delivery outcomes and proof | Assigned Rider moves Assigned to Out for Delivery, then Delivered or Failed with one validated JPG/PNG |
| M3-F04 | Admin dashboard | All five status counts, including zeros, agree with the database and refresh after committed changes |
| M3-F05 | Operational continuity | Admin can reassign unfinished parcels, especially after Rider disablement; private proofs remain protected and removable under retention |

Admin can assign/read but cannot submit Rider delivery updates. Delivered/Failed are final. Redelivery, bulk assignment, maps, multiple photos and public proof links are outside scope.

## Interfaces and routes

- /admin/parcels: paginated list with status/Rider filters and needs-reassignment view. Choose only active Riders from M1; refresh parcel version before submitting a stale assignment.
- /admin/dashboard: five labeled counts, total, generated time and links to filtered Admin parcel lists. Include zero counts; counts represent all retained parcels, not only today's parcels.
- /rider/parcels: assigned-parcel list suitable for an Android browser; links to shared detail. Show the permitted next action rather than an unrestricted status dropdown.
- Rider action panel inside /parcels/:id: Start delivery for Assigned; Delivered/Failed controls with one photo input for Out for Delivery. Show size/type requirements and clear pending/error states.
- Private proof viewer inside the shared detail page: load through A19 only after authorization. Do not embed a filesystem path or public media URL.

Refresh detail/list/dashboard queries after successful mutations. If offline or the response is lost, show an uncertain result and refetch before resubmission. No offline queue or automatic duplicate delivery request is required. On 409, preserve the user's explanation/photo selection where safe, refresh state and ask for a deliberate new action.

## API and data ownership

Own A14 through A19 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Own delivery_proof schema/policies, assign_parcel and update_delivery_status functions, private proof streaming, image cleanup and delivery audit producers. Consume M2's Parcel model, shared private detail service and status-history schema. Do not create another status enum or bypass M1 authentication.

M3 history and proof-metadata reads follow the parent parcel's RLS. Final writes use controlled database functions and expectedVersion. The database rejects unauthorized updates even if an application repository accidentally omits an assignment filter; backend service checks remain required too.

## Implementation work packages

1. **M3-W01 Assignment service/UI:** Admin permission, active-Rider validation, row locking/version checks, first assignment history and reassignment audit. Use the shared Admin account list and private parcel detail.
2. **M3-W02 Rider reads:** assigned-only list/filter/detail access using RLS and backend checks. A disabled/reassigned Rider loses access without waiting for a frontend refresh.
3. **M3-W03 Transition service:** allow only the shared transitions, fixed status values and authenticated actor/time. Atomically update version/current status/history/audit. Reject terminal-state changes, wrong roles, stale versions and forged ownership fields.
4. **M3-W04 Proof validation:** stream to private staging under hard limits, decode/check format/dimensions, reject multi-frame/unsafe filenames, re-encode/strip metadata, and assign an immutable random key. Use maintained image libraries with resource limits and pinned dependencies.
5. **M3-W05 Finalization consistency:** implement the controlled lock_delivery_target function, shared compensating file/DB sequence and orphan cleanup. app_runtime cannot directly lock protected parcel rows through SELECT FOR UPDATE. A failed finalization cannot leave a Delivered/Failed parcel without a valid file/metadata; a lost commit acknowledgment or response must not remove potentially committed proof without reconciliation.
6. **M3-W06 Private proof retrieval:** verify current role/ownership/assignment and anonymized state, return a fixed allowed MIME, no-store and nosniff, and prevent path traversal. Blob/object URLs created by React are revoked on navigation/logout.
7. **M3-W07 Dashboard:** one consistent aggregate snapshot for counts and total. Do not return recipient details. React invalidates counts after successful writes; no caching assumption can make the displayed values authoritative.
8. **M3-W08 Continuity and retention:** inactive Rider assignment flags, reassignment of unfinished work, private-file deletion/retry and orphan cleanup. Coordinate with Zikri's retention candidate selection and NASZ's scheduler credentials.
9. **M3-W09 Cloud/evidence:** verify file persistence/permissions, backup/restore with PostgreSQL, phone-width use and all module security tests on AWS.

## Important failure and race rules

- Before changing a parcel, verify the acting account remains active and the Rider remains assigned inside the transaction. Lock accounts before the parcel consistently with M1/M2. Admin reassignment and Rider completion cannot both blindly succeed from the same expectedVersion.
- First assignment sets ASSIGNED and records one history event. Reassignment preserves ASSIGNED or OUT_FOR_DELIVERY and records old/new Rider IDs in audit only. Never rewrite old history to make the new Rider appear to have performed earlier work.
- Disabling a Rider never waits for their deliveries to finish. Admin reassigns unfinished parcels through M3; final parcels cannot be reassigned.
- Starting delivery rejects a proof file. Final outcomes require exactly one valid image; multiple files or conflicting status fields are rejected.
- Validate/prepare a file before holding a long database lock. Begin the transaction and call lock_delivery_target to recheck account/session, assignment/state/version and acquire the lock under domain_writer privileges. Publish the file privately, then invoke update_delivery_status on the same transaction/connection and commit. Clean prepared files on confirmed authorization/rollback rejection; unknown commit outcomes are reconciled before deletion.
- PostgreSQL and filesystem changes are not one transaction. Follow the shared staged-file/commit/compensation/reaper protocol and test each failure point. Unknown-commit cleanup first waits on the same parcel lock through the maintenance helper, then rechecks committed references; an empty early SELECT must never cause deletion of a file whose original transaction can still commit.
- Private proof reads require an authorized DB check before file streaming. On already-open streams, disablement cannot retract bytes already sent; no new reads or finalizations may start after the disabling transaction wins. Files are never served by the public reverse proxy.

## Security and policies

P1 requires active assigned-Rider checks and exclusive Admin assignment/dashboard access. P3 protects recipient details/photos and enforces cleanup. P5 requires actor/time evidence for status changes and accountable assignment/reassignment events. P4 applies to safe errors, secrets, synthetic data and logs.

Validate extension, detected format, decoded content, byte count and dimensions; do not trust Content-Type alone. Re-encode and strip metadata, use private non-executable storage and random generated filenames, and deny arbitrary media paths. Reject payloads such as shell.php.jpg before storing a served file. Use the [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) as supporting implementation guidance.

All search/filter SQL is parameterized. Multipart requests still require CSRF protection. Proof metadata never appears in public tracking and image file names are not derived from recipient names or tracking tokens.

## Dependencies and handoffs

| From/to | Handoff |
| --- | --- |
| M1 to M3 | Valid principal/CSRF/role helpers, active Rider directory, disablement and audit services |
| M2 to M3 | Parcel schema/status/version, shared private detail, initial Registered records and RLS transaction helper |
| M3 to M2 | Committed status history, hasProof state, proof viewer/action components and cleanup outcomes |
| M3 to operations | Private storage permissions, staged-file cleanup, off-host backup contents and restored-file verification |

## Testing and acceptance

Run M3-01 through M3-10, RLS-01/RLS-03 through RLS-10 and shared CSRF/error/cache/persistence checks. Add these successful and failure cases:

- Admin assigns a new parcel; only the selected Rider sees it and history contains one Assigned event.
- Assigning an inactive/non-Rider account is rejected. Same-Rider/matching-version assignment is a no-op. Stale assignment is 409.
- Assigned Rider records Out for Delivery, then Delivered with valid JPG and Failed with valid PNG on another parcel.
- Dashboard returns all five keys, zero-valued statuses, matching total and updated committed counts.
- Seller, public user, another Rider and Admin cannot use the Rider status endpoint.
- Invalid status, skipped transition, duplicate/stale finalization, multiple images, corrupt data, spoofed MIME, oversized bytes/dimensions and malicious names all fail safely.
- Simulate file-write failure, DB rollback, process interruption before commit, and failed response delivery after commit. Check both files and metadata rather than only the HTTP result.
- Concurrent reassignment/finalization chooses a valid winner without duplicate history/proofs. Old Rider loses detail/photo access after reassignment.
- Disable a logged-in assigned Rider, reassign their unfinished parcel and finish with the new Rider without rewriting old history.
- Anonymous proof request and path-traversal attempt fail. Retention hides the image before deletion; interrupted cleanup retries successfully.
- Restart/redeploy and restore into a separate environment; verify proofs, metadata, history and RLS grants agree.

Record exact input, expected/actual results, safe evidence and Qee's name. Use actual PostgreSQL roles and private storage in integration tests; a mocked upload handler alone does not prove the final workflow.

### Checkpoint slice

A seeded assigned parcel is shown in the Rider screen and the assigned Rider can move it to Out for Delivery, persisting the change and actor/time. Full upload handling, Admin dashboard and reassignment follow in later phases; the slice is not M3 completion.

### Module definition of done

- [ ] M3-F01 through M3-F05 and A14 through A19 work through UI/direct requests.
- [ ] Both terminal outcomes have exactly one valid proof and coherent history/current status.
- [ ] Role, assignment, transition, upload, concurrency and RLS checks have passing evidence.
- [ ] M3 unit/component and PostgreSQL/filesystem suites meet the testing strategy, including controlled locking, unknown commit outcomes and fault recovery.
- [ ] Rider disablement/reassignment and private-photo retention work across modules.
- [ ] AWS restart/redeploy and tested restoration preserve the system's data and files.
- [ ] Qee can demonstrate the module and explain the controls and failure handling personally.
