# M1 PH5: Integrated AWS deployment and operational readiness

Owner: NASZ (deployment coordinator for the group). Phase PH5 of [phase framework](../../../shared/phase-framework.md). Status: Planned. No AWS resource exists; provisioning requires EXT-04 values and an explicit instruction from the team. Provisioning commands are not run by this plan.

## 1 Objective

The integrated stack runs on one AWS EC2 instance behind HTTPS with the production topology from the [integration plan](../../../shared/integration-and-aws.md): only the proxy is public, PostgreSQL and FastAPI are private, secrets are supplied privately, first boot works from an empty volume, restart keeps data, a failed release can be rolled back, and Seller, Rider, Admin and public users all work on the live URL (rubric 1b).

## 2 Entry criteria

- G4 passed (hardened locally; local restore drill passed).
- EXT-04 resolved: AWS account access, region, instance size, budget, domain (or accepted address) and TLS approach confirmed by the team.
- Images build reproducibly from locked dependencies; migration revision recorded.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Role bootstrap, migration job, grant verification script | Zikri M2-PH1-T01, M2-PH5-T01 | H02, H52 | None; blocks T04 |
| EBS volumes, mount layout, backup and timer units | Qee M3-PH5-T01-T03 | H51 | Local named volumes for dry runs only |
| Restore environment and runbook for post-restore verification | Qee M3-PH5-T04 | H54 | Local drill from PH4 |
| Client-IP trust rule verified behind proxy for M2 rate limits | own T12 -> Zikri M2-PH5-T07 | H53 | Socket address only (limiter then keys the proxy; unacceptable for release) |

Independent now: T02 (config files), T03 (secrets design), T05 (benchmark harness), T07 (pipeline), T10 (needs GitHub admin).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH5-T01 | Provisioning plan and, after explicit team instruction, execution: EC2 instance (supported Linux, sized from measurements), security group (443 public, 80 only for redirect/certificate issuance, no 5432/8000 ingress, SSH restricted to administrator IPs or AWS-managed access, IPv6 rules consistent), IAM instance role limited to the backup bucket actions Qee defines, Elastic IP, DNS name; `HttpTokens=required` and hop limit 1 (IMDSv2 only); administrative access through AWS Systems Manager Session Manager by default (no inbound SSH), OS patching routine (`unattended-upgrades`) and a monthly image rebuild with Trivy scanning; fresh instance and credentials, never the PH3 walking skeleton | Port scan from an outside host shows only 80/443; instance role cannot read other buckets | TC06 | EXT-04 |
| M1-PH5-T02 | Reverse proxy and production Compose: HTTP to HTTPS redirect, TLS certificate automation, HSTS, security headers from PH4, `/api/v1` proxied to FastAPI, built React assets served with fingerprinted-asset caching and revalidated `index.html`, SPA fallback that never swallows `/api` 404s, `/internal` and proof paths blocked, body caps (JSON small, upload 6 MiB), upload and read timeouts sized for 4G, no response caching for `/api`, `limit_req`/`limit_conn` and header/body timeouts at the proxy, two Docker networks (`edge` for proxy and backend, `data` with `internal: true` for backend, runner and database), non-root users, `read_only` root filesystems, `cap_drop: [ALL]`, `no-new-privileges`, memory and process limits per service so PostgreSQL survives a flood, forwarded headers replaced and trusted only from the proxy, access logs without bodies or query strings | Config reviewed by Qee and Zikri; checks in TC06, TC12 | TC06, TC12 | T01 |
| M1-PH5-T03 | Secrets handling: choose and document where production secrets live (file-mounted credentials or Docker secrets from AWS SSM Parameter Store rather than plain environment variables; decision D-10), keep a secret inventory (name, purpose, owner, rotation period; separate `FINGERPRINT_KEY` and `RATE_LIMIT_KEY`), distinct credentials per role (migration, app_runtime, tracking_runtime, maintenance_runtime, ops_runtime, bootstrap), `FINGERPRINT_KEY`, Admin initial password; none in images, Git, CI logs or Compose files; rotation checklist and the list of secrets to rotate after a restore from compromise | Image and repository scan finds no secret; long-running containers hold only runtime credentials | TC05 | none |
| M1-PH5-T04 | First-boot automation (idempotent): start PostgreSQL, wait for readiness, run Zikri's role bootstrap and `verify_grants` scripts (authored in M2-PH4-T01), run Alembic with the migration credential, create the initial Admin(s) with the `provision-admin` command (password passed through a file descriptor, never shell history; `must_change_password` set), start backend, proxy and maintenance runner, remove bootstrap/migration credentials from long-running services; same script safe on an existing volume | Empty-volume and existing-volume runs both succeed; passwords unchanged on rerun | TC01, TC02 | H52, H02 |
| M1-PH5-T05 | Measure Argon2id on the instance and set production parameters so that p95 login latency is at most 500 ms with 15 concurrent logins and hashing memory stays below half of the backend container limit; sample login latency and concurrent-login memory (about 15 Riders, 50 Sellers and 2 Admins at peak); no capacity claim beyond measurements | Recorded numbers in the evidence log | TC09 | T01 |
| M1-PH5-T06 | HTTPS verification of session security: `__Host-ptl_session` accepted by browsers, `Secure`, `HttpOnly`, `SameSite=Lax`, no Domain; HTTP never receives the cookie; Host allow-list; CSRF and Origin checks with the real domain; no CORS | S-02 evidence from the live URL, including nmap port scan, testssl.sh TLS check and an OWASP ZAP baseline scan of the public routes, tool versions recorded | TC06 | T02 |
| M1-PH5-T07 | Release pipeline: build immutable images tagged by commit, record digests and migration revision, deploy by digest, keep the last known-good digest for rollback; rehearse a failed-release rollback where the schema is compatible and a rollback after users have written data (maintenance mode stays on, writes rejected, until the post-deploy smoke test passes); schema changes follow expand-then-contract so the previous image runs on the new schema | Rollback rehearsed once with recorded steps and time | TC03 | T04 |
| M1-PH5-T08 | Post-restore authentication verification with Qee's restore: run `purge-sessions`, re-apply `lock-accounts` from the operations log, then test that a cookie captured before the backup but revoked afterwards stays unauthorized, and fresh logins work for all roles | S-09 passes on the restored environment | TC07 | H54, H42 |
| M1-PH5-T09 | M1 cloud journeys on the live URL: Seller registration/login, Admin creation of a Rider, forced password change, disablement and old-session rejection, logout, password-change multi-device revocation; all roles log in online | INT-06 and the M1 legs of INT-01 and INT-05 pass | TC08 | T04 |
| M1-PH5-T10 | Branch protection and check names: after the first successful CI run on `main`, apply the PR-only protection (direct pushes blocked including admins, force-push and deletion blocked) with administrator rights; decide whether to require named checks and approvals and record the choice. Status stays pending until GitHub confirms | `gh api` readback or settings screenshot attached; EXT-03 updated | TC10 | EXT-03 |
| M1-PH5-T11 | Incident drill on the cloud stack: simulated report, lock a test Admin with the private command on the instance, verify old cookie rejection, recover, record elapsed time against the one-hour rule | Timed record in the runbook evidence | TC11 | M1-PH4-T11 |
| M1-PH5-T12 | Client-IP and proxy-trust verification: requests with forged `X-Forwarded-For` through the public path do not change the limiter source; the limiter sees distinct real sources behind the proxy; two clients do not share a bucket | M2 and M1 limits correct on the cloud | TC04 | T02 |

## 5 Affected components

`infra/compose.prod.yml`, `infra/proxy/`, `infra/scripts/{first-boot,rollback,provision-admin}`, `docs/runbooks/{deploy,rollback,incident}.md`, GitHub settings. Application code changes are limited to configuration, health endpoints and defects found.

## 6 Security requirements

HTTPS-only cookies and HSTS; private DB and application ports; least-privilege IAM and SSH; per-role database credentials; no secrets in images or Git; proxy header trust; no response caching of private APIs; immutable releases with rollback; documented incident response. Policies P1, P4, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH5-TC01 | Operations (OPS-06) | First-boot script on empty volume; rerun on existing volume | Stack healthy; one Admin; passwords unchanged; no migration from workers | INT-12, REV-06 |
| M1-PH5-TC02 | Operations (OPS-06) | After first boot inspect running containers' environment | Only runtime credentials present; bootstrap/migration secrets absent | REV-07, S-03 |
| M1-PH5-TC03 | Operations | Deploy a deliberately failing image, roll back by digest; repeat after a test parcel was written during the failed window | Previous digest serves; data intact (writes were refused during maintenance mode, so none is lost); steps and time recorded | release plan |
| M1-PH5-TC04 | Operations | Forged `X-Forwarded-For`; two real sources | Limiter keys on proxy-supplied real source; forged value ignored | M1-04, M2-07 |
| M1-PH5-TC05 | Operations / scan | Scan images, Compose files, repository and CI logs for secrets | None found | S-03 |
| M1-PH5-TC06 | Operations (S-02) | External port scan (nmap), redirect, certificate and TLS configuration (testssl.sh), cookie flags, Host/Origin rejection, `/internal` and proof path requests, container user, read-only filesystem and network segmentation inspection | Only 80/443 open; HTTP redirects; `__Host-` cookie Secure/HttpOnly/Lax; blocked paths 404/403 | S-02 |
| M1-PH5-TC07 | Operations (OPS-07) | Restore into isolated environment; old revoked cookie; fresh logins | Cookie 401; sessions purged; all roles log in | S-09, INT-12 |
| M1-PH5-TC08 | Browser (E2E-A04) | Live URL: M1 journeys for Seller, Rider, Admin | Pass as in PH3/PH4 browser tests, online | rubric 1b |
| M1-PH5-TC09 | Operations (OPS-09) | Argon2 benchmark; concurrent login sample | p95 login latency at most 500 ms at 15 concurrent logins; memory below the stated limit; parameters and numbers recorded | capacity |
| M1-PH5-TC10 | Process | Branch protection readback | Record-only check: the readback is attached and EXT-03 is updated to applied, partially applied or pending; no pass/fail label | EXT-03 |
| M1-PH5-TC11 | Operations | Cloud incident drill | Lock and old-cookie rejection complete within 15 minutes of the simulated report (leaving margin inside the one-hour rule); recovery time recorded | P5, S-06 |
| M1-PH5-TC12 | Operations | Security headers and caching at the proxy for `/api` and static assets | `no-store` on API; assets cached by fingerprint; `index.html` revalidated; headers from PH4 survive the proxy | S-08 |

## 8 Deliverables and handoffs

H50 (AWS stack, proxy, secrets, first boot) to Zikri and Qee; H53 (client-IP trust) to Zikri. Consumes H51, H52, H54. Live URL recorded in the status board only after TC06 and TC08 pass.

## 9 Exit criteria

- T01-T12 complete (T10 may show "pending external" with evidence of the blocker); TC01-TC12 pass.
- All four user types work on the live URL; restart/redeploy keeps data (with Qee's TC); cookie flags verified on HTTPS.
- Contributes to G5 items 1-3, 5-7.

## 10 Integration checkpoint

Run INT-01, INT-05, INT-06 and the M1 legs of INT-12 on the live stack together with Zikri's and Qee's cloud journeys; record URL, commit, image digests, migration revision and timestamp.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| AWS access or domain unresolved | Escalate at G3; fall back to a documented local-only run, which the rubric penalizes by 5 marks in 1b; record the loss honestly |
| Certificate issuance blocked by DNS | Use HTTP-01 on port 80 or an alternative approved by the team; do not disable `Secure` cookies |
| Single host failure | Documented restore from the latest backup onto a new instance (Qee); no availability claim |
| Bad release | Roll back by digest; if schema changed, maintenance mode and tested restore |
| Secret exposure | Rotate per checklist; lock accounts; incident runbook |

## 12 Deferred work

Final regression, test document, rehearsal and freeze (PH6). Managed database, load balancers, WAF and multi-instance availability are outside scope.
