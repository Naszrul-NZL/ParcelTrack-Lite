# M1 PH2 acceptance walkthrough (T13) and security baseline (T11)

Run on 17 November 2026 against branch `feat/m1-ph2-session-login` (commits b321b68 and e4b2a06, plus the T11/T13 evidence commit), the built app (`npm run build`, `PTL_PROFILE=test npm start`) on the isolated local Supabase stack, with the seven synthetic accounts from `npm run db:fixtures`. Node.js 24.14.0, Docker Engine 29.4.0. Passwords, tokens and cookie values are never printed.

## Re-run

```powershell
$env:PTL_PROFILE='test'; npm run local:up; npm run db:bootstrap; npm run db:migrate; npm run db:fixtures
$env:PTL_PROFILE='test'; npm run build; npm start          # in a second terminal
$env:PTL_PROFILE='test'; $env:PTL_BASE_URL='http://localhost:3100'
npx tsx --conditions=react-server scripts/walkthrough-m1-ph2.ts
```

The script throttles only the unknown username `throttle.probe`, so the seeded accounts are not locked out for 15 minutes. Run it again after the 15 minute window or with a different probe name if it reports a throttled step.

## Output

```text
M1-PH2 walkthrough against http://localhost:3100
PASS  failed login (SQL-injection username): status 401, code AUTH_INVALID, no SQL text, /auth/me afterwards 401
PASS  failed login (wrong password): status 401, code AUTH_INVALID, no SQL text, /auth/me afterwards 401
PASS  login as SELLER: status 200, role SELLER, cookie HttpOnly+SameSite=Lax, no Domain, cache-control no-store
PASS  session rotated at login (SELLER): anonymous cookie differs from the signed-in cookie
PASS  refresh keeps the session (SELLER): /auth/me status 200
PASS  logout (SELLER): status 204, cookie expired
PASS  old cookie after logout (SELLER): /auth/me status 401
PASS  login as RIDER: status 200, role RIDER, cookie HttpOnly+SameSite=Lax, no Domain, cache-control no-store
PASS  session rotated at login (RIDER): anonymous cookie differs from the signed-in cookie
PASS  refresh keeps the session (RIDER): /auth/me status 200
PASS  logout (RIDER): status 204, cookie expired
PASS  old cookie after logout (RIDER): /auth/me status 401
PASS  login as ADMIN: status 200, role ADMIN, cookie HttpOnly+SameSite=Lax, no Domain, cache-control no-store
PASS  session rotated at login (ADMIN): anonymous cookie differs from the signed-in cookie
PASS  refresh keeps the session (ADMIN): /auth/me status 200
PASS  logout (ADMIN): status 204, cookie expired
PASS  old cookie after logout (ADMIN): /auth/me status 401
PASS  CSRF-less login (no token): status 403, code CSRF_INVALID
PASS  CSRF-less login (wrong token): status 403, code CSRF_INVALID
PASS  CSRF-less login (no Origin or Sec-Fetch-Site): status 403, code CSRF_INVALID
PASS  CSRF-less login (foreign Origin): status 403, code CSRF_INVALID
PASS  CSRF-less logout: logout status 403, session still valid (200)
PASS  login throttling: statuses 401,401,401,401,401,429, Retry-After 34
PASS  Seller opening an Admin API route: status 404: /admin/users is planned (A07, PH3), so there is no route to deny yet
All walkthrough steps passed
```

## What each plan step covered

| T13 step | Evidence |
| --- | --- |
| Failed login with an SQL-injection string and with a wrong password | Steps 1 and 2: 401 `AUTH_INVALID`, no SQL text, `/auth/me` stays 401 |
| Successful login as each role | Seller, Rider and Admin: 200, correct role, HttpOnly + SameSite=Lax cookie with no Domain, rotated session |
| Refresh | `/auth/me` returns 200 with the same account; browser reload covered in `tests/e2e/auth.spec.ts` |
| Logout, then reuse of the old cookie | 204 with an expired cookie, then 401 for the old cookie |
| Seller opening an Admin route denied | Server role check proven on a probe route (M1-PH2-TC08); Admin page denial in `tests/e2e/auth.spec.ts`. The Admin API endpoints (A07 and later) are **planned for PH3**, so the walkthrough only shows `/admin/users` returns 404 today |
| CSRF-less POST rejected | Login without a token, with a wrong token, with a foreign `Origin` and with no provenance, plus logout without a token: 403 `CSRF_INVALID`, session unchanged |
| Throttling (extra) | 5 failures then 429 with `Retry-After` |

## Planned, not demonstrated

Registration (A02), password change (A06), Rider creation and user management (A07 to A09), the audit viewer (A20), password reset (A21), Admin-only API denial against real Admin endpoints, and the PH4 race and incident cases (M1-11, M1-12) are later phases. TC21's 100-concurrent-login capacity run is represented by the oversize-body and hashing-overload tests, not a 100-request run.

## Security worksheet rows executed (T11)

M1-01, M1-03, M1-04 (login part), M1-07, S-01 (login and logout), S-04 and S-05 (login events); actual results with environment are in [security-tests.md](../security-tests.md). Every other row stays Not run.
