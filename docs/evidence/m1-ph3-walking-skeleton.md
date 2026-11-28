# M1 PH3 local production-build walking skeleton (T12)

Date: 28 Nov 2026. Branch: `feat/m1-ph3-walking-skeleton`, on `main` at `13767ab`. This is **local evidence only**: a production build of the Next.js app running against the full local Supabase stack. It is not a live cloud result, and no cloud resource was created or touched (cloud execution stays in PH5, after local G4 and EXT-04).

## What was run

| Item | Value |
| --- | --- |
| Node.js | 24.14.0 |
| Next.js | 16.4.6 (`npm run build`, `npm start`, profile `test`, port 3100) |
| Database | PostgreSQL 17.6 in the local full Supabase Docker stack, port 54323 |
| Roles | The app connects as `app_runtime` and `tracking_runtime` only; the walkthrough holds no database credential |
| Preparation | `local:up`, `db:bootstrap`, `db:migrate` (0001 to 0010), `db:fixtures`, `db:verify`, `storage:init` all succeeded |

```bash
PTL_PROFILE=test npm run build
PTL_PROFILE=test npm start
PTL_PROFILE=test PTL_BASE_URL=http://localhost:3100 npx tsx --conditions=react-server scripts/walkthrough-m1-ph3.ts
```

`scripts/walkthrough-m1-ph3.ts` makes real HTTP requests, creates its own accounts and parcels (so it can be rerun), and never prints a password, token, tracking number or cookie value.

## Result

```text
M1-PH3 walking skeleton against http://localhost:3100
PASS  health: status 200, cache-control no-store
PASS  page headers: status 200, nosniff nosniff, referrer-policy no-referrer, CSP present
PASS  register Seller (A02): status 201, role SELLER, no new session issued
PASS  registration cannot choose a role: status 422, code VALIDATION_ERROR
PASS  Seller signs in: status 200, cookie HttpOnly + SameSite=Lax, no Domain
PASS  Admin signs in: status 200
PASS  Admin creates a Rider (A08): status 201, role RIDER, must change true, password not echoed
PASS  new Rider is held on the password change: Rider list 403 PASSWORD_CHANGE_REQUIRED
PASS  Rider appears in the Admin picker (A07): status 200
PASS  Rider changes the password (A06): change 204, old cookie afterwards 401
PASS  Rider works normally after the change: sign-in 200, list 200
PASS  Seller registers a parcel (A10): status 201, REGISTERED
PASS  replayed registration returns the same parcel: status 200, same id true
PASS  Seller sees it in the list (A11): status 200
PASS  Admin sees it, unassigned (A14): status 200
PASS  Admin assigns the Rider (A15): status 200, ASSIGNED
PASS  Rider sees the parcel (A16): status 200
PASS  Rider starts the delivery (A17): status 200, OUT_FOR_DELIVERY
PASS  Seller sees the new status (A12): status 200, OUT_FOR_DELIVERY
PASS  public tracking (A13): status 200, 3 recorded events ending OUT_FOR_DELIVERY, only status and time per event, no recipient, contact, Rider or proof fields
PASS  Seller denied: Admin users: status 403
PASS  Seller denied: Admin parcels: status 403
PASS  Seller denied: Rider list: status 403
PASS  another Seller cannot read the parcel: status 404
PASS  another Rider cannot act on the parcel: status 404
PASS  disabled Rider loses access at once (A09): disable 200, old cookie 401, new sign-in 401
PASS  parcel flagged for reassignment (A14): status 200
PASS  reactivation allows a fresh sign-in only: reactivate 200
PASS  Admin resets a password (A21): reset 200, old session 401, temporary sign-in must change true
PASS  sign out (A04): logout 204, reused cookie 401

All walking-skeleton steps passed
```

## What each part shows

| Evidence | Where |
| --- | --- |
| Local build and HTTP | `health` and `page headers` (nosniff, no-referrer, a Content Security Policy header, `no-store` on the API) |
| Cookies | `Seller signs in`: HttpOnly, SameSite=Lax, no Domain; the dev cookie name has no `Secure` flag because the profile is HTTP; production uses the `__Host-` cookie with `Secure` |
| Real login and roles | Seller, Admin, Rider and a second Seller and Rider all sign in over HTTP; the must-change Rider is held until A06 |
| Parcel registration, list, assignment, start delivery | A10 (with a safe replay), A11, A14, A15, A16, A17, A12 in order, with runtime roles only |
| Public tracking | A13 returns only recorded statuses and times, nothing about the recipient, contact, Rider or proof |
| Boundaries | Seller denied on Admin and Rider routes; another Seller gets 404 on the parcel; another Rider gets 404 on the status call |
| Disablement | The Rider's open session fails at once, sign-in fails, the parcel appears under the reassignment filter, and reactivation allows a fresh sign-in only |
| Storage | `storage:init` verified the private proof bucket; the proof upload and final-outcome steps are not part of this smoke test |

The full browser suite also ran against the same build with `PTL_E2E_AUTH=1` and `--workers=1`: 51 passed, 1 skipped (the skip is by design for the phone-only journey on desktop). One run failed `rider-parcels` TC17 until the `rider-assigned` fixture profile was loaded (`npm run db:fixtures -- --profile=rider-assigned`); with the profile it passes. That spec needs the profile, which is stated in its skip message.

## Gaps and known limits

- **Not run here:** proof upload and the final delivered or failed outcomes (M3 PH3 proof work), retention and proof maintenance jobs, backup and restore, the account journal, and the Admin audit list and screens, whose pull requests were still open when this ran.
- **Hashing concurrency:** the password hasher is bounded (`HASH_CONCURRENCY`, default 2) and answers 503 BUSY when saturated. The browser journeys therefore run with `--workers=1`; concurrent sign-ins from one process are refused by design.
- **Plain HTTP:** the local profile serves HTTP, so `Secure`, `__Host-` cookies and HSTS are not exercised. They need an HTTPS deployment.
- **Single process:** the rate limiter and sessions live in PostgreSQL, so a second instance would share them; this run used one instance only.
- **Local fixtures:** the data is synthetic, and the stack is a development convenience, not a production topology.

## Later cloud checklist (not executed, nothing provisioned)

1. Create the Supabase project and the application roles with generated secrets; do not reuse local ones. Record who holds each credential.
2. Run `db:bootstrap` and `db:migrate` through the migration role, then `db:verify`, and keep the output.
3. Create the private proof bucket through the Storage API and confirm it is not public.
4. Configure the web service with `app_runtime` and `tracking_runtime` URLs, the Storage service key, `APP_ORIGIN` (HTTPS), `FINGERPRINT_KEY`, `RATE_LIMIT_KEY` and the `__Host-` cookie setting; confirm the web process holds no migration, operator or backup credential.
5. Confirm HTTPS, HSTS, the CSP header and the client-address header the platform provides (the Vercel change is already on `main`).
6. Provision the first Admin with the private operations command, then change its password.
7. Run this walkthrough against the deployed address and attach the output, marked as a cloud run.
8. Check backups, the restore runbook, the scheduled maintenance jobs and the account journal volume before any real use.
