# M1 PH5: Integrated cloud deployment and operational readiness

Owner: Naszrul (deployment coordinator for the group). Phase PH5 of [phase framework](../../../shared/phase-framework.md). Status: Planned. No cloud resource is provisioned by this plan; provisioning requires EXT-04 values and an explicit instruction from the team. Provisioning commands are not run by this plan.

## 1 Objective

After the complete local Next.js/full-Supabase implementation passes G4, adapt it to the chosen cloud host. Prove HTTPS, same-origin application routes, private administration/DB/Storage, per-service secrets, idempotent setup, durable objects/data, compatible rollback and all four user types on the live URL. Cloud execution is deferred; this plan does not create resources.

## 2 Entry criteria

- Local G4 passed on Next.js and the full Supabase Docker stack, including production-build and restore checks.
- EXT-04 resolved with actual hosting, budget/resources, domain/TLS, storage and backup choices.
- Supported pinned upstream Supabase setup, reproducible Next.js build and migration revision recorded.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Role bootstrap, migration job, grant verification script | Zikri M2-PH1-T01, M2-PH5-T01 | H02, H52 | None; blocks T04 |
| persistent Docker volumes, mount layout, backup and timer units | Syauqi M3-PH5-T01-T03 | H51 | Local named volumes for dry runs only |
| Restore environment and runbook for post-restore verification | Syauqi M3-PH5-T04 | H54 | Local drill from PH4 |
| Client-IP trust rule verified behind proxy for M2 rate limits | own T12 -> Zikri M2-PH5-T07 | H53 | Socket address only (limiter then keys the proxy; unacceptable for release) |

Independent now: T02 (config files), T03 (secrets design), T05 (benchmark harness), T07 (pipeline), T10 (needs GitHub admin).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH5-T01 | After local G4 and EXT-04, prepare/execute the chosen cloud host setup for Next.js and full Supabase Docker. Record actual provider, budget, measured resources, DNS/TLS and administrative access; expose only the HTTPS application/proxy. No public Studio, gateway admin, DB or pooler ports. If Next.js is on Vercel, Supabase needs separately reachable hosting; localhost is not reachable | External application checks and private-admin/DB denial on actual host; no free entitlement assumed | TC06 | EXT-04 |
| M1-PH5-T02 | Production Next.js routing/HTTPS: run the production Node build (not a static SPA fallback), nonce CSP compatible with hydration, dynamic/private no-store responses, safe proxy/body/time limits, trusted forwarded headers and private Supabase administration. Preserve full vendor Compose services and durable DB/Storage mounts; no public proof path | Local production configuration adapted and tested on the chosen cloud URL | TC06, TC12 | T01 |
| M1-PH5-T03 | Per-service secrets and rotation inventory: separate app/tracking, private Storage, bootstrap, migration, maintenance, ops, backup and vendor infrastructure credentials. Only intended credentials enter each command/service; no NEXT_PUBLIC_ secrets, Git or image secrets. Do not reuse Supabase owner/service-role credentials for app SQL | Repository, release config, logs and browser bundle scans; app cannot migrate or execute private jobs | TC05 | none |
| M1-PH5-T04 | Idempotent first setup: initialize full pinned Supabase vendor stack and wait ready; run app-role bootstrap/verify_grants, one node-pg-migrate job and private Admin provisioning, then production Next.js and maintenance runner. Existing volumes preserve users/passwords/objects. Web process never receives bootstrap/migration credentials | Empty and existing environment setups pass; vendor roles/schemas intact | TC01, TC02 | H52, H02 |
| M1-PH5-T05 | Benchmark Argon2id on actual deployed resources and record p95 latency, hashing parameters, memory and concurrent-login behavior. Tune bounded hashing work without weakening password security; do not promise fixed 15-user capacity from an untested free plan | Measurements and resource/quota limits recorded | TC09 | T01 |
| M1-PH5-T06 | HTTPS verification of session security: `__Host-ptl_session` accepted by browsers, `Secure`, `HttpOnly`, `SameSite=Lax`, no Domain; HTTP never receives the cookie; Host allow-list; CSRF and Origin checks with the real domain; no CORS | S-02 evidence from the live URL, including nmap port scan, testssl.sh TLS check and an OWASP ZAP baseline scan of the public routes, tool versions recorded | TC06 | T02 |
| M1-PH5-T07 | Release pipeline: record commit, Next.js build/deployment ID, application migration revision and pinned Supabase images; use container digests when containers are used. Rehearse compatible app rollback and keep schema-changing releases read-only until post-deploy smoke passes. Use expand-then-contract migrations; no automatic vendor downgrade | Previous compatible release serves with data preserved and measured rollback time | TC03 | T04 |
| M1-PH5-T08 | Post-restore authentication verification with Syauqi's restore: run `purge-sessions`, re-apply `lock-accounts` from the operations log, then test that a cookie captured before the backup but revoked afterwards stays unauthorized, and fresh logins work for all roles | S-09 passes on the restored environment | TC07 | H54, H42 |
| M1-PH5-T09 | M1 cloud journeys on the live URL: Seller registration/login, Admin creation of a Rider, forced password change, disablement and old-session rejection, logout, password-change multi-device revocation; all roles log in online | INT-06 and the M1 legs of INT-01 and INT-05 pass | TC08 | T04 |
| M1-PH5-T10 | Branch protection and check names: after the first successful CI run on `main`, apply the PR-only protection (direct pushes blocked including admins, force-push and deletion blocked) with administrator rights; decide whether to require named checks and approvals and record the choice. Status stays pending until GitHub confirms | `gh api` readback or settings screenshot attached; EXT-03 updated | TC10 | EXT-03 |
| M1-PH5-T11 | Incident drill on the cloud stack: simulated report, lock a test Admin with the private command on the instance, verify old cookie rejection, recover, record elapsed time against the one-hour rule | Timed record in the runbook evidence | TC11 | M1-PH4-T11 |
| M1-PH5-T12 | Client-IP and proxy-trust verification: requests with forged `X-Forwarded-For` through the public path do not change the limiter source; the limiter sees distinct real sources behind the proxy; two clients do not share a bucket | M2 and M1 limits correct on the cloud | TC04 | T02 |

## 5 Affected components

Future cloud overrides under `infra/`, production Next.js build/config, pinned `infra/supabase/`, private setup/rollback/admin scripts and deployment/incident runbooks. No separate backend frontend integration is introduced.

## 6 Security requirements

HTTPS-only cookies and HSTS; private DB and application ports; least-privilege host access and credentials; per-role database credentials; no secrets in images or Git; proxy header trust; no response caching of private APIs; immutable releases with rollback; documented incident response. Policies P1, P4, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH5-TC01 | Operations (OPS-06) | First-boot script on empty volume; rerun on existing volume | Stack healthy; one Admin; passwords unchanged; no migration from workers | INT-12, REV-06 |
| M1-PH5-TC02 | Operations (OPS-06) | Inspect intended credentials per deployed Next.js, Supabase vendor service and private job | Web service has only app/tracking plus required Storage credentials; migration/bootstrap/ops/maintenance/backup absent from web; vendor credentials confined to intended infrastructure | REV-07, S-03 |
| M1-PH5-TC03 | Operations | Deploy a deliberately failing image, roll back by digest; repeat after a test parcel was written during the failed window | Previous digest serves; data intact (writes were refused during maintenance mode, so none is lost); steps and time recorded | release plan |
| M1-PH5-TC04 | Operations | Forged `X-Forwarded-For`; two real sources | Limiter keys on proxy-supplied real source; forged value ignored | M1-04, M2-07 |
| M1-PH5-TC05 | Operations / scan | Scan images, Compose files, repository and CI logs for secrets | None found | S-03 |
| M1-PH5-TC06 | Operations (S-02) | Verify chosen HTTPS app, cookies, origin/Host denial, CSP/hydration, private gateway/Studio/DB, bucket direct denial and intended service secrets | HTTPS works; protected APIs/pages no-store; admin/DB/proofs not publicly reachable; __Host cookie valid | S-02 |
| M1-PH5-TC07 | Operations (OPS-07) | Restore into isolated environment; old revoked cookie; fresh logins | Cookie 401; sessions purged; all roles log in | S-09, INT-12 |
| M1-PH5-TC08 | Browser (E2E-A04) | Live URL: M1 journeys for Seller, Rider, Admin | Pass as in PH3/PH4 browser tests, online | rubric 1b |
| M1-PH5-TC09 | Operations (OPS-09) | Actual deployed Argon2 benchmark and concurrent login sampling | Latency, parameters, concurrency, memory and quota boundaries recorded; no capacity claim beyond results | capacity |
| M1-PH5-TC10 | Process | Branch protection readback | Record-only check: the readback is attached and EXT-03 is updated to applied, partially applied or pending; no pass/fail label | EXT-03 |
| M1-PH5-TC11 | Operations | Cloud incident drill | Lock and old-cookie rejection complete within 15 minutes of the simulated report (leaving margin inside the one-hour rule); recovery time recorded | P5, S-06 |
| M1-PH5-TC12 | Operations | Headers and caching on real Route Handlers, Server Component navigation and static assets | Private pages/APIs/proofs no-store; no shared identity cache; framework hydration works with CSP; static assets cache normally | S-08 |

## 8 Deliverables and handoffs

H50 (cloud stack, proxy, secrets, first boot) to Zikri and Syauqi; H53 (client-IP trust) to Zikri. Consumes H51, H52, H54. Live URL recorded in the status board only after TC06 and TC08 pass.

## 9 Exit criteria

- T01-T12 complete (T10 may show "pending external" with evidence of the blocker); TC01-TC12 pass.
- All four user types work on the live URL; restart/redeploy keeps data (with Syauqi's TC); cookie flags verified on HTTPS.
- Contributes to G5 items 1-3, 5-7.

## 10 Integration checkpoint

Run INT-01, INT-05, INT-06 and the M1 legs of INT-12 on the live stack together with Zikri's and Syauqi's cloud journeys; record URL, commit, release identifiers, migration revision and timestamp.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| cloud access or domain unresolved | Resolve before PH5; if unresolved by final assessment record a local-only run, which the rubric penalizes by 5 marks in 1b; record the loss honestly |
| Certificate issuance blocked by DNS | Use HTTP-01 on port 80 or an alternative approved by the team; do not disable `Secure` cookies |
| Single host failure | Documented restore from the latest backup onto a new instance (Syauqi); no availability claim |
| Bad release | Roll back by digest; if schema changed, maintenance mode and tested restore |
| Secret exposure | Rotate per checklist; lock accounts; incident runbook |

## 12 Deferred work

Final regression, test document, rehearsal and freeze (PH6). Managed database, load balancers, WAF and multi-instance availability are outside scope.
