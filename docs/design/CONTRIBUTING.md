# Contributing to the Airway design system

The shared visual guide is [DESIGN.md](../../DESIGN.md). Airway is implemented on the current Home, tracking and Sign in screens. Start from the [frontend foundation](../shared/frontend-foundation.md) for shared exports and module boundaries; extend it as the responsible contributor implements each real workflow.

## Start here

1. Read the root design guide and your module's current plan and implementation status.
2. Open [airway-reference.html](airway-reference.html) directly in a browser. Switch themes, select the three sample parcels and open the sample manifest. This is a visual reference using synthetic records, not production data.
3. Inspect existing shared components before adding a new one. Follow the [stock shadcn policy](../ui-components.md).
4. Reuse the [shared tokens](airway.tokens.json), fonts and component treatments. Implement through shared primitives rather than independent per-page palettes.
5. Include visual evidence and relevant behavior checks with the module's change. Mention any deliberate exception and its reason.

The standalone reference uses remote web fonts with local fallbacks; an offline browser may display different letterforms. Its optional Codex Tweak controls are guarded and are not required to use it in a normal browser. The application serves licensed local fonts through `next/font/local` and uses no browser font-provider requests.

## What this handoff authorizes

| Category | How to use it |
| --- | --- |
| Approved visual rules | Apply while building or changing the relevant frontend: Airway palette, typography, docket motif, theme pairs, responsive priorities and accessible states |
| Recommended implementation patterns | Introduce or reuse them when a module needs the corresponding screen or action; keep business scope and ownership intact |
| Dependent feature ideas | Wait for the required contract, data and permission decisions; record the dependency instead of showing a working-looking placeholder |

The shared foundation implements the theme, shell, status mapping, docket and field feedback. Copy/share, delivery proof UI, additional endpoints and parcel actions remain module work subject to their contracts.

## Module handoffs and feature boundaries

| Item | Category | Owner / coordination | When and conditions |
| --- | --- | --- | --- |
| Shared theme, fonts, buttons, inputs, field errors and focus | Approved visual rules | Naszrul coordinates under the existing M1 shell responsibility; M2/M3 review and consume | Apply to shared primitives and then affected screens, preserving handlers and semantics; each owner builds their own module screens |
| Delivery docket | Recommended implementation pattern | Shared component; M2 parcel details/registration, M3 delivery outcomes | Build once and reuse when those surfaces are implemented; neutral lists/forms remain flat |
| Login, account and role screens | Approved visual rules | M1 | Use DM Sans forms, Airway surfaces and action colors; large status headlines are not required on every form |
| Copy tracking number | Recommended feature | M2 | Add when the real parcel number is available; show Copied only after successful clipboard access and provide a useful fallback on failure |
| Share tracking link | Dependent feature idea | M2 with shared/security review | The current contract uses POST to keep tracking tokens out of URLs/logs. Decide an approved sharing contract first; do not copy the demo's URL pattern into production |
| State-specific next action | Recommended implementation pattern | M2 public/seller states; M3 rider/admin outcomes; M1 authorization support | Show actions backed by the user's role and implemented service; an explanation alone is sufficient when there is no permitted action |
| Expand event details | Recommended enhancement | M2 or M3 for their screens | Use only fields already available in that screen's authorized DTO; the public history is narrower than private history |
| View delivery proof | Dependent feature / module requirement | M3 with M1/M2 authorization integration | Wait for authorized private proof retrieval; own Seller parcel, assigned Rider parcel or Admin access as defined by the contract. Public access stays denied |
| FAILED outcome presentation | Required state when implementing real delivery flows | M3, reflected in M2 tracking | Show actual failure status/history and only permitted recovery actions; do not imply completion of the four-stage delivered path |
| Mobile status priority and accessible state feedback | Approved visual rules | Each contributor for their screens | Verify status/update/identifier order, long real identifiers, keyboard use, both themes and the affected state paths |
| Arrival estimates, maps or notifications | Future product decisions | Owning module plus shared contract review | Add only after a real data source, behavior and permissions are defined; none are implied by the Airway experiment |

The authoritative permission and response definitions remain in [system-contract.md](../shared/system-contract.md). This table assigns design handoffs, not a new phase schedule or API surface.

## Project-level skills

The repository includes these skills under [`.agents/skills/`](../../.agents/skills):

| Skill | When it helps |
| --- | --- |
| `parceltrack-airway` | Apply the approved design and route to the relevant local guidance |
| `antislop` | Purpose, identity and evidence checks during UI work |
| `antislop-ui` | Visual hierarchy, typography, color and component treatment |
| `antislop-human` | Contrast, focus, keyboard and understandable state behavior |
| `antislop-layoutmobile` | Reflow, overflow, touch targets and phone layouts |
| `ui-ux-pro-max` | Searchable component, interaction, typography and accessibility guidance |

These are repository files, not links to a contributor's home directory. Pull the shared baseline to receive the same snapshots. No private-machine setup or global preference file is part of the installation. [Official OpenAI documentation](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) describes repository discovery under `.agents/skills`.

For Codex, open a new chat in this project after pulling the change; if skills do not appear, restart the app. With another coding assistant, point it to [AGENTS.md](../../AGENTS.md) and the skill paths; discovery conventions may differ.

The repository default is **antislop during**, meaning apply the design checks while working. This does not change any contributor's personal preference files. The installation is complete, so there is no per-contributor installer wizard.

From the repository root, use the bundled helpers as needed:

```text
python .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "forms validation focus" --stack shadcn
python .agents/skills/antislop-human/contrast-check.py "#FFFFFF" "#39358C"
```

Python 3 is needed only for these helpers. On systems without `python`, try `python3` or `py -3`. Searches are supporting evidence; a generic result does not approve a new palette or overwrite Airway.

See [skill provenance](skill-provenance.md) before replacing a vendored snapshot. Skill updates are intentional source changes, not an automatic network install during a frontend task.

## Review checklist for a module change

- The screen matches the shared colors and type roles, with an explained purpose for any exception.
- A single clear task leads the screen. Parcel identity, state and required actions are easy to locate.
- The docket is reused where it represents a parcel document; unrelated panels do not copy its treatment.
- Data is real or explicitly synthetic. Public/private fields and role-dependent actions match the contract.
- Pending, empty, error, success and disabled states work for the affected flow. No action only pretends to work.
- At 320px and a representative desktop width, content reflows without overlap or page overflow. Long production-format identifiers were checked.
- Light and dark text/control pairs are readable. Keyboard focus is visible; disclosure/menu/dialog behavior works without a mouse.
- Reduced motion and text enlargement preserve access to content and controls.
- Relevant application checks from the component policy pass. The report names the interactions actually exercised and material limitations.

Cross-module changes to colors, font roles, status meanings or shared components should update the guide/token file in the same change. A small screen-specific composition choice can be documented with the module change; it does not need a new global design system.
