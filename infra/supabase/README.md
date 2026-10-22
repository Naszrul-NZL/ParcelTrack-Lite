# Full local Supabase Docker

The vendor folder is a preserved copy of the official Supabase docker directory at the revision recorded in UPSTREAM.json, including its Apache license. No upstream setup/reset/update shell script is executed by the ParcelTrack startup commands.

Run `node scripts/prepare-env-template.mjs` once after checkout, then `npm run local:init`. Generated passwords, signing keys and dashboard credentials remain in ignored .local/<profile>/ files. The web .env.local contains only its app/tracking and Storage credentials; private CLI credentials live separately in the ignored operator file.

`npm run local:up` starts every service in the pinned upstream base configuration. `npm run local:down` stops services without deleting named volumes. Do not run vendor/reset.sh or delete volumes as a normal startup step. See the root README and docs/local-development.md for the complete sequence.

Use PTL_PROFILE=test for a distinct Compose project, private credentials, host ports and volumes. On machines with limited Docker memory, stop one profile before starting the other. Tests never reset the development database or proof bucket.
