# Airway: ParcelTrack Lite design guide

**Approved visual direction, 13 November 2026.** The product owner selected the Airway experiment as the foundation for future module screens. This guide establishes the shared appearance and interaction principles. It does not mean every production screen has already been migrated.

| Reference | Purpose |
| --- | --- |
| [Working visual reference](docs/design/airway-reference.html) | Open directly in a browser; use the sample records, theme switch and manifest |
| [Shared design values](docs/design/airway.tokens.json) | Color, typography, spacing, radius and motion values for implementation |
| [Contributor workflow and module handoffs](docs/design/CONTRIBUTING.md) | What to apply now, what to implement with a module, and what needs a separate decision |
| [Component policy](docs/ui-components.md) | Existing stock shadcn/Base UI foundation |
| [System contract](docs/shared/system-contract.md) | Roles, states, data exposure and backend behavior |

## Identity

Airway takes its visual language from freight markings and delivery dockets. The interface feels precise, confident and approachable. The defining elements are oversized condensed status typography, a lavender delivery docket, disciplined working surfaces and a small yellow marker for the current journey stage.

The screen's first question determines the hierarchy: recipients need the parcel's current state; staff need the records and actions relevant to their role. The same visual identity supports both contexts at different densities.

**Design read:** parcel tracking for recipients and parcel workspaces for operators, in an expressive freight-label language. **ENERGY 3 / RHYTHM 3 / MOTION 1.** Energy comes from typography and composition. Motion is limited to short feedback on a person's action.

## Color system

The [token file](docs/design/airway.tokens.json) is the source for exact values. These are the main roles:

| Role | Light | Dark | Purpose |
| --- | --- | --- | --- |
| Workspace | `#F7F7FB` | `#191824` | Page plane |
| Work surface | `#FFFFFF` | `#24212F` | Forms, menus, expanded records |
| Primary text | `#232336` | `#F3F1FC` | Headings, body and identifiers |
| Supporting text | `#656579` | `#B4B0C5` | Context, timestamps, hints |
| Brand/action | `#39358C` | `#BCB4F4` | Primary actions, links, selection and focus |
| On brand | `#FFFFFF` | `#211D43` | Content on filled brand actions |
| Soft selection | `#EDEBF7` | `#343044` | Selected rows and subtle interaction surfaces |
| Quiet divider | `#D9D8E4` | `#484253` | Separate records and structural groups |
| Input boundary | `#858098` | `#938CA9` | Identify required editable control boundaries |
| Docket paper | `#E8E5F6` | `#E8E5F6` | Signature delivery document |
| Docket text | `#272441` | `#272441` | Content on the document |
| Docket supporting text | `#625B78` | `#625B78` | Recorded times and pending-stage labels |
| Current stage | `#F3D47D` | `#F3D47D` | Highlight the current step, with docket-ink text |
| Error | `#AA303A` | `#FFACB5` | Action failure and field validation |

The docket deliberately stays a light paper object in both themes. It always uses its own foreground pair, including times and pending labels. The surrounding interface changes theme independently.

Brand indigo leads actions and navigation. Yellow means **current journey stage**, including the final stage of a delivered parcel. It does not mean warning, overdue or live telemetry. A state name and stage marker accompany the color. Confirmations can use the success pair in the token file when that meaning is useful.

Shadcn `accent` is the soft interaction surface, not yellow. The current-stage yellow is an explicit product token. Quiet dividers are not sufficient input boundaries; use the stronger input value for fields.

Use opaque surfaces. The approved direction has no decorative gradient, glow, glass, background grid or stock illustration. New treatments need a specific content or hierarchy reason and review alongside the established reference.

## Typography

| Role | Typeface / weight | Size guidance |
| --- | --- | --- |
| Recipient's current status | Barlow Condensed / 600 | 96–116px desktop, 72–88px tablet, 64–88px phone, allowing natural wrapping |
| Main workspace heading | Barlow Condensed / 600 | 40–64px in production workspaces; the experimental manifest uses a larger display treatment |
| Docket stage numeral | Barlow Condensed / 500 | 56–72px |
| Text wordmark | DM Sans / 700 | 22–25px with a small Lite suffix |
| Body and forms | DM Sans / 400 | 16px, around 1.5–1.6 line height |
| Buttons and field labels | DM Sans / 500–600 | 13–14px; 16px editable text on phones |
| Record rows and compact context | DM Sans / 400–500 | 13–14px; timestamps normally 12px |
| Exact tracking identifiers | System monospace / 500 | 14–23px according to hierarchy |

Barlow Condensed echoes freight markings; DM Sans supports comfortable reading and form entry. Monospace is reserved for exact identifiers or aligned technical values. It is not a display-heading style.

Use sentence case and left alignment. Tight display tracking can range from about -1px to -2.8px depending on size; body text uses normal tracking. Larger or localized text may reflow. Do not lock a long status into a width that causes clipping.

The reference includes some 11px secondary docket timestamps and footer text. Treat that as the lower edge of an experiment; use 12px by default in production, with essential information at 14–16px. Staff screens keep record density through layout, not tiny text.

Load the two fonts through the application's font pipeline when implementing the theme; use system sans-serif and a condensed fallback while loading. Font license metadata is included with the vendored UI/UX catalog. The reference's remote fonts are a preview convenience, not a new production dependency.

## Composition and the delivery docket

**Public tracking:** place current status and its short explanation first, followed by the last recorded update and tracking lookup. A delivery docket groups the identifier and recorded handoffs. On wide screens the status and docket can sit beside each other; on phones they form a single reading flow.

**The docket is the signature component.** Use it where a specific parcel or a completed handoff deserves a document-like treatment: parcel details, registration confirmation and a delivery receipt. Reuse one shared component when implementing those surfaces. Avoid turning every form, dashboard section or table row into a perforated ticket.

The perforation separates identification/current state from history. Its edge cutouts are decorative and hidden from assistive technology. A slight 0–2 degree tilt is appropriate in a public tracking showcase; transactional forms, lists and dense staff views stay level. The single paper shadow marks that document layer. Routine rows and panels stay flat.

**Staff workspaces:** make the record or required action the primary content. Use the same palette, type families, radii and feedback. A list with inline details is suitable for scanning parcels; a compact title is suitable when space is needed for work. Do not introduce a generic stat row, chart or activity feed without a real question and real data.

The reference's sample manifest is a design demonstration. Production parcel lists, assignment screens and dashboards follow their role-specific module requirements; the demonstration does not add a new public manifest endpoint.

## Journey and status semantics

The normal route shown in the reference is Registered, Assigned, Out for delivery, Delivered. Use the actual canonical backend values and label mapping; do not change the domain enums to suit the graphic.

- Recorded history events carry real timestamps. Order and tie-breaking come from the service contract.
- Earlier recorded stages use a completion mark. The current stage uses its number, the yellow marker and the state label. Unreached stages, when useful, explicitly read Pending.
- A pending stage is not a recorded event, ETA, percentage or delivery promise. Stage position is not elapsed progress.
- **FAILED is an alternate outcome in the real contract.** It needs a clear failure label and real recorded history. Do not force it into the four-stage delivered path or show Delivered as the current stage. Only show recovery/retry actions authorized by the module's rules.
- A stage explanation may explain the known state in plain language. It must not invent location, rider activity, an arrival time or a delivery attempt.
- Public tracking remains limited to its contracted status/timestamp data. Private proof, recipients, contacts and role-restricted history fields remain protected even if a visual reference shows a richer sample.

## Components, spacing and interaction

Use the existing stock shadcn components and Base UI behavior first. Theme shared primitives and compose them for Airway. The HTML reference is a visual/interaction target, not replacement form, dialog or authorization code.

| Treatment | Value / application |
| --- | --- |
| Spacing scale | 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 72px |
| Related items | 8–12px |
| Group separation | 20–24px |
| Major desktop separation | 40–56px; wider space only when it establishes hierarchy |
| Desktop page gutter | 32–40px |
| Phone gutter | 16–20px |
| Button/input radius | 6–8px |
| Docket radius | 16px |
| Compact status-label radius | Around 4px, where a label needs a fill |
| Form controls | 44–48px minimum height; primary tracking can use a larger compound field |
| Row actions | Comfortable 44px effective targets; rows grow to fit wrapped content |
| Color feedback | About 140ms; no layout shift on hover |
| Elevation | A single restrained docket shadow; menus/dialogs may elevate when overlapping content |

One local task has one clear primary action. Secondary actions use quiet text or neutral outlines. Full-width buttons are appropriate in a phone form; compact buttons are appropriate beside a record. Arrows and icons communicate an actual action or direction rather than decorating every label.

Choose icons by function and weight. The preview's text labels and stage marks are sufficient without a new icon package. If a stock component needs an icon library, choose and document a consistent set; decorative icons are hidden and icon-only actions have accessible names.

Required states for implemented controls are default, hover, focus, pressed, pending, disabled, error and success as applicable. A pending label names the operation. Disabled text stays readable. Errors identify the field/action and recovery step. Empty states distinguish first use, no filter matches and denied access where the contract permits that distinction.

Preserve typed input on failure. A successful copy action confirms Copied; a successful save confirms Saved. Keep the action vocabulary consistent with the resulting feedback.

## Responsive behavior and accessibility

The reference changes composition around 760px and 600px; the tracking field stacks around 360px. These are content breakpoints, not rules to squeeze all new screens into the exact same grid.

- At 320px, there is no horizontal page overflow. Long identifiers wrap on display surfaces. Editable fields may scroll their own text normally, but the primary tracking control should show a useful amount of the number.
- On phones, status, latest recorded update and the identifier/action appear before supporting detail. The docket stacks below them. Staff record details and actions reflow into a single column as needed.
- On the narrowest form layout, put the tracking button under the field. The theme switch, navigation and record controls remain reachable and do not overlap.
- Text contrast is at least 4.5:1 for normal text and 3:1 for large text. Meaningful control boundaries and focus indicators need 3:1 against adjacent surfaces. Measure actual opacity/compositing and both themes.
- Keep a visible 3px focus indicator with about 4px offset, or an equally clear stock-component treatment. Use natural keyboard order, visible labels, associated field errors and appropriate pending/result announcements.
- Shared dialogs, popovers and disclosures retain the primitives' keyboard behavior. A skip link goes to the current screen's content. Do not make pointer hover the only way to access detail.
- Respect reduced motion and text enlargement. Docket tilt is a static visual treatment, not perpetual animation.

## What is approved, and what happens later

**Apply during frontend work:** the colors, typography, docket identity, component treatment, status language, light/dark behavior, responsive hierarchy and accessibility requirements in this guide.

**Implement with the responsible module:** reusable docket composition, role-specific next actions, optional richer event details, copy-number feedback and other enhancements listed in the [handoff table](docs/design/CONTRIBUTING.md#module-handoffs-and-feature-boundaries). They are guidance for relevant work, not a request to implement all of them now.

**Needs a separate decision or backend readiness:** shareable tracking URLs, proof presentation, actual arrival estimates, location maps, notifications and data fields beyond existing DTOs. In particular, the current contract uses POST for public lookup to keep tracking tokens out of URLs/logs, and proof access is private. The design guide does not change either rule.

## Validation and review

Review an affected screen at desktop and phone widths, in both themes, with keyboard-only interaction and its relevant loading, empty, error and success states. Inspect a long real-format tracking identifier, not only the shorter demo identifiers. Use meaningful existing checks for changed behavior; documentation-only changes do not require an application regression run.

For a component change, follow the checks in the component policy. Record what was actually exercised and any untested limitation. Update shared values and this guide together when a cross-module design decision changes.

The original experiment was checked at 1024px, 390px and 320px. Its recorded text pairs passed contrast checks; this is reference evidence, not certification of future application screens. The approved prototype contains local synthetic data and no connected parcel service.
