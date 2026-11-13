# Execution sequence

The root app, local infrastructure and migrations through `0004_integrated_erd` exist. See [implementation status](../implementation-status.md) for tested behavior and remaining foundation checks. This sequence orders the remaining work; it does not claim that the planned APIs are implemented.

## Foundation verification

Complete outstanding PH1 checks and reviews against the existing code. Naszrul owns the shell, auth primitives and CI; Zikri owns role/bootstrap, migrations and RLS; Syauqi owns the shared harness, Storage and image pipeline. Reproduce a clean setup and record G1 evidence. Keep the confirmed lecturer stack approval, identities, repository administration and later hosting decisions in the [decision register](decision-register.md).

## Contributor starting point

Module ownership is already assigned. Start from the same committed baseline, read your module README and PH1/PH2 tasks, and use the [foundation handoff status](../implementation-status.md#foundation-handoff-status) to distinguish existing code from outstanding acceptance. Do not recreate foundation services because their phase tasks are still open.

| Owner | First review and remaining foundation work | Next bounded implementation |
| --- | --- | --- |
| Naszrul (M1) | Verify existing M1-PH1 work; finish remaining M1-PH1-T11 checks and M1-PH1-T12 contract review | M1-PH2-T02 through T09: real sessions/auth services and retirement of test identity/session substitutes |
| Zikri (M2) | Verify existing M2-PH1 role/bootstrap, migrations, transaction helper, fixtures and DTOs; complete M2-PH1-T09 review | M2-PH2-T01, T02: verify schema/policies and add 0005; then T03, T04, T06 protected parcel APIs using H20 |
| Syauqi (M3) | Complete remaining M3-PH1-T01/T02 harness checks, T05 resource evidence and T09 contract review against existing code | Draft M3-PH2-T02; apply 0006 after 0005, then T01, T03, T04 for guarded assignment fixtures and protected Rider services |

Naszrul coordinates shared layout/theme/component changes under the existing shell responsibility; each module owner implements their own screens. Follow the [overlap rule](phase-framework.md#overlap-rule): independent service tests and function drafts can start before G1, but G1 remains open until its checks and all three owner sign-offs exist.

The [frontend foundation](frontend-foundation.md) supplies the implemented Airway theme, local fonts, shared controls, status mapping, parcel docket and field feedback. Reuse its documented exports before adding module UI; the real authentication and business-service handoffs remain in the table above.

Use a branch per owner and bounded task. Each PR names task IDs, affected handoffs, actual checks and any permitted substitute still in use. A consumer records handoff acceptance in that PR after exercising it from their own branch. Rebase later migrations onto the merged head; never edit an applied revision. Local commits prepare the baseline; sharing it still requires a push and the repository's normal PR workflow.

## Initial working slices

| Order | Owner and task | Dependency and result |
| --- | --- | --- |
| 1 | Naszrul: M1-PH2-T02 through T09 | Real session, login/logout, CSRF, rate-limit and audit services; H20 retires test identity/session substitutes |
| 2 | Zikri: M2-PH2-T01, T02, T03, T04, T06 | Verify existing schema/policies, add `0005_create_parcel`, then protected create/list/detail APIs using H20 and the shared transaction wrapper |
| 3 | Syauqi: M3-PH2-T01 through T04 | Use guarded assigned fixtures, add `0006_delivery_functions`, then Rider list and Start delivery through real sessions |
| 4 | Each module's PH2 UI and tests | Connect stock shadcn forms and shared client/session contracts; run INT-13, INT-14 and INT-15 on one database; record G2 evidence |

Database function work and pure service tests can proceed while real sessions are finished, using only the explicitly permitted substitutes in the [handoff register](dependency-matrix.md). A substitute must be retired before its named gate. No unprotected business route is exposed publicly.

## Complete integrated workflows

1. Naszrul delivers the Rider directory and disablement early (M1-PH3-T01, T02; H30/H31), followed by Seller registration, password/user administration and audit views.
2. Zikri publishes the shared detail slot types and base A12 contract first (M2-PH3-T03; H34), without depending on Syauqi's components. Replay safety, search, public tracking and retention selection can proceed independently.
3. Syauqi verifies the proof schema already present in 0004, adds `0007_delivery_final`, and builds assignment/reassignment, final outcomes, authorized proof access, dashboard and the RiderActionPanel/ProofViewer implementations (M3-PH3-T10; H35) against H34.
4. Zikri wires the supplied components into the shared detail page (M2-PH3-T07; H39), completes `hasProof` integration and retires remaining UI mocks. All three owners prove Delivered, Failed, disabled-Rider reassignment and public privacy before G3.
5. Naszrul connects the maintenance runner; Zikri and Syauqi complete retention, proof cleanup and local recovery together. Run PH4 authorization, RLS, race, upload and failure cases on the integrated app before G4.

Every feature includes its validation, errors, loading/empty states, access controls and tests in the same change. Use [stock shadcn first](../ui-components.md); add an extension only for a demonstrated capability gap.

## Release and final assessment

After local G4 and a resolved hosting decision, execute PH5 cloud setup, HTTPS, persistence, required jobs, rollback and live journeys. The local restore drill is required; the isolated cloud restore repetition remains STRETCH and cannot block required work. PH6 repeats applicable required scenarios on the release candidate, assembles actual security results, and rehearses the [final demonstration](workflow-trace.md#final-demonstration-order). See the [phase gates](phase-framework.md) for evidence and owner sign-off.
