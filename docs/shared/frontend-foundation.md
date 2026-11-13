# Shared frontend foundation

Airway is implemented on Home, public tracking and Sign in. These screens retain explicit sample/preview behavior until their module APIs exist. The visual foundation is ready for all three module owners to consume; this does not sign off G1 or deliver H20 real sessions.

## Shared entry points

| Need | Use | Boundary |
| --- | --- | --- |
| Theme and typography | `src/app/layout.tsx`, `src/app/fonts.ts`, `src/components/theme-provider.tsx` | Root layout loads local fonts and a server-rendered preference cookie. The theme toggle persists only `ptl_theme`; it is unrelated to authentication |
| Approved colors | `docs/design/airway.tokens.json` → `src/app/airway-tokens.css` | Run `npm run design:write` after a reviewed token change; `npm run design:check` checks both themes, contrast and generated CSS drift |
| Tailwind/shadcn tokens | `src/app/globals.css`, `src/components/ui/*` | Use `bg-card`, `text-foreground`, `text-muted-foreground`, `border-input`, `bg-primary` and existing stock controls. Do not add module palettes |
| Navigation and page frame | `src/components/app-navigation.tsx`, root layout, `.page-width` | Existing public routes remain Home, Track a parcel and Sign in. Add protected role navigation with real auth, through the M1 shell coordinator |
| Parcel status | `src/shared/parcel-presentation.ts`, `src/components/parcel-status.tsx` | Exhaustive mapping of canonical `ParcelStatus` values. Labels never replace domain enums or permission checks |
| Parcel document | `src/components/parcel-docket.tsx` | Presentational component with typed number, status and status/time history. It fetches nothing and renders no recipient, actor or proof fields |
| Field feedback | `src/components/field-feedback.tsx` | Supply an ID; associate it through the input's `aria-describedby` and set `aria-invalid` when needed. Errors announce through `role=alert` |
| Browser API/session foundation | `src/shared/api-client.ts`, `src/features/auth/session-provider.tsx` | Same-origin, no unsafe automatic retries. SessionProvider depends on M1's planned CSRF/me endpoints; do not mount it globally against missing routes |
| Server authorization/transactions | `src/server/modules/auth/principal.ts`, `src/server/core/db.ts` | Server-only. M1 still owns real session/CSRF issuance and protected service integration; client UI never supplies authoritative roles |

Use the [component policy](../ui-components.md), [design guide](../../DESIGN.md) and [design contribution guide](../design/CONTRIBUTING.md) for composition and review.

## Parcel docket usage

```tsx
import { ParcelDocket } from '@/components/parcel-docket';

<ParcelDocket
  trackingNumber={parcel.trackingNumber}
  status={parcel.currentStatus}
  history={parcel.history}
/>
```

The caller supplies already-authorized data from its module service. History entries use `{status, changedAt}`; extra private DTO fields are not rendered by the docket. Recorded events carry their actual times, displayed in Malaysia time. Unrecorded stages say Pending. FAILED replaces the Delivered stage, so an unsuccessful outcome is never drawn as delivered. Use `sample` only for clearly synthetic preview data. The default document remains level; only the Home sample composition adds a slight static tilt.

The docket is for parcel details, registration confirmation and delivery outcomes. Use ordinary flat forms/lists for account management and dense workspaces. It does not include copy/share, proof retrieval, assignment or update actions; the responsible module connects those through its contracts.

## Parallel work boundaries

Naszrul coordinates root layout, fonts, theme, shared controls and navigation. Zikri owns parcel registration, public tracking and the private detail composition. Syauqi owns Rider/admin delivery controls and proof presentation. Owners build their screens inside their feature folders and compose these shared pieces; a module PR should not independently rewrite root CSS or shared tokens.

Keep module-specific layout in that feature's CSS module or local utility classes. Reserve `globals.css`, generated tokens and the root stylesheet for shared behavior. This keeps independent screen changes from colliding in the same global file.

Use the [contributor starting point](execution-sequence.md#contributor-starting-point) and [handoff status](../implementation-status.md#foundation-handoff-status) for service/migration dependencies. M2's H34 detail-slot contract and M3's H35 implementations remain their planned handoffs; this visual component does not redefine them. Database revisions still merge in order 0005 → 0006 → 0007.

## Verification before sharing

Run `npm run check`, `npm run build`, `npm run test:e2e` and `python tools/check_plan_docs.py`. Browser checks can start the built app automatically, reuse an existing local server, and need no database for the current previews. Role journeys will require the isolated stack when implemented. The CI app job runs these preview browser checks, while the separate server-integration job checks the database/Storage foundation.

The browser suite covers all five sample statuses, failed-state semantics, form feedback, keyboard interactions, navigation, light/dark preference persistence, locally served fonts, long identifiers, 320–1440px reflow, enlarged text and reduced motion. Inspect the affected screenshots in `.local/test-results`; automatic overflow checks do not replace visual review. Do not edit snapshot data or weaken checks merely to make a module pass.
