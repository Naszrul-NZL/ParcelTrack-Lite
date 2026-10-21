# Week 5 live demo guide

## Before presenting

- Extract the demo ZIP. On Windows, double-click `start-demo.cmd`; open the printed local address. Node.js 22.14 or newer must already be installed.
- Keep that terminal window open. Use the same browser tab for all roles because the synthetic data is local to that browser and address.
- Press **Alt+Shift+R**, then confirm **Restore data**. This presenter shortcut is hidden from normal product navigation. Open the harmless `sample-proof.png` from the extracted ZIP so its location is easy to find.
- Keep the slides open in Presenter View. The screenshots in the slides/report are an offline fallback if the browser is unavailable.
- Say: "This is our Week 5 frontend prototype. It uses synthetic data in the browser. Backend integration and security enforcement are planned for the Week 14 project."

## Recommended five-minute sequence

Test usernames: `seller.a`, `seller.b`, `rider.a`, `rider.b` and `admin`. Initial password for all: `DemoOnly10!`. Enter these in the normal sign-in form; credentials are not displayed on the interface.

| Step | Presenter | Action | What to explain |
| --- | --- | --- | --- |
| 1 | Naszrul | Enter username `seller.a`. Enter a wrong password once, then sign in with `DemoOnly10!`. | M1 proposes login, role landing pages and logout. This is simulated authentication. |
| 2 | Zikri | Register parcel. Submit an empty form once, then enter Recipient A, +60000000000, 1 Jalan 1 Bandar Baru, 1.250 kg. | M2 validates the form and generates a new tracking token. This phone/address is a fictional fixture. |
| 3 | Zikri | Copy the complete tracking token from the new parcel row. Search for it and open the details. | The new parcel begins Registered and has a dated history. It persists in browser storage, not PostgreSQL. |
| 4 | Naszrul | Sign out. Enter username `admin` and password `DemoOnly10!`. | Each role has a different interface. Do not describe this browser navigation as a security boundary. |
| 5 | Syauqi | Search the copied token. Open parcel, choose Rider A, Save assignment. | M3 assignment changes Registered to Assigned. The same data drives the dashboard counts. |
| 6 | Syauqi | Sign out. Sign in as `rider.a`, search the token, open parcel and Start delivery. | Assigned changes to Out for Delivery. The history records the step and time. |
| 7 | Syauqi | Choose Delivered, select `sample-proof.png`, then Save delivery outcome. | Final outcomes require a sample image in this prototype. Server image validation and private storage are later work. |
| 8 | Zikri | Sign out. Open Track a parcel, paste the token and Track parcel. | The public interface displays only status and timestamps. Browser source/storage still contains synthetic private fields, so production privacy is not yet verified. |
| 9 | Syauqi | Optional: sign in as `admin` and show the Delivered count. | All three module interfaces follow one shared parcel lifecycle. |

## Optional short examples

- `seller.b` has a different list; `rider.b` initially has no parcels. These demonstrate intended interface visibility only.
- Admin User management supports creating, enabling and disabling Riders, including an initial-password field. Self-registration creates a Seller.
- My account changes the frontend password for the current page lifetime. New account passwords and changes exist only in page memory and reset to `DemoOnly10!` after refresh. No password is persisted to localStorage. Use test passwords only.
- Public tracking accepts upper/lowercase tokens, and shows errors for malformed or unknown tokens.
- For Failed, start another unfinished parcel and select Failed with a sample proof image. Delivered and Failed are terminal in the proposed design.

## Recovery during the presentation

- Wrong page: use the navigation or Sign out and enter the intended test username.
- No parcel found: remove the status filter and verify that the full token was copied.
- Image error: use the included sample image rather than a large personal photo. A full browser storage quota produces a visible error and does not save the change.
- Browser data out of sync: press Alt+Shift+R, confirm Restore data and repeat. Reset deletes this browser's demonstration changes only.
- Port occupied: the launcher chooses another local port. Use the address it prints. A different port has separate browser storage.
- No Node.js available: use the screenshots in the slides and report as a walkthrough, and state that the live prototype could not be started. Do not present screenshots as a live run.

## Likely questions

**Is the project complete?** The planning and interface checkpoint package are ready. The real backend, PostgreSQL/RLS, server security, integrated test suite and AWS deployment remain planned for Week 14.

**Why FastAPI and PostgreSQL?** The team selected one Python API and self-managed PostgreSQL in Docker, with database row isolation. The source brief lists other combinations, so lecturer acceptance of the variation remains to be confirmed.

**What has actually been tested?** Six prototype domain tests and a recorded browser smoke journey with 19 checkpoints. These are frontend checks. The full unit, integration, RLS and cloud test cases in the project plans have not run.

**What is the next development step?** Build the shared FastAPI/PostgreSQL foundation, then replace browser state with real authenticated APIs and prove one integrated parcel journey before expanding the remaining functions.
