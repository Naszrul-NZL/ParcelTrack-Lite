# ParcelTrack Lite Week 5 checkpoint

Presentation date: 22 October 2026. Final submission: Week 14 (calendar date to be confirmed).

This package covers the five requested checkpoint items: module allocation and stack, initial ERD and repository, one interface demonstration per module, security requirements, and progress with challenges and next steps.

## Present

1. Open `ParcelTrack-Lite-Week-5.pptx` in PowerPoint and use Presenter View for the embedded speaking notes.
2. Keep `speaking-notes.md` and `demo-guide.md` available for rehearsal.
3. Open `ParcelTrack-Lite-Week-5-Report.pdf` for the written checkpoint report.
4. Extract `ParcelTrack-Lite-Demo.zip` before running the demo. Install Node.js 22.14 or newer if needed, double-click `start-demo.cmd`, and open the local address printed in the window. The compiled frontend is included; no dependency installation or internet connection is needed to run it once Node is installed. Keep the server window open.
5. Use `sample-proof.png` from the demo ZIP for the harmless proof-image example. Press **Alt+Shift+R** and confirm **Restore data** before presenting.

Initial test usernames are `seller.a`, `seller.b`, `rider.a`, `rider.b` and `admin`, all with password `DemoOnly10!`. Product screens use ordinary labels and do not display presenter instructions or credentials. Never use a real password or real recipient details in this prototype.

## Scope statement

The demo is a working browser interface prototype using React and synthetic browser data. It does not implement Next.js Route Handlers, PostgreSQL/RLS, real sessions, private server storage or cloud hosting. Its client-side filters and validation demonstrate intended behaviour and cannot prove security. The full implementation plans remain in `docs/modules/`; their real backend gates have not passed.

The report uses the team's supplied names Naszrul, Zikri and Syauqi. The lecturer's separate allocation sheet still needs each member's full name and matric number. Stack acceptance and branch protection remain pending unless the team supplies newer evidence.

## Revised implementation baseline

Updated on 22 October 2026: one full-stack Next.js/TypeScript application with full local Supabase Docker; cloud hosting is deferred. The interface demo and screenshots remain the historical browser-only React prototype. Revised presentation/report text describes planned work, not a completed application migration. See [the migration record](../../docs/nextjs-migration.md) and [local setup plan](../../docs/local-development.md). Lecturer source documents remain unchanged.
