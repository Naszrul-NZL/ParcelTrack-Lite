# M3 foundation acceptance evidence

Recorded 17 November 2026 for [issue #11](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/11), M3-PH1-T01/T02/T05/T09, H10 and H13. Baseline `571c4a5f8a000f6ba3aacde59e3c7320457040eb`.

The HAR-01 cases now check that an audit row committed in one database is absent in the next clone, and that two cases can hold restricted connections at the same time. The benchmark runs two concurrent 12 MP inputs, checks the synthetic rejection manifest and reports native versions, time and memory.

The documentation checker reported zero errors or warnings. The Airway token checker passed all 32 contrast pairs. Git ignored the local fixture manifest, temporary staging files, image benchmark report and browser trace paths.

The verification shell has Node.js 24.22.1. npm and the project dependencies are unavailable in that shell, and Docker denied access to both engine pipes. The PostgreSQL/Storage harness, Playwright smoke and Sharp benchmark still need a full run. Use the [isolated test setup](../local-development.md#tests) and [image measurement procedure](../modules/module-3-delivery/storage-design.md#phase-1-image-resource-evidence) to record the environment and results.

H10 and H13 still require consumer proving runs and owner review. H20 is required for real-login HTTP journeys. G1 remains pending.
