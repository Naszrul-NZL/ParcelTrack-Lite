# M3 foundation acceptance evidence

Recorded 17 November 2026 for [issue #11](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/11), M3-PH1-T01/T02/T05/T09, H10 and H13. Baseline `571c4a5f8a000f6ba3aacde59e3c7320457040eb`.

The HAR-01 cases now check that an audit row committed in one database is absent in the next clone, and that two cases can hold restricted connections at the same time. The benchmark runs two concurrent 12 MP inputs, checks the synthetic rejection manifest and reports native versions, time and memory.

The documentation checker reported zero errors or warnings. The Airway token checker passed all 32 contrast pairs. Git ignored the local fixture manifest, temporary staging files, image benchmark report and browser trace paths.

On `e380e1e`, the [push integration run](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/44042557106/job/133900381584) passed against PostgreSQL and Storage. The [PR integration run](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/44042631232/job/133900628585) reproduced a teardown race where a connection was still closing during `DROP DATABASE ... WITH (FORCE)`. The harness now uses ordinary `DROP DATABASE` after closing its managed clients, and the overlap test lets both cases settle when one fails. The [foundation smoke run](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/44042631232/job/133900628780) passed the Playwright foundation spec against the full test stack.

The standalone Windows x64 probe passed all 17 fixtures with Node 24.22.1, Sharp 0.35.5 and libvips 8.18.7. Two concurrent 12 MP images took 98 ms. Baseline RSS was 106,643,456 bytes, sampled peak RSS was 182,738,944 bytes, and the process peak reached 190,210,048 bytes. This run used the synthetic inputs and no running Supabase stack because Docker was inaccessible from the verification shell.

Run the harness again on the corrected commit and measure Sharp with Supabase running on the local host. The standalone measurement does not validate the provisional limits under full-stack load. See the [isolated test setup](../local-development.md#tests) and [image measurement procedure](../modules/module-3-delivery/storage-design.md#phase-1-image-resource-evidence).

H10 and H13 still require consumer proving runs and owner review. H20 is required for real-login HTTP journeys. G1 remains pending.
