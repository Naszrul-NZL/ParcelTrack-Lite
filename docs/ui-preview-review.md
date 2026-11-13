# Public UI preview review

The current public screens implement [Airway](../DESIGN.md). The earlier navy/orange records below are historical evidence.

## 13 November 2026: Airway implementation

Direction: parcel tracking and role workspaces in the approved freight-label language, ENERGY 3 / RHYTHM 3 / MOTION 1. Condensed display type establishes the parcel/status focal point; DM Sans supports forms and working text. The lavender docket groups parcel identity and real recorded stages. Yellow identifies only the current stage. Other forms and workspace rows stay flat.

The existing stock shadcn/Base UI controls were themed and retained. Shared exports now cover navigation, theme preference, five canonical status labels, field feedback and the parcel docket. Licensed fonts are served locally through Next's font pipeline. The [frontend handoff](shared/frontend-foundation.md) documents imports and work boundaries so module owners can compose these pieces independently.

- Behavior PASS: 16 production-browser checks across desktop/phone exercise all five sample statuses, empty/invalid/loading/missing/found tracking, recovery, sign-in validation, password visibility/clearing, workspace radio keys, sample links, main navigation and skip-to-content. Preview forms send no credentials or business writes. User-entered tracking remains out of the URL; only known synthetic sample IDs are linkable.
- Theme PASS: light/dark preference survives navigation and reload. Actual font faces load from the app origin, with no external resource requests in the theme/font journey. The docket keeps its own paper/text colors. The dark no-match recovery button uses docket text/boundary tokens rather than inheriting the surrounding dark theme's light text.
- Layout PASS: Home, tracking and Sign in fit 320, 390, 768, 1024 and 1440px in both themes. A full-format 36-character tracking identifier wraps within the docket. The enlarged-text check doubles computed text sizes at a desktop viewport; reduced-motion styles are exercised separately from narrow-screen reflow. Representative desktop and phone screenshots covering all three screens and both themes were visually inspected.
- Contrast/focus PASS: `npm run design:check` verifies 32 text/control/focus token pairs across both themes, theme-key parity and generated CSS drift. Radio focus uses an opaque outline. The tracking result has an inner docket-ink focus edge in addition to its surrounding-theme outline. Disabled button/input text keeps the measured muted pair instead of fading through opacity.
- Application checks PASS: 303 unit/component tests, TypeScript, ESLint, SQL hardening, API snapshot, production build, documentation consistency and local credential-exposure scan. Two component tests prove Failed never presents Delivered and future stages never gain invented timestamps. Browser error logs are empty. No dependency or database migration change accompanies the UI work.

### Delivery gate

- Hard gate PASS: labeled sample records, working destinations/actions, all relevant tracking/form states, keyboard focus and both themes verified by the journeys above; no unsupported metrics, fabricated testimonials, decorative assets or delivery promises.
- Purpose gate PASS: condensed type echoes freight labels; the docket is reserved for parcel documents; perforation separates identity from handoffs; the current-stage marker has a state label; the restrained paper shadow identifies that document layer. Two overview links use a small directional arrow to open the parcel view. No gradients, glow, generic illustration, new icon package or perpetual animation was added.
- Liveliness PASS: ENERGY 3 / RHYTHM 3 / MOTION 1 is expressed through a large status/headline, distinctive paper docket, flat workspace rows and a quieter account form. The motif and typography match the approved reference, with responsive reading order rather than a repeated card grid.
- Craftsmanship PASS: shared tokens, fonts, stock controls and status mapping keep screens consistent; labels and feedback describe real actions; forms preserve useful input on failure and clear passwords on preview completion; public/private boundaries remain those of the system contract.

Remaining scope: these are still sample tracking and local form previews. Real sessions, registration, assignment, proof access, dashboards and private detail slots remain owned module work. This review does not mark G1 complete or certify later role journeys.

## Historical: stock shadcn adoption before Airway

Home, Tracking and Sign in now use stock shadcn Button, Input, Label, Badge, Card, Alert and Radio Group source, generated with CLI 4.23.0 and the Base UI base. Theme and control sizing follow the existing navy, white and orange direction: ENERGY 2 / RHYTHM 2 / MOTION 1. Buttons remain at least 44px tall and inputs use 16px text. Delivery history remains a semantic ordered list. No community registry has been adopted; the [component policy](ui-components.md) records the stock-first rule.

Legacy page styles are in a CSS component layer so stock Tailwind utilities can work without being overridden by unlayered element rules. Semantic theme tokens preserve the existing palette. Button, input and badge styling is shared through the local stock components. Navigation uses actual links with stock button styles where appropriate. Only the copied components' runtime dependencies and Tailwind build tools are installed; the CLI runs on demand.

- Behavior PASS: all 12 production-browser checks pass on desktop and phone, including sample selection, pending/missing/validation states, password visibility and clearing, result/feedback focus, all navigation paths and no credential/API submission from previews.
- Keyboard and mobile PASS: workspace Radio Group responds to Left/Right arrows and moves selection/focus; skip link and form focus checks pass; all three pages fit 320, 375, 768, 1024 and 1440px viewports.
- Contrast PASS: white on primary orange 6.09:1, white on hover orange 8.26:1, muted input text on white 6.35:1, and pale focus outline on navy 8.53:1. Focus indication and readable status labels remain present.
- Build and dependency checks PASS: 301 unit/component tests, type checking, lint, SQL hardening, API snapshot, production build, plan-document checks and local credential-exposure checks. Runtime npm audit reports zero advisories at verification time.
- Visual review PASS: full-page Home, sample Tracking and Sign in screenshots inspected at desktop and phone widths; no console warnings/errors or failed resource requests were recorded. No generated assets, new navigation destinations or unsupported product claims were added.
- Delivery gate PASS: the hard, purpose, liveliness and craftsmanship checks below still apply. Existing design direction, parcel-label identity, varied task layouts and low motion are retained; component choices and dependencies have the recorded functional purpose above.

## Original preview baseline

13 November 2026. Home, Track a parcel, and Sign in are UI previews. Tracking uses three explicitly labeled sample parcels. Sign in validates locally, shows feedback, and clears the entered password. These components make no authentication, database, Storage, or parcel API calls and save no credentials.

## Direction and decisions

Source: the earlier navy/orange preview direction. The [current design](design/current-design.md) now points to Airway. This existing preview was checked at ENERGY 2 / RHYTHM 2 / MOTION 1.

- Navy anchors navigation and headings; orange identifies the main action and current delivery step.
- White surfaces hold actual forms and sample records; paper grey separates the workspace from those surfaces.
- Segoe UI follows the established direction and keeps form text familiar. Courier New is limited to tracking identifiers so the parcel label remains recognizable.
- The Home layout pairs the tracking task with a sample shipping label. Seller and Rider descriptions use divided columns rather than repeated feature cards.
- Tracking places the search beside the timeline on desktop and before it on phones. DOM order follows the phone reading order: form, result, samples.
- Sign in places the form before the optional role preview in both reading and visual order. The role selector changes explanatory content only.
- Six-pixel controls, ten-pixel surfaces, and four-pixel status labels distinguish actions, records, and states. No decorative shadows, gradients, images, or invented brand marks were added.
- The only animation is the sample-loading indicator, which stops under reduced-motion preferences. The short preview delay demonstrates the pending state without implying a live lookup.

## Verification

- PASS: 301 existing unit/component tests, TypeScript, ESLint, SQL hardening, and API snapshot checks.
- PASS: production build and 12 browser checks across desktop and phone projects.
- PASS: browser layout sweeps at 320, 375, 768, 1024, and 1440 pixels found no horizontal page overflow.
- PASS: screenshots inspected for Home, sample tracking results, and Sign in on desktop and phone.
- PASS: production console inspection found no warnings, errors, or failed resource requests.
- PASS: normal-text contrast checks: orange on pale orange 5.47:1; secondary text on grey 5.39:1; input placeholder on white 4.65:1; secondary text on navy 9.26:1; delivered status 6.60:1.

## Interaction evidence

- PASS: Home, Track a parcel, Sign in, and the brand link navigate to their existing destinations; the active navigation item changes.
- PASS: empty Home tracking submission keeps focus on the required field; a sample number opens its corresponding result.
- PASS: Try a sample parcel and View history open the sample timeline.
- PASS: Seller and Rider links open Sign in with the corresponding workspace selected.
- PASS: the lower Track a parcel link and Track without signing in open public tracking.
- PASS: empty tracking shows an inline error and focuses the input; unknown tracking shows the sample-not-found state.
- PASS: pending tracking disables submission; Show an example recovers to the sample timeline.
- PASS: each sample selector displays its matching Registered, Out for delivery, or Delivered status and history; result focus moves after lookup.
- PASS: empty Sign in identifies missing username/password and focuses the first invalid field.
- PASS: Show and Hide change password visibility. Form submission shows the preview boundary, clears the password, and moves focus to feedback.
- PASS: Seller, Rider, and Admin selectors change the workspace explanation.
- PASS: Skip to content focuses main content; native buttons, links, and radio controls support keyboard operation and have visible focus indicators.
- PASS: tracking and sign-in browser checks observed no POST requests; sign-in also made no API requests.

## Antislop delivery gate

- Hard gate PASS (R-02, R-03): no authored em dashes; all three pages fit the tested widths.
- Hard gate PASS (R-17, R-18, R-36, R-38): all parcel data is labeled sample data; no statistics, testimonials, customer identities, or unsupported operational claims.
- Hard gate PASS (R-23, R-24): text identity and existing navigation retained; all destinations exist; no generated visual assets.
- Hard gate PASS (R-25): text contrast checks exceed 4.5:1.
- Hard gate PASS (R-26, R-35): controls were exercised in the browser; actions and outcomes are listed above.
- Hard gate PASS (R-27): empty, validation, pending, sample-not-found, and result states were exercised.
- Hard gate PASS (R-28): no speculative FAQ.
- Hard gate PASS (R-32): native keyboard controls, skip link, visible focus, and focused form feedback verified.
- Hard gate PASS (R-33): changes were authored directly in source files.
- Hard gate PASS (R-34): one verified light theme; no theme toggle.
- Hard gate PASS (R-37): existing project direction and its three dials applied.
- Purpose gate PASS (R-01, R-04, R-07, R-08, R-10, R-12, R-13, R-22): no decorative gradients, icon set, background pattern, button arrows, glass, shadows, glow, or illustrations.
- Purpose gate PASS (R-06, R-09, R-14, R-19): typography, sample/status markers, content grouping, and loading feedback have the written purposes above.
- Liveliness PASS: the parcel label and chronological delivery history provide product-specific identity; page composition varies by task and matches ENERGY 2 / RHYTHM 2 / MOTION 1.
- Craftsmanship PASS (C-1 to C-5, R-05, R-11, R-15, R-16, R-20, R-21, R-29, R-30, R-31): one palette and type system, consistent control shapes, plain action labels, responsive task layouts, useful form feedback, documented decisions, and an explicit preview boundary.
