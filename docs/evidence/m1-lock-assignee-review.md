# M1 review of `lock_assignee` (account-locking helper in revision 0007)

Reviewed 27 November 2026 by Naszrul (M1 owner of `auth_fn_owner` and the account tables) against `main` at e1dbdf3. Requested by Syauqi's M3 close-out ([evidence](m3-issues-11-14.md)).

## Outcome

**Accepted as implemented.** No change to `0007_delivery_final` is requested. The one condition set during the review, a race test between assignment and disablement, is delivered (see Condition).

## What was reviewed

`app.lock_assignee(p_rider_id bigint)` in `db/sql/0007_delivery_final.sql`, and how `assign_parcel` uses it.

| Property | Finding |
| --- | --- |
| Why it exists | `domain_writer` has no access to `app_user`, so it cannot lock or read the target Rider. The helper is owned by `auth_fn_owner`, which holds the needed privileges, the same pattern as `lock_active_actor`. This keeps account locking inside M1's ownership boundary. Accepted. |
| Definition | `SECURITY DEFINER`, `search_path = pg_catalog, app, pg_temp`, owner `auth_fn_owner`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`, `GRANT EXECUTE` to `domain_writer` only. Meets the repository hardening rules. |
| Reachability | `app_runtime` cannot call it directly (the catalog test asserts `runtime: false`, and the 0008 tests assert SQLSTATE 42501 for a direct call), so the web layer cannot probe account types through it. |
| Lock | `SELECT ... FOR SHARE` on the target `app_user` row. A concurrent `set_user_active` takes `FOR UPDATE` on the same row, so a disablement waits for the assignment to commit, and an assignment that starts after a committed disablement sees `is_active = false`. Under READ COMMITTED the row is re-evaluated after the wait. Accepted. |
| Lock order | `assign_parcel` locks acting Admin (share), then the target Rider (share), then the parcel. M1's `set_user_active` locks the acting Admin (share) then the target (update) and never the parcel. Both take actor then target, so the two paths cannot form a deadlock cycle. Matches the contract order (actor, target, parcel). |
| Errors | Not found, not a Rider and inactive all raise the same `PT005` (`INVALID_ASSIGNEE`), so callers cannot tell the cases apart. Accepted. |
| Existing proof | `tests/integration/delivery-final.test.ts` covers an inactive and a non-Rider target (`INVALID_ASSIGNEE`) and the catalog properties (owner, `SECURITY DEFINER`, search path, runtime cannot execute). |

## Decisions recorded

1. **Must-change Riders can be assigned.** The helper checks only "active Rider", which is what the contract says (`INVALID_ASSIGNEE`: target is not an active Rider). A Rider whose password has not been changed yet is still an active Rider, so an Admin may pre-assign parcels. Such a Rider cannot act until the password is changed (A17 returns `PASSWORD_CHANGE_REQUIRED`). If the product owner later wants to exclude them, the change is one extra predicate in `lock_assignee`, made through a new revision.
2. **Credential expiry is M1's concern, not this helper's.** When the 72-hour initial or reset credential expires, the account stays active but cannot sign in. Assigned parcels then need Admin reassignment through A14 and A15, exactly like a disabled Rider. `lock_assignee` stays unchanged.

## Condition (owner: Naszrul, M1): delivered

The assign-versus-disable race was argued in the review but not proven by an existing test. It is now proven by `tests/integration/account-functions.test.ts`, in the describe block "lock_assignee against set_user_active (assign versus disable)", delivered with revision `0008_account_functions` (branch `feat/m1-ph3-account-functions-0008`):

- A disablement started while an assignment holds the Rider waits (it has not settled after 400 ms), applies after the assignment commits, and the parcel is then assigned to a Rider who is inactive. A further assignment to that Rider fails with `PT005`.
- An assignment started while a disablement is pending waits, then fails with `PT005` after the disablement commits, leaving the parcel Registered.
- The web runtime role cannot call `lock_assignee` directly (SQLSTATE 42501).

All three pass on three consecutive runs, and the full isolated integration project (99 tests) passes with them. Plan reference: M1-PH4-T03 (the full race suite remains PH4 work) and the M3 close-out risk row "Disablement races with a parcel write".
