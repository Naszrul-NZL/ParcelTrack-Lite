# ParcelTrack Lite Week 5 speaking notes

Suggested rehearsal: about 7 minutes of slides plus a 5-minute live demo. Adjust to the lecturer’s allotted time.

## Slide 1 ParcelTrack Lite

Naszrul | About 25 seconds.
We are presenting ParcelTrack Lite for the RapidExpress case study. Today is our Week 5 checkpoint, and final submission is in Week 14. We will show module ownership, the selected stack, our initial database design, an interface for each module, security requirements, and our next steps. The demonstration uses synthetic browser data. It does not yet implement the backend or cloud system.
Source: team checkpoint deliverables and timeline supplied in the project discussion; ParcelTrack_Lite_Case_Study.docx sections 4 and 10.

## Slide 2 Module allocation

Naszrul | About 35 seconds.
Naszrul owns login and user management, Zikri owns parcel registration and public tracking, and Syauqi owns delivery updates and the Admin dashboard. Each member also owns their module's tests and explanation. We share the data model and integration contracts so that our three contributions form one application. The separate lecturer allocation sheet needs our full names and matric numbers.
Source: team allocation confirmed 21 October; case study section 4.

## Slide 3 Development stack and hosting

Naszrul | About 40 seconds.
We selected React for the interfaces, FastAPI for one shared Python backend, and PostgreSQL in Docker. SQLAlchemy and Alembic will support database access and migrations. AWS is our chosen hosting provider, with one EC2 instance running Docker Compose as the current proposal. The database will remain private, behind the application. These backend and cloud components are planned. The source brief names other framework and database combinations, so acceptance of FastAPI and PostgreSQL still needs confirmation.
Source: docs/shared/decision-register.md D-01 to D-03 and EXT-02/04; source briefing slide 11 and case study section 6.

## Slide 4 Initial entity relationship diagram

Zikri | About 50 seconds.
Our initial ERD has five business entities: User, Parcel, ParcelStatusHistory, DeliveryProof and AuditEvent. Seller and Rider are roles in the same User table. A parcel has one Seller and may have one assigned Rider. Each parcel has one or more history records and zero or one proof record. AuditEvent records account and parcel actions, including failed login attempts where the actor may be unknown. Public visitors do not need accounts. Session and rate-limit tables are additional infrastructure, omitted from this conceptual diagram. This is a design, not a deployed schema.
Source: docs/initial-erd.md and docs/shared/system-contract.md.

## Slide 5 M1 Login and User Management

Naszrul | About 30 seconds before the live demo.
This is the M1 interface. It uses a regular username and password form, generic failure messages and different landing pages for Sellers, Riders and Admins. Other screens show Seller registration, Rider management and password change. Test credentials are in the presenter guide, not on the product screens. Authentication is still simulated in the browser. Newly entered passwords exist only in page memory and reset on refresh. The final project will connect to FastAPI sessions, Argon2id hashing, CSRF protection and server authorization.
Source: checkpoint-demo frontend; case study section 4.1. Screenshot captured from the current interface.

## Slide 6 M2 Parcel Registration and Tracking

Zikri | About 30 seconds.
M2 provides a parcel registration form, a Seller parcel list, search, detail and public tracking. The prototype checks form values and generates a tracking token for each new parcel. Browser storage keeps the sample parcel when the page is refreshed, while the demo sign-in clears. This demonstrates the proposed interaction. The production implementation will replace browser state with PostgreSQL through authenticated APIs and enforce Seller ownership on the server and through RLS.
Source: checkpoint-demo; case study section 4.2; docs/modules/module-2-parcels. Screenshot captured from this prototype.

## Slide 7 M3 Delivery Update and Dashboard

Syauqi | About 35 seconds.
M3 shows Admin assignment and a dashboard with the five parcel statuses. The Rider interface starts delivery and records Delivered or Failed with a sample image. Assignment, status history and counts use the same browser data, so the interfaces demonstrate one coherent workflow. The final server must validate transitions, verify the assigned active Rider and store proof images privately. Admin assignment must not grant permission to perform Rider status updates.
Source: checkpoint-demo; case study sections 4.3 and 5. Screenshot captured from this prototype.

## Slide 8 Public tracking interface

Zikri | About 30 seconds.
A visitor can enter the tracking token without signing in. The displayed result includes status and timestamps, without recipient details, actor identity or proof links. In this frontend prototype the complete synthetic data set still exists in browser storage. Therefore the screenshot demonstrates the intended public view, not a proven privacy boundary. The final implementation will use a restricted server lookup and a field allowlist, with rate limiting and privacy tests.
Source: checkpoint-demo; case study section 4.2; docs/shared/system-contract.md A13. Screenshot captured from this prototype.

## Slide 9 Security requirements

Syauqi | About 50 seconds.
Our five policies guide implementation. P1 requires individual accounts, least privilege and same-day disablement of departing Riders. P2 requires passwords of at least ten characters and prompt compromise reporting. P3 limits recipient data to delivery and requires deletion or anonymization twelve months after delivery under the case-study policy. P4 requires safe secrets, synthetic test data and generic user errors. P5 requires login and status audit events without passwords or full addresses, and incident reporting within one hour. Controls include server role checks, RLS, hashing, CSRF, parameterized queries, restricted public responses and private image validation. These server controls are planned and have not been proven by the prototype.
Source: case study sections 5, 8 and 9; docs/security-tests.md.

## Slide 10 Completed work and current challenges

Naszrul | About 45 seconds.
We have confirmed ownership, selected our stack, published the initial ERD and prepared coherent module plans with test cases and handoffs. We now have runnable React interfaces for the checkpoint and a repeatable sample parcel journey. The prototype builds and its six domain tests and nineteen browser smoke checkpoints pass. These are not results for the final backend suite. Current challenges are keeping shared models consistent, obtaining stack acceptance and AWS access, and replacing browser simulations with verified server behaviour. Branch protection has been prepared but its application remains unverified.
Source: repository planning commit 9dd50f9; local checkpoint prototype build and recorded frontend QA. Full planned test suite is not executed.

## Slide 11 Proposed route to Week 14

Syauqi | About 40 seconds.
This is our proposed schedule, not completed work. Week 6 establishes FastAPI, PostgreSQL roles, migrations and the test harness. Week 7 connects real authenticated module slices. Weeks 8 and 9 complete the functions and attempt an early AWS deployment. Weeks 10 through 12 focus on security regression, storage, recovery and the integrated cloud deployment. Week 13 prepares evidence and rehearsal, and Week 14 is final submission. We will confirm the Week 14 calendar date and update this schedule with actual progress. AI agents can assist implementation, while each member reviews, tests and understands their module.
Source: team timeline (Week 5 now, Week 14 final); docs/shared/phase-framework.md. Week mapping is a proposed checkpoint schedule.

## Slide 12 Live demonstration

All presenters | Approximately five minutes.
Open the local browser. First explain verbally that it is a Week 5 frontend prototype with synthetic data. Before rehearsal, press Alt+Shift+R and confirm Restore data. Naszrul signs in with username seller.a and test password DemoOnly10!, optionally showing one failed attempt first. Zikri submits an empty parcel form, creates a fictional parcel and copies its token. Syauqi signs in as admin, assigns the parcel to Rider A, then signs in as rider.a, starts delivery and records Delivered using the included sample-proof.png. Finally sign out and let Zikri open Track a parcel and paste the token. Refer to demo-guide.md for credentials, recovery and optional examples. The screenshot slides provide a fallback if the live browser is unavailable.
Repository: https://github.com/Naszrul-NZL/ParcelTrack-Lite. Source: checkpoint prototype and demo-guide.md.
