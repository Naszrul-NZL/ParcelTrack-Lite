# Rider multipart request deadline

The draft A17 handler now limits body reading to five seconds. This releases its authenticated transaction before the configured fifteen-second database idle timeout. A stalled reader returns the existing safe `503 BUSY` response, releases the stream lock and clears its timer.

The regression test verifies the stalled stream, response code, released reader, cleared timer and absence of domain queries. Type checking and ESLint passed. All 390 unit/component cases passed with one worker. The initial parallel run timed out in the existing import-graph test at five seconds. SQL hardening and the API snapshot checks passed.

A17 remains a prepared handler until migration 0005, the registered 0006 migration and the shared parcel detail handoff are integrated. Real HTTP and Rider browser acceptance remain pending.
