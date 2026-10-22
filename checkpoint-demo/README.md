# Week 5 interface demo

React and TypeScript frontend prototype for the 22 October 2026 checkpoint. It demonstrates proposed interactions for M1, M2 and M3 on one shared browser data set. It is separate from the future production frontend described in the module plans.

## Run

Install Node.js with npm, then open this folder in a terminal:

```powershell
npm ci
npm run dev
```

Open the local address printed by Vite. For a production preview: `npm run build`, then `npm run preview`. Run `npm test` for the prototype's domain checks. The compiled demo is also included in the checkpoint ZIP and can be served by `start-demo.cmd` without installing dependencies when Node.js is present.

## Show

Initial test usernames are `seller.a`, `seller.b`, `rider.a`, `rider.b` and `admin`. All start with the fake password `DemoOnly10!`. Enter these in the regular username/password form. Credentials and presenter labels do not appear on product screens. Seller A registers a parcel; Admin assigns it to Rider A; that Rider starts delivery and records Delivered or Failed with a harmless JPG/PNG; public tracking shows its status/time history. Press **Alt+Shift+R** and confirm **Restore data** before rehearsal.

## Actual boundary

State persists in localStorage on this browser and origin only. Refresh signs the user out but retains sample parcels. Login, account state and role checks run only in the browser and can be bypassed using developer tools. Newly entered account passwords and password changes are held only in page memory; after refresh all accounts revert to the initial test password. Passwords are not persisted to localStorage. Proof images are stored as data URLs in localStorage, not in private server storage; browser storage quota may limit image size. No network API, password hashing, real sessions, server-side validation, SQL/RLS, rate limiting, retention automation or AWS deployment exists here. Public UI field selection is demonstrated, but the browser contains the complete synthetic data set. Use fictional details and harmless pictures only.

The five seeded records show the five statuses. The seeded final records are visual fixtures without proof files; only newly finalized demo parcels require a picture. Seeded tracking tokens are intentionally predictable presentation examples, not an example of the production token generator. Newly created prototype tokens use browser cryptographic randomness. The production design remains authoritative for server behaviour.

## Implementation baseline update

On 22 October 2026 the team changed the future implementation to one full-stack Next.js/TypeScript application with the full self-hosted Supabase Docker stack, developed locally first. This folder remains the historical React/Vite browser-only demo; its scripts and frontend-only test results do not verify the future stack. See the [local setup plan](../docs/local-development.md) and [system contract](../docs/shared/system-contract.md).
