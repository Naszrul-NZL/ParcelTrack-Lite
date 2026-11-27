# M3 foundation and Rider slice close-out evidence

Updated 27 November 2026 for [issue #11](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/11), [issue #12](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/12), [issue #13](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/13) and [issue #14](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/14). The registered migration work is in [PR #28](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/28); the route, UI and acceptance work is on `feat/m3-issues-11-14-closeout` pending its own PR and remote CI.

| Issue and task | Completed implementation and evidence | Still required before issue closure |
| --- | --- | --- |
| #11 - M3-PH1-T01/T02/T05/T09 - H10/H13 | HAR-01 covers audit isolation and overlapping restricted connections. PR #21 records the full local-stack Sharp measurement. M2 consumed H10 for registration, RLS, private reads and the authorization matrix. PR #28 consumes the migration contract and has green migration/integration/local-stack CI. | Naszrul and Zikri must record the required owner contract review. Wider recovery/failpoint work stays with its later phase and does not block this issue's bounded PH1 evidence. |
| #12 - M3-PH2-T02/T03 - H23 | PR #28 registers 0006 after 0005 and adds 0007. Its migration CI is green. The close-out branch mounts A17, preserves the five-second body-read deadline, uses real H20 sessions and returns the shared A12 detail after commit. All 97 local integration cases pass. | PR #28 still needs its requested owner reviews before merge; the close-out PR needs remote CI. |
| #13 - M3-PH2-T01/T04 - H25/TMP-02 | The H25 profile reran twice without duplicates. The close-out branch mounts A16, adds A16/A17 matrix rows and changes Rider service tests from fixture sessions to `loginAs`. All 97 integration cases pass, including filtering, RLS, validation, pagination and SQL safety. | TMP-02 remains visibly seeded until PH3 assignment replaces it; the close-out PR needs remote CI. |
| #14 - M3-PH2-T05 - TC08/TC09 | Four TC08 component cases pass. The real workspace uses the shared session client and complete states. The full authenticated browser run passed 27 cases with one intentional desktop skip, including both themes, keyboard focus, 200% text, 320px portrait, phone landscape and the phone-only TC09 isolation journey. | The close-out PR needs remote CI. |

## Registered migrations and owner review

PR #28 moves Syauqi's reviewed start-delivery draft into registered revision `0006_delivery_functions` without changing its body, then adds `0007_delivery_final`. The close-out review found no issue in 0006's actor lock, assignee check, expected-version check, monotonic history time, atomic status/history/audit write, ownership or grants. The 0007 review found the documented actor-target-parcel lock order, restricted `lock_assignee` execution, proof metadata validation and terminal transition behavior consistent with the contract and its new integration cases.

This is Syauqi's owner review of the M3 revisions. It does not replace Naszrul's requested review of the account lock helper or the two other owners' contract sign-off required by #11.

## Rider integration

- A16 is mounted at `GET /api/v1/rider/parcels`; A17 is mounted at `POST /api/v1/rider/parcels/{parcelId}/status`.
- A17 reads the bounded multipart body only after authentication, role and CSRF checks. It never retries a mutation automatically.
- The response uses M2's shared `readParcelDetail` service, so the Rider action and A12 do not maintain competing private projections.
- A16 and A17 are in the shared authorization matrix for anonymous, two Sellers, two Riders, Admin, inactive and must-change identities.
- Rider integration tests now use A01/A03 through `loginAs`. The disabled-cookie case signs in first and disables that real session afterward. The shared inactive matrix control remains the documented pre-disable fixture session.
- The H25 profile remains test-only and every manifest row carries `source: 'seeded'`.

## Airway UI decisions

Design read: phone-first operator workspace for a Rider in Airway's freight-label language, ENERGY 3 / RHYTHM 3 / MOTION 1.

| Decision | Reason |
| --- | --- |
| Flat parcel records rather than dockets | Riders scan multiple assignments; the docket is reserved for one parcel document or completed handoff. |
| Barlow Condensed workspace heading and DM Sans controls | These are Airway's established status/work typography roles. |
| Brand-indigo Start delivery button | It is the only permitted primary action on an assigned row. Status remains a separate text label, so color is not the only signal. |
| 24px section rhythm and 44px controls | The spacing separates filter, feedback and records while preserving phone touch targets. |
| No entrance animation | MOTION 1 limits movement to immediate action feedback and avoids distracting a working list. |

The screen adds no new asset, icon package, gradient, glow, glass or decorative content. It uses the existing theme tokens and status component. Long tracking identifiers wrap, records stack to one column on narrow screens, and Start delivery disappears after the committed status refetch.

## Checks in this checkout

| Check | Observed result |
| --- | --- |
| TypeScript and ESLint | Passed on 27 November 2026. |
| TC08 component file | 4 tests passed. |
| Full unit/component attempt | 394 of 395 passed; the existing import-graph case exceeded its five-second limit. The isolated one-worker rerun passed all 8 cases in that file. |
| SQL hardening | Passed with registered 0006/0007. |
| Contract generation and check | Passed; the OpenAPI snapshot now includes mounted A16/A17 and the A17 multipart/detail contract. |
| Airway design check | Theme parity, generated CSS and all 32 contrast pairs passed. |
| Plan documentation checker | 18 phase files, 192 tasks, 265 cases, 44 handoffs, 6 substitutes, 39 decisions, 7 external items and 15 integration scenarios; zero errors or warnings. |
| Production build | Passed on Next.js 16.4.6; A16, A17 and `/rider/parcels` appear in the route output. |
| PR #28 remote CI | App, unit, lint/type, integration, migration, local-stack smoke, contract, dependency and secret jobs passed on head `336a5f9`. |
| Registered migration chain | Bootstrap, migrate twice, catalog verification and private Storage initialization passed on the retained isolated test volume. |
| H25 fixture profile | Base fixtures loaded, then `rider-assigned` loaded twice without an error or duplicate. |
| Integration suite | 17 files and 97 tests passed, including the A16/A17 authorization matrix and delivery-final migration cases. |
| Authenticated browser suite | 27 passed, with one intentional desktop skip for phone-only TC09. Existing auth and Seller journeys also passed. |

## Delivery gate

- R-02/R-03 PASS: new UI copy contains no em dash; long identifiers wrap and the browser case checks portrait/landscape overflow.
- R-17/R-18/R-23/R-36/R-38 PASS: the screen shows only API data or the explicitly seeded test profile; no assets, metrics, people or claims were invented.
- R-24/R-26 PASS: every record link targets the authorized A12 screen and the only action calls mounted A17.
- R-25 PASS: all 32 repository Airway contrast pairs passed; the change adds no new color.
- R-27 PASS: loading, empty, filtered-empty, paged-empty and error/retry states are implemented and component-covered.
- R-32 PASS: native select, links and buttons retain the shared 3px focus treatment; the browser case checks keyboard focus.
- R-34 PASS: the browser case switches and captures both themes; the component uses semantic tokens only.
- R-35 PASS: production build passed; all 27 applicable authenticated browser cases passed with no page errors, including every Rider control and TC09.
- Purpose and liveliness PASS: no new decorative technique was added; the Airway design read and each major decision are recorded above.
- Craftsmanship PASS: one real task leads the screen, all controls have behavior, the five data states exist, and the action refetches committed server state without automatic mutation retry.

G1 and G2 are not marked complete by these issues. Final issue closure waits for the explicit pending items in the first table.
