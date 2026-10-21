# ParcelTrack Lite checkpoint preparation

Checkpoint date: 22 October 2026, Malaysia time.

This pack prepares the five deliverables supplied by the team. It draws on the local project briefing, case study and marking rubric. The three working demos remain to be built. Plans and test expectations below are not evidence of implementation.

The [complete project plan](project-plan.md) and [separate module folders](project-plan.md#plans-by-owner) define the full implementation scope. Tomorrow's checkpoint needs small working slices; it does not require completing all later-phase functionality described in those plans.

## 1 Module allocation and development stack

The team confirmed this allocation on 21 October 2026:

| Owner | GitHub | Required module | Primary responsibility |
| --- | --- | --- | --- |
| NASZ | Naszrul-NZL | M1 Login and User Management | Seller registration, login/logout, password change, admin management of Rider accounts |
| Zikri | Zikri809 | M2 Parcel Registration and Public Tracking | Parcel registration, seller parcel list/search, tracking numbers, public status history |
| Qee | Qee110 | M3 Delivery Update and Admin Dashboard | Admin assignment, rider parcel list/status updates, proof photo, dashboard counts |

Database design, shared layout and integration belong to all three members. Each member must understand, test and explain their own module's code. The confirmed GitHub handles are not substitutes for the full names and matric numbers required on the lecturer's allocation sheet.

### Stack decisions and recommendation

| Layer | Proposal | Reason |
| --- | --- | --- |
| Backend | FastAPI, confirmed | One Python API application shared by all modules |
| Frontend | React, confirmed preference; TypeScript and Vite proposed | Provides the team's preferred interface stack |
| Database | PostgreSQL in Docker with RLS, selected direction | Supports database-enforced row isolation alongside application permissions |
| Database access and migrations | SQLAlchemy with psycopg and Alembic | Shares transactions and tracks schema/RLS revisions |
| Password storage | Argon2id through a maintained password library | Matches the rubric's hashing requirement |
| Hosting | AWS confirmed; Docker Compose on one EC2 instance proposed | Runs the application and self-managed PostgreSQL together with persistent storage |
| Version control | Existing GitHub repository | Keeps module contributions and integration changes reviewable |

The team chose React, FastAPI and self-managed PostgreSQL with RLS in discussion on 21 October 2026. Use server-side sessions with an HttpOnly cookie and explicit CSRF protection, serving React and the API through the same cloud origin. The [shared system contract](shared/system-contract.md) defines session behavior, APIs, authorization and limits. None of these components has been installed or implemented by this planning task.

The brief names Flask/Django for Python and MySQL/SQLite databases. Record FastAPI/PostgreSQL as deliberate team alternatives and raise that difference with the lecturer. This pack does not claim lecturer approval.

RLS is an additional data-access boundary. Sellers may read only their own parcels, Riders only assigned parcels, and Admins all parcels. Write permissions must remain specific to the operation: Admin assignment does not grant Rider status-update permission. Public tracking needs a dedicated restricted query path exposing only status and timestamps. See [RLS design and connection rules](initial-erd.md#postgresql-row-level-security-design).

The team selected AWS as its hosting provider on 21 October 2026. The proposed service is one EC2 instance running Docker Compose. Account access, region, instance size, budget, domain and live URL have not been established in this task. Do not put secrets into Git or rely on temporary application storage for the database or proof images.

### Proposed AWS deployment

- An HTTPS reverse proxy serves the built React application and forwards /api requests to the backend. Only the proxy publishes public application ports.
- PostgreSQL stays on the internal Docker network, with no public port 5432. Keep backend application ports private too. Allow HTTPS publicly and HTTP only for redirection/certificate setup as needed; restrict any SSH access to authorized administrator IPs. See [AWS security-group guidance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html).
- Use encrypted EBS-backed storage for persistent database and private proof-photo volumes. Check DeleteOnTermination settings explicitly; data survival after instance termination depends on those settings. See [EBS persistence and encryption](https://docs.aws.amazon.com/ebs/latest/userguide/EBSFeatures.html).
- Maintain separate database/proof backups and test restoration. Docker named volumes do not protect against deletion of the underlying disk or account-level incidents.

AWS is confirmed, but these resources have not been provisioned. EC2 is the current architecture proposal; AWS hosting does not require adopting a managed database service.

## 2 Initial ERD and project repository

Repository: [Naszrul-NZL/ParcelTrack-Lite](https://github.com/Naszrul-NZL/ParcelTrack-Lite).

The initial design is in [initial-erd.md](initial-erd.md). It contains five application entities: User, Parcel, ParcelStatusHistory, DeliveryProof and AuditEvent. Framework session and rate-limit storage will be additional infrastructure tables or services, outside this conceptual ERD.

Keep recipient data on the Parcel record. A recipient does not need an account. Public tracking must query a restricted status-history representation, so recipient fields and proof images never enter its HTML or response data.

Suggested future source organization:

```text
backend/        shared API application
  accounts/     conceptual M1 package owned by NASZ
  parcels/      conceptual M2 package owned by Zikri
  delivery/     conceptual M3 package owned by Qee
  migrations/   shared schema and RLS migrations
frontend/       React application with module feature folders
infra/          Docker Compose and cloud configuration
docs/           ERD, requirements and test records
```

These application folders do not exist yet. Backend package paths will follow the selected framework. Agree on User and Parcel models before independent module development. Assign one integrator to order shared schema and RLS migrations; every member commits migrations for their own changes and resolves conflicts before merging.

Use small commits attributed to the person doing the work. Include setup instructions, migrations and synthetic demo-data creation in the repository. If using the lecturer's starter kit, declare it and preserve an untouched dated copy or baseline as the brief requires. No starter kit has been identified in the current repository.

## 3 One interface and working demo per module

For tomorrow, aim for a small integrated database-backed workflow. A screen drawing or a button that only changes browser text does not establish a working module. Each demo must save or retrieve real application data and enforce permissions on the server.

| Module | Primary interface | Minimum working demonstration | Visible security evidence |
| --- | --- | --- | --- |
| M1 | Login page and protected landing page | Log in with a seeded account, refresh the protected page and log out | Wrong password fails; logged-out session cannot reopen protected content |
| M2 | Seller registration form and own-parcel list | Create a parcel, obtain its tracking number and refresh to verify persistence | Invalid weight rejected; another Seller cannot retrieve the parcel |
| M3 | Rider assigned-parcel page | Seed an assigned parcel and persist its change to Out for Delivery | Another Rider cannot update it; actor/time are recorded |

Public tracking, Admin assignment/dashboard and proof upload belong to the complete project scope. Seeded assignments are acceptable for demonstrating an early slice; they do not count as implemented assignment functionality.

### Shared demo data

Prepare one Admin, two Sellers and two Riders using synthetic names and contact details. Supply credentials privately; never commit usable passwords. Generate a harmless JPG or PNG for proof and retain clearly labeled invalid test fixtures outside public storage.

### Later integrated demonstration order

1. NASZ logs in as Seller A and shows a failed login, successful login and denied Admin access.
2. Zikri registers a parcel and notes the generated tracking number. Refresh to show that it is stored.
3. Zikri switches to Seller B and demonstrates that direct access to Seller A's parcel fails.
4. Qee logs in as Admin and assigns that parcel to Rider A.
5. Qee logs in as Rider B and demonstrates that an update to Rider A's parcel fails.
6. Qee logs in as Rider A, records Out for Delivery, and then Delivered with a valid proof image.
7. Zikri opens public tracking without login and shows status timestamps without recipient data or the photo.
8. Qee returns to the Admin dashboard and shows the updated counts.

This sequence is the later end-to-end target after the small checkpoint slices work. The Week 14 requirement is a 30-minute group demonstration, approximately 10 minutes per person. The supplied documents do not set tomorrow's presentation length.

### Later functionality still required

An initial demo does not complete the modules. M1 also needs Seller self-registration, Admin creation/disablement of Riders and password change. M2 needs own-parcel search, validation and lookup rate limits. M3 needs the Failed outcome, complete upload controls, status validation and accountable logs. All module security controls and integration need testing before the final submission.

## 4 Security requirements

The [security worksheet](security-tests.md) maps module requirements to observable results. Every requirement starts as planned, with no passing result claimed.

The five policies in the case study require:

- P1: Server-side role and parcel access checks, individual accounts, and disabling Rider accounts on the day a rider leaves. Disabled accounts must lose access through existing sessions too.
- P2: Passwords of at least 10 characters, unique to this application, with prompt reporting of compromise. The application can enforce length and common-password checks; cross-service uniqueness also requires user guidance.
- P3: Use recipient data only for delivery, prevent unauthorized disclosure/export, and delete or anonymize it 12 months after delivery. This retention period is the project's stated policy. Plan removal of personal information in proof images too.
- P4: No source-code secrets, no real recipient data in testing, and generic user errors with technical details limited to protected logs.
- P5: Record successful and failed logins and status changes without passwords or full addresses. Report suspected incidents to the Admin within one hour and lock affected accounts.

Document the proposed retention procedure and incident process even if their automation is scheduled after the initial demo. Do not describe them as implemented until verified.

## 5 Completed work challenges and next steps

### Verified baseline

| Item | Status as of this preparation |
| --- | --- |
| Briefing, case study and rubric | Read and mapped to this plan |
| Git repository | Initialized locally with origin configured to the GitHub repository |
| Team access | Three GitHub collaborators verified |
| Module allocation | Confirmed by team |
| Reference-file ignore rules | Created locally and verified |
| ERD, requirement matrix and demo sequence | Drafted locally in this pack |
| Development stack | React, FastAPI, PostgreSQL/RLS, Docker and AWS selected; detailed implementation contracts drafted |
| Application, database and module interfaces | Not built |
| Security test execution | Not run; no application exists |
| Cloud deployment | AWS selected; EC2 architecture proposed; no resources configured or live URL |

Check Git history and the published branch/PR for the revision being presented. This pack describes planning progress; it does not claim implementation or deployment completion.

### Challenges and response

| Challenge | Response |
| --- | --- |
| No demo code and checkpoint is tomorrow | Prioritize one working path per module and integrate early |
| Modules depend on the same users, parcels and statuses | Agree on the ERD, role values and status transition rules first |
| Role checks can be confused with parcel ownership | Test both a wrong role and a different user with the same role |
| Uploads and public tracking can expose personal data | Use private proof storage and a minimal public response |
| AWS account access and deployment details are not yet established | Confirm access and deployment configuration early; verify persistence after restart |

### Execution order before the checkpoint

1. Use the confirmed FastAPI stack and shared contract. NASZ completes/submits the lecturer's allocation sheet by Week 5, including full names/matric numbers and starter-kit declaration if applicable, and retains the receipt. Current submission status is unverified; do not assume tomorrow is the Week 5 deadline.
2. Create the shared schema/migrations and seed synthetic accounts, parcels and Rider assignments.
3. NASZ builds login/logout; Zikri builds registration/persistence; Qee builds assigned-parcel view and Out for Delivery update.
4. Run the three checkpoint slices against the same database/session and record actual outcomes.
5. Present the ERD, security requirements, full module plans and AWS architecture. Confirm AWS account access for subsequent deployment; if a live cloud slice is available, demonstrate it accurately.
6. Capture real evidence and list unimplemented features explicitly. Continue through P2 to P5 of the full project plan after the checkpoint.

If time prevents a cloud demo, disclose that gap. A deployment plan does not satisfy a requirement for a live cloud application. The final rubric deducts five marks from deployment/integration for a local-only system.

### Presentation outline

1. Project purpose, team and confirmed module ownership.
2. Proposed or confirmed stack, repository URL and cloud status.
3. Initial ERD and shared data rules.
4. NASZ demonstrates M1 and one rejected access attempt.
5. Zikri demonstrates the P1 registration/persistence slice and ownership check; describes public tracking/privacy as planned until implemented.
6. Qee demonstrates the P1 assigned-parcel/Out for Delivery slice; describes assignment/dashboard/upload controls as planned until implemented.
7. Security requirements with actual test evidence where available.
8. Completed work, current challenges and next steps.

Until the application exists, describe slides 4 to 6 as planned demonstrations. Replace those descriptions with live evidence as work is completed.

## Source materials

- ParcelTrack Lite Project Briefing.pptx: slides 6 to 13 cover modules, ownership, access, security, stack, deployment and submission.
- ParcelTrack_Lite_Case_Study.docx: sections 4 to 10 define functionality, roles, environment, threats, policies and final submission.
- Rubric_Project_STTCK3033_ParcelTrack_Lite (1).docx: section 2 lists module controls and test inputs; section 3 sets assessment bands.
- The team's five checkpoint items and module allocation were supplied in this chat. Treat them as the requirements for tomorrow; the source documents describe the wider project.
