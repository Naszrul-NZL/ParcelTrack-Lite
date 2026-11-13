# Working in ParcelTrack Lite

## Subagent coordination

- Give implementation subagents a clear, bounded task and enough time to finish.
- Do not repeatedly ping or poll a working subagent just because it has not finished. Check in only when it requests help, appears blocked, or a meaningful deadline or dependency requires an update.
- Review the completed work and run relevant checks before reporting it as done.

## Frontend design

The product owner approved **Airway** on 13 November 2026. Before creating, changing or reviewing UI, read [DESIGN.md](DESIGN.md) and the [design contribution guide](docs/design/CONTRIBUTING.md). The approved reference is [airway-reference.html](docs/design/airway-reference.html); shared values are in [airway.tokens.json](docs/design/airway.tokens.json).

- Apply the repository skill [.agents/skills/parceltrack-airway/SKILL.md](.agents/skills/parceltrack-airway/SKILL.md). It routes to the local design skills and the approved direction.
- Use the checked-in skills under `.agents/skills/`, including their scripts/data, rather than requiring contributors to install personal copies.
- Apply the shared guide while implementing the assigned module. Follow-up feature ideas are not instructions to add unrelated functionality now; their ownership and prerequisites are in the contribution guide.
- Existing application styling is being migrated. Preserve other contributors' work and change only the requested frontend scope. The older navy/orange preview is historical, not the current design target.
- Backend contracts, role boundaries and public/private data rules remain authoritative. A visual mockup does not add endpoints, public proof access, tracking-link formats or delivery promises.
- Generic palette/font suggestions from a skill search do not replace Airway. Use searches to resolve a specific UI problem and explain any intentional departure from the guide.

<!-- antislop:start -->
## Project design skills

Use **antislop during** for frontend work in this repository. This repository-level choice applies while planning and implementing UI; a user's explicit choice for the current task takes precedence. Do not change a contributor's global settings.

The project installation is complete; skip the first-run installer wizard. Read [.agents/skills/antislop/SKILL.md](.agents/skills/antislop/SKILL.md) and only the task-relevant supplements:

- Visual design: [.agents/skills/antislop-ui/SKILL.md](.agents/skills/antislop-ui/SKILL.md).
- Accessibility, focus and state behavior: [.agents/skills/antislop-human/SKILL.md](.agents/skills/antislop-human/SKILL.md).
- Responsive layout: [.agents/skills/antislop-layoutmobile/SKILL.md](.agents/skills/antislop-layoutmobile/SKILL.md).
- Component/interaction research: [.agents/skills/ui-ux-pro-max/SKILL.md](.agents/skills/ui-ux-pro-max/SKILL.md).

Load these for UI work, not unrelated database or infrastructure tasks. The current task's user instructions take precedence over generic skill defaults. Run the relevant design delivery checks and record concrete evidence before declaring a UI change complete.
<!-- antislop:end -->
