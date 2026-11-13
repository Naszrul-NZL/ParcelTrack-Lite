# ParcelTrack Lite visual system proposal

Status: rejected visual concept, 13 November 2026. The product owner selected [Airway](../../DESIGN.md) after this exploration. Do not treat this palette as an approved implementation direction. This document is retained only as exploration history.

## Recommendation: Petrol & Porcelain

A light operations interface with deep petrol actions, charcoal typography and slightly mineral neutral surfaces. The intended impression is composed, precise and dependable. Parcel identifiers, delivery histories and clearly aligned records supply the visual character. Strong color marks an action or a state.

The recommendation is a design judgment specific to this app. Premium character depends on typography, spacing, hierarchy and consistent states as well as the palette.

## Core palette

| Role | Hex | Use |
| --- | --- | --- |
| Porcelain | `#F3F5F3` | Page and workspace background |
| White | `#FFFFFF` | Forms, parcel details, menus and dialogs |
| Charcoal | `#202A2B` | Headings, body text, tracking numbers |
| Mineral | `#5F6B68` | Supporting text, timestamps, placeholders |
| Petrol | `#214D50` | Primary buttons, links, focus and selected navigation |
| Mist | `#D7DEDA` | Quiet dividers and surface boundaries |

Supporting interaction colors: petrol hover `#173B3E`, petrol pressed `#102D30`, selected/hover surface `#E5EEEA`, input outline `#7E8C87`, muted/secondary surface `#EAEFEB`.

Use neutral surfaces for most of each screen. As a rough composition guide, aim for 85–90% neutral surfaces, 5–10% typography/structure and a small remainder of brand/status color. These are visual heuristics, not measured requirements. A fully tinted sidebar or navigation header should be chosen for a real navigation need, rather than added to every screen.

## Semantic status colors

| Meaning | Foreground | Soft surface | Application |
| --- | --- | --- | --- |
| Registered / waiting | `#5F6B68` | `#EAEFEB` | Registered parcel, pending assignment |
| Delivery in progress | `#345B7E` | `#EAF0F7` | Out for delivery and current timeline event |
| Completed | `#2E6546` | `#EAF3ED` | Delivered and saved confirmation |
| Attention | `#81551B` | `#FAF0DC` | Recoverable condition requiring attention |
| Error / destructive | `#A13838` | `#F9ECEA` | Field validation and failed actions |

Keep these meanings stable across screens. Labels must accompany color. Disabled controls should use explicit neutral colors, not blanket opacity that also fades their labels. Completed timeline events can use a checkmark plus a text label; the current event uses a filled marker and its state name. Color alone must not carry the distinction.

## shadcn settings

The supplied [Create preset](https://ui.shadcn.com/create?preset=b6sByO5qt), inspected in the browser, uses Base UI, Vega style, Olive base/theme/chart color, Geist heading/body, Lucide, default radius, inverted/translucent menus and subtle menu accents. It is a reference for available controls, not the proposed configuration.

The repository's `components.json` currently specifies Base Nova, neutral base, Lucide and default/subtle menus. Keep that foundation and customize its shared semantic tokens. This avoids changing component geometry while another agent is implementing features.

| Setting | Proposed value |
| --- | --- |
| Component base | Base UI; retain the existing configuration |
| Style | Nova; retain the existing configuration |
| Base color | Neutral, then override the semantic colors below |
| Theme | Custom Petrol & Porcelain |
| Heading and body font | Geist, with system sans-serif fallback |
| Icons | Lucide; consistent 16–20px functional icons |
| Radius | `0.625rem` root; approximately 8px controls and 10px panels |
| Menu color | Default / opaque light surface |
| Menu accent | Subtle petrol-tinted selection |
| Charts | Petrol for a single series; add semantic/category colors only when the data needs them |

Do not claim a shareable Create preset for this custom palette until one has actually been generated. Apply custom values through shared theme variables; changing the stock theme picker alone will not express this exact system.

## Proposed light theme tokens

These are implementation guidance, not an applied patch. Preserve the project's existing Tailwind/shadcn imports and variable mappings. HEX values are valid CSS custom-property values for the existing direct color mappings.

```css
:root {
  --background: #F3F5F3;
  --foreground: #202A2B;
  --card: #FFFFFF;
  --card-foreground: #202A2B;
  --popover: #FFFFFF;
  --popover-foreground: #202A2B;

  --primary: #214D50;
  --primary-foreground: #FFFFFF;
  --primary-hover: #173B3E;
  --primary-active: #102D30;
  --secondary: #EAEFEB;
  --secondary-foreground: #202A2B;
  --muted: #EAEFEB;
  --muted-foreground: #5F6B68;
  --accent: #E5EEEA;
  --accent-foreground: #214D50;

  --destructive: #A13838;
  --destructive-foreground: #FFFFFF;
  --border: #D7DEDA;
  --input: #7E8C87;
  --ring: #214D50;
  --radius: 0.625rem;

  --sidebar: #FFFFFF;
  --sidebar-foreground: #202A2B;
  --sidebar-primary: #214D50;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #E5EEEA;
  --sidebar-accent-foreground: #214D50;
  --sidebar-border: #D7DEDA;
  --sidebar-ring: #214D50;

  --status-neutral: #5F6B68;
  --status-neutral-soft: #EAEFEB;
  --status-progress: #345B7E;
  --status-progress-soft: #EAF0F7;
  --status-success: #2E6546;
  --status-success-soft: #EAF3ED;
  --status-warning: #81551B;
  --status-warning-soft: #FAF0DC;
  --status-error: #A13838;
  --status-error-soft: #F9ECEA;
}
```

`--accent` is a soft interaction surface, not a second saturated brand color. Stock components may not consume the extra hover/status tokens automatically: explicitly connect those states where needed. Use a solid visible focus outline/ring with offset; a low-opacity ring does not inherit the contrast of the solid token. Quiet panel borders are intentionally low contrast; required input boundaries use the stronger input token.

The application also has legacy variables and hardcoded values in `src/app/style.css`. An eventual implementation must reconcile those with these semantic tokens, including headers, focus styles, progress markers and status classes. Merely replacing `globals.css` variables will leave a mixture of themes. This proposal intentionally does not edit those files during concurrent implementation.

## Typography and component rules

- One sans-serif family for headings and body. Use 400 for reading, 500 for labels, and 600 for primary headings/actions. Keep tracking numbers in a monospace fallback only where exact character recognition helps.
- Body 16px/1.5; secondary text 14px/1.5; small timestamps 12–13px/1.5. Public page headings can use 36–48px; workspace headings 28–32px. Use tabular numerals for aligned numeric columns.
- Left-align form labels, parcel data and timeline content. Keep long text around 60–75 characters per line.
- Use a 4px spacing unit. Use 8px between related controls, 16px within groups, 24px panel padding and 32–48px between major sections.
- Public forms use 44–48px controls; inputs use 16px text. Table rows use at least 48px where they contain touch actions. Compact desktop controls still need usable touch targets on phones.
- Use one prominent action per local task. Secondary actions are neutral outline or quiet text. A primary button stays filled on hover and pressed; its label remains white.
- Use the 10px panel radius for actual bounded forms and parcel details; use approximately 8px for controls and 4px for compact status labels. Small labels are not pill shaped by default.
- Use fine dividers for records, white panels for actual surfaces, and no routine card shadow. Reserve subtle elevation for overlapping menus/dialogs.
- Keep motion to 120–180ms color/state feedback and short opening/closing transitions. Respect reduced motion. Loading indicators may move only while a real operation is pending.
- Errors sit beside their field and explain the next step. Loading preserves layout. Empty states explain how to start or how to change the filter. An unreadable disabled label is not an acceptable state.
- Establish this light theme first. No dark-mode palette is approved or verified by this document.

## Contrast verification

Computed from the hex values using sRGB relative luminance, without opacity or blending:

| Pair | Ratio |
| --- | --- |
| Charcoal text on porcelain | 13.43:1 |
| Mineral text on white | 5.54:1 |
| Mineral text on porcelain | 5.06:1 |
| White text on petrol | 9.37:1 |
| White text on petrol hover | 12.13:1 |
| Input outline on white | 3.51:1 |
| Input outline on porcelain | 3.20:1 |
| Delivery text on delivery surface | 6.22:1 |
| Completed text on completed surface | 6.05:1 |
| Attention text on attention surface | 5.71:1 |
| Error text on error surface | 5.80:1 |

These checks cover the specified color pairs, not full application accessibility. Actual component states, opacity, focus behavior and phone layouts still need verification when integrated.

## Alternatives explored

- **Graphite & Ember:** charcoal `#25282B`, cool canvas `#F4F5F6`, muted `#626970`, ember action `#A84323`, hover `#87341B`, divider `#DADDE0`. The strongest continuity with the original courier orange. White on ember is 6.01:1. Keep orange out of general text and use the independent status colors above.
- **Ink & Oxblood:** ink `#29262A`, pearl canvas `#F5F3F4`, muted `#6C6269`, oxblood action `#713543`, hover `#582733`, divider `#DFD9DE`. More unusual and brand-led, but less immediately associated with an operations tool. White on oxblood is 9.16:1.

Petrol & Porcelain is the recommended balance for ParcelTrack Lite. The two alternatives are comparison directions, not additional simultaneous accents.

## Proposal preview verification

The separate interactive color preview was checked in the browser on 13 November 2026. It is a design concept using the repository's sample parcel data, not a connected tracking service or an exact rendering of the stock Nova components.

- Petrol, Ember and Oxblood controls each changed the primary/surface/text tokens, displayed hex values and selected label.
- Tracking PTL-DEMO-002 showed the Delivered label, green completion treatment and the matching sample history.
- Enter on PTL-DEMO-003 showed the Registered state and its single sample history event.
- An invalid sample number displayed recovery text beside the input; a subsequent valid lookup cleared it.
- The recommended design was visually reviewed at a 736px viewport; the 390px phone view stacked the form and details. At a 320px viewport, a DOM geometry check found no preview descendants overflowing horizontally.
- The browser reported no captured console errors during the final check. The preview's host-supplied optional corner-radius control was inspected in code; it was not available in the standalone browser wrapper and was not exercised there.

The running app was not modified or regression-tested for this design-only proposal.
