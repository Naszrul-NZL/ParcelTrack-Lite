# Module 3 Delivery Update and Admin Dashboard

Owner: Syauqi, GitHub Qee110. Deliver backend delivery operations, the shared test harness, private proof storage, backup/restore coordination and React delivery/Admin screens. This folder is the full phased plan after the checkpoint as well. Phase 1 foundation code and local tests now exist; see [actual progress and open gates](../../phase-1-progress.md). Later workflows remain planned and owner reviews are pending.

Follow the [shared contract](../../shared/system-contract.md), [phase framework](../../shared/phase-framework.md), [dependency matrix](../../shared/dependency-matrix.md), [ERD](../../initial-erd.md) and [security worksheet](../../security-tests.md). Use the shared state/permission rules and DTOs rather than duplicating them here. Transaction/file failure cases require actual PostgreSQL and private filesystem integration.

## Contents of this folder

| File | Purpose |
| --- | --- |
| [phases/PH1-foundation.md](phases/PH1-foundation.md) | Test harness, Playwright and file fixtures, pure rules, `ProofStore`, image decision, coordination design |
| [phases/PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) | Rider list, Start delivery with actor/time, seeded assignment (TMP-02), checkpoint evidence |
| [phases/PH3-complete-functionality.md](phases/PH3-complete-functionality.md) | Proof table, assignment/reassignment, Delivered/Failed with proof, dashboard, screens |
| [phases/PH4-hardening-regression.md](phases/PH4-hardening-regression.md) | Fault injection, reconciliation, purge, concurrency, upload corpus, backup lock and local restore drill |
| [phases/PH5-cloud-operations.md](phases/PH5-cloud-operations.md) | persistent Docker, off-host backups, timers, cloud restore exercise, Android/4G checks |
| [phases/PH6-final-acceptance.md](phases/PH6-final-acceptance.md) | Final regression, test document, demo, runbooks |
| [test-plan.md](test-plan.md) | Test coverage by feature, requirement, phase and test case |

## Required functionality

| Feature ID | Function | Observable finished behavior | Works partially | Complete and tested |
| --- | --- | --- | --- | --- |
| M3-F01 | Admin assignment | Admin assigns a Registered parcel to an active Rider; Assigned history appears and the Rider gains access | PH2 (seeded) | PH4 |
| M3-F02 | Rider parcel list | Rider sees only assigned parcels, with status filtering, pagination and private detail access | PH2 | PH3 |
| M3-F03 | Delivery outcomes and proof | Assigned Rider moves Assigned to Out for Delivery, then Delivered or Failed with one validated JPG/PNG | PH2 (start only) | PH4 |
| M3-F04 | Admin dashboard | All five status counts, including zeros, agree with the database and refresh after committed changes | PH3 | PH4 |
| M3-F05 | Operational continuity | Admin can reassign unfinished parcels, especially after Rider disablement; private proofs remain protected and removable under retention | PH3 | PH4 |

Admin can assign/read but cannot submit Rider delivery updates. Delivered/Failed are final. Redelivery, bulk assignment, maps, multiple photos and public proof links are outside scope.

## Phase overview

| Phase | Objective | Key tasks | Depends on | Exit |
| --- | --- | --- | --- | --- |
| PH1 | Independent testing and design foundations | T01 harness, T03 pure rules, T04 `ProofStore`, T05 image spike, T06 lock design | H02, H08, H09 | G1 |
| PH2 | Rider starts delivery on a seeded parcel | T02 function, T03 A17 v1, T04 A16, T05 UI, T08 checkpoint evidence | H03, H20, H25 | G2 |
| PH3 | All five features | T01 `delivery_proof` 0006 then 0007 (first), T03 assign, T05-T07 proof, T08 dashboard, T09-T10 UI | H30, H31, H34 | G3 |
| PH4 | Consistency under faults, races, hostile uploads; backup lock and drill | T01-T04 faults/reconcile/purge, T05 concurrency, T06 corpus, T07 backup | H33, H40, H42 | G4 |
| PH5 | Durable cloud storage, backups, restore | T01-T04 volumes/private off-host backup/timers/restore, T05 persistence, T06 4G | H50, H52 | G5 |
| PH6 | Final evidence and demonstration | T02 document, T04 demo, T06 runbooks | G5 | G6 |

## What M3 provides and consumes

| Provides | To | Phase |
| --- | --- | --- |
| H10 harness, Playwright skeleton, file fixtures; H13 ProofStore, lock design, storage layout | Naszrul, Zikri | PH1 |
| H23 `update_delivery_status` v1, A16/A17 v1; checkpoint evidence compilation | group | PH2 |
| H35 `delivery_proof`, Rider action panel, proof viewer; H37 assignment; H38 proof fixtures | Zikri, all | PH3 |
| H41 backup lock; H44 backup/restore scripts; reconcile and purge jobs; matrix rows A14-A19 (H43) | Naszrul, Zikri | PH4 |
| H51 volumes, backups, timers; H54 restore environment | Naszrul, Zikri | PH5 |

Consumes: H02/H03/H07/H08/H09 (PH1), H20/H25 (PH2), H30/H31/H34 (PH3), H33/H40/H42 (PH4), H50/H52 (PH5). Substitutes: see the [handoff register](../../shared/dependency-matrix.md#handoff-register).

## Interfaces and routes

- /admin/parcels: paginated list with status/Rider filters and needs-reassignment view. Choose only active Riders from M1 (A07); refresh parcel version before submitting a stale assignment.
- /admin/dashboard: five labeled counts, total, generated time and links to filtered Admin parcel lists. Include zero counts; counts represent all retained parcels, not only today's parcels.
- /rider/parcels: assigned-parcel list suitable for an Android browser; links to shared detail. Show the permitted next action rather than an unrestricted status dropdown.
- Rider action panel inside /parcels/:id: Start delivery for Assigned; Delivered/Failed controls with one photo input for Out for Delivery. Show size/type requirements and clear pending/error states.
- Private proof viewer inside the shared detail page: load through A19 only after authorization. Do not embed a filesystem path or public media URL.

Refresh detail/list/dashboard queries after successful mutations. If offline or the response is lost, show an uncertain result and refetch before resubmission. No offline queue or automatic duplicate delivery request is required. On 409, preserve the user's photo selection where safe, refresh state and ask for a deliberate new action.

## API and data ownership

Own A14 through A19 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Own delivery_proof schema/policies, assign_parcel, update_delivery_status, lock_delivery_target and reconcile helper functions, private proof streaming, image cleanup, the shared test harness, the backup coordination lock and scripts, and delivery audit producers. Consume M2's Parcel model, shared private detail service and status-history schema. Do not create another status enum or bypass M1 authentication.

M3 history and proof-metadata reads follow the parent parcel's RLS. Final writes use controlled database functions and expectedVersion. The database rejects unauthorized updates even if an application repository accidentally omits an assignment filter; backend service checks remain required too.

## Work package map

| Work package | Phase tasks |
| --- | --- |
| M3-W01 Assignment service/UI | M3-PH3-T02, T03, T09 |
| M3-W02 Rider reads | M3-PH2-T04, T05 |
| M3-W03 Transition service | M3-PH1-T03, M3-PH2-T02, T03, M3-PH3-T06 |
| M3-W04 Proof validation | M3-PH1-T04, T05, M3-PH3-T05 |
| M3-W05 Finalization consistency | M3-PH3-T01, T06, M3-PH4-T01 to T03 |
| M3-W06 Private proof retrieval | M3-PH3-T07, M3-PH4-T08 |
| M3-W07 Dashboard | M3-PH3-T08, T09 |
| M3-W08 Continuity and retention | M3-PH3-T11, M3-PH4-T02, T04 |
| M3-W09 Cloud/evidence | M3-PH5, M3-PH6 |

## Important failure and race rules

- Before changing a parcel, verify the acting account remains active and the Rider remains assigned inside the transaction. Lock accounts before the parcel consistently with M1/M2. Admin reassignment and Rider completion cannot both blindly succeed from the same expectedVersion.
- First assignment sets ASSIGNED and records one history event. Reassignment preserves ASSIGNED or OUT_FOR_DELIVERY and records old/new Rider IDs in audit only. Never rewrite old history to make the new Rider appear to have performed earlier work.
- Disabling a Rider never waits for their deliveries to finish. Admin reassigns unfinished parcels through M3; final parcels cannot be reassigned.
- Starting delivery rejects a proof file. Final outcomes require exactly one valid image; multiple files or conflicting status fields are rejected.
- Validate/prepare a file before holding a long database lock. Begin the transaction and call lock_delivery_target to recheck account/session, assignment/state/version and acquire the lock under domain_writer privileges. Publish the file privately, then invoke update_delivery_status on the same transaction/connection and commit. Clean prepared files on confirmed authorization/rollback rejection; unknown commit outcomes are reconciled before deletion.
- PostgreSQL and Storage API operations are not one transaction. Follow the shared temporary-stage/Storage-upload/SQL-commit/compensation/reconciliation protocol and test each failure point (M3-PH4-T01). Unknown-commit cleanup first waits on the same parcel lock through the maintenance helper, then rechecks committed references; an empty early SELECT must never cause deletion of a file whose original transaction can still commit.
- Private proof reads require an authorized DB check before file streaming. On already-open streams, disablement cannot retract bytes already sent; no new reads or finalizations may start after the disabling transaction wins. Files are never served by the public reverse proxy.

## Security and policies

P1 requires active assigned-Rider checks and exclusive Admin assignment/dashboard access. P3 protects recipient details/photos and enforces cleanup. P5 requires actor/time evidence for status changes and accountable assignment/reassignment events. P4 applies to safe errors, secrets, synthetic data and logs.

Validate extension, detected format, decoded content, byte count and dimensions; do not trust Content-Type alone. Re-encode and strip metadata, use private non-executable storage and random generated filenames, and deny arbitrary media paths. Reject payloads such as shell.php.jpg before storing a served file. Use the [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) as supporting implementation guidance.

All search/filter SQL is parameterized. Multipart requests still require CSRF protection. Proof metadata never appears in public tracking and image file names are not derived from recipient names or tracking tokens.

## Testing and acceptance

All M3 tests are listed per phase and aggregated in [test-plan.md](test-plan.md). Run worksheet rows M3-01 to M3-10, RLS-03, RLS-10 and the M3 shares of S-01, S-05, S-07, S-09. Use actual PostgreSQL roles and private storage in integration tests; a mocked upload handler alone does not prove the final workflow. Record exact input, expected/actual results, safe evidence and Syauqi's name.

### Checkpoint slice versus completion

The checkpoint slice is M3-PH2: a seeded assigned parcel is shown in the Rider screen and the assigned Rider can move it to Out for Delivery, persisting the change and actor/time, with another Rider denied. Assignment, upload handling, Failed outcome, dashboard and reassignment follow in PH3 and PH4; the slice is not M3 completion.

### Module definition of done

Tick a box only with a linked passing result from the stated phase.

- [ ] PH1 exit criteria met (G1): harness, fixtures, pure rules, `ProofStore`, coordination design.
- [ ] PH2 exit criteria met (G2): Start delivery with actor/time, Rider isolation; TMP-02 labeled.
- [ ] M3-F01 through M3-F05 and A14 through A19 work through UI and direct requests; TMP-02 and TMP-05 retired (G3).
- [ ] Both terminal outcomes have exactly one valid proof and coherent history/current status.
- [ ] Role, assignment, transition, upload, concurrency and RLS checks (including RLS-03, RLS-10) have passing evidence (G4).
- [ ] M3 unit/component and PostgreSQL/Storage API suites meet the testing strategy, including controlled locking, unknown commit outcomes and fault recovery.
- [ ] Rider disablement/reassignment and private-photo retention work across modules.
- [ ] Local backup/restore drill passed (G4); cloud restart/redeploy and tested restoration preserve data and files (G5).
- [ ] Syauqi can demonstrate the module and explain the controls and failure handling personally (G6).
