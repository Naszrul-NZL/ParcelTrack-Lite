# UI component policy

ParcelTrack Lite uses stock shadcn/ui as its default component source. Use an existing stock component or compose stock components before considering a community registry. The current public screens implement the approved [Airway design guide](../DESIGN.md). Reuse the [shared frontend exports](shared/frontend-foundation.md) and [contributor handoffs](design/CONTRIBUTING.md) for new module screens.

## Choosing a component

1. Check the components already in `src/components/ui`.
2. Check the official shadcn catalog for a suitable component or documented composition.
3. Add only the stock components needed by the implemented screen.
4. Consider a community registry only when it supplies a required capability absent from stock shadcn. Record the missing capability, selected component, dependencies and compatibility checks here before adopting it.

Different styling alone is not a reason to add another registry. Customize the local stock component and shared theme instead. A simple ordered status history can remain semantic page markup; it does not require a timeline package. Stock inputs can also support ordinary file selection without a separate upload registry.

## Foundation

- Next.js App Router and React with TypeScript.
- Tailwind CSS 4 with semantic shadcn theme variables, generated from the approved Airway JSON tokens and verified by `npm run design:check`.
- Base UI as the explicit shadcn component base.
- Local component source in `src/components/ui`, shared class merging in `src/lib/utils.ts`, and configuration in `components.json`.
- Exact direct dependency versions and the committed npm lockfile.
- Stock source generated with shadcn CLI 4.23.0, invoked on demand with `npx shadcn@4.23.0 add <component>`. The CLI is not an application dependency.
- Existing forms and sample tracking remain previews until their application endpoints are implemented.

The current screens need stock Button, Input, Label, Badge, Card, Alert and Radio Group components. Forms remain connected to their existing handlers. Form-state libraries, charts, tables and additional components are added when an implemented feature needs them.

Airway customizes the existing stock control source and composes a product-specific `ParcelDocket`, `ParcelStatusBadge`, `FieldFeedback`, navigation and theme toggle. The theme preference is rendered on the server and survives navigation/reload. Licensed local DM Sans/Barlow Condensed files remove build-time and browser font-provider dependencies. The docket remains light paper in both themes and uses its own text/focus pairs.

Only dependencies required by these components are retained: Base UI, shadcn's `cn` helper and `class-variance-authority`, plus the Tailwind build tools. Current components use Tailwind's built-in data-attribute variants. Add icon packages, animation CSS or other shadcn stylesheet utilities when a selected component needs them.

## Community extensions

None adopted. Maps are a possible future gap because stock shadcn has no map component, but there is no current map or live-location requirement. Adding a map would require a separate feature decision and an appropriate source of location data.

## Validation

Check types, lint and the production build after changing components. Exercise the affected interactions in a browser, including keyboard operation, focus, errors, pending states and phone layouts. Component styling must retain the existing contrast and touch-target requirements.

The initial adoption passed 301 unit/component tests and 12 production-browser checks, plus type checking, lint, production build and documentation checks. Verification and visual decisions are recorded in the [UI review](ui-preview-review.md).

References: [official component catalog](https://ui.shadcn.com/docs/components), [Next.js setup](https://ui.shadcn.com/docs/installation/next), and [community registry directory](https://ui.shadcn.com/docs/directory).
