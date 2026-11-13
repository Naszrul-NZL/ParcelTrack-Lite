# Current interface design: Airway

The product owner approved **Airway** on 13 November 2026. The canonical guide is [DESIGN.md](../../DESIGN.md), with [shared tokens](airway.tokens.json), a [browser reference](airway-reference.html) and [contributor handoffs](CONTRIBUTING.md). Use the [component policy](../ui-components.md) when implementing it.

Airway uses indigo actions, cool paper surfaces, Barlow Condensed display type, DM Sans controls and a lavender delivery docket. Yellow identifies the current journey stage. The guide specifies the exact light/dark pairs, accessible states and responsive treatment.

Apply the design as each contributor implements the relevant module. The existing application can still show the earlier navy/orange preview until those screens are migrated. The design handoff does not implement all proposed actions or add new backend scope.

## Historical preview

The earlier interface preview used navy `#152e48`, white, paper grey `#f3f5f7` and orange `#a94110`, with Segoe UI. That remains evidence of the previous design, not the target for new screens. The rejected Petrol & Porcelain exploration in [color-system-proposal.md](color-system-proposal.md) is also not an implementation target.

Use stock shadcn/Base UI primitives and semantic tokens. Backend authorization and public status/timestamp boundaries remain unchanged. Keep sample-data disclosure until real workflows are connected.
