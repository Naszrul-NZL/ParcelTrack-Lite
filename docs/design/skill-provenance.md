# Design skill snapshots

Installed at repository scope on 13 November 2026 at the product owner's request. The source was the existing local skill installation used during the design work, copied as ordinary files into `.agents/skills/`. No network installer, symlink, home-directory link or contributor preference file is required.

| Skill | Snapshot detail | Original entrypoint SHA-256 |
| --- | --- | --- |
| `antislop` | Core VERSION file: 3.2.20 | `64a1ff70bafbfb7a105083cdff0026a6f09baf7e19d3aa1bc3e880cf7233f90c` |
| `antislop-ui` | Locally installed supplement; no separate version file supplied | `47d9892771253f544f7eb2e40af35fd5c31407dcd8c048183bbd1de5a00a4bbe` |
| `antislop-human` | Locally installed supplement with both contrast helpers | `5bc7c8e56cc79a5154eabf32469fd9f95621ac0b0faa73acd5816d56aafd5868` |
| `antislop-layoutmobile` | Locally installed responsive supplement | `8613395a5109f637837f5c24f0ce5e58a96df1c2567a9f7666fcaecc47ff39cd` |
| `ui-ux-pro-max` | Local snapshot with scripts, tests, references and searchable data; no release version supplied | `ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9` |
| `parceltrack-airway` | Project-authored routing skill for the approved design | Maintained with this repository |

The hashes identify the original local SKILL.md files, not a claimed upstream release or Git commit. Existing notices and source metadata shipped with the local packages are retained, including the UI/UX data provenance and font license catalog. Python bytecode and `__pycache__` were excluded; they are generated files, not skill resources.

## Repository adaptations

- The `ui-ux-pro-max` entrypoint uses `.agents/skills/ui-ux-pro-max/scripts/search.py` from the repository root instead of a Claude-specific plugin-directory placeholder. Its Python helpers and data are copied without source edits. Four upstream-maintainer test modules were excluded during handoff cleanup: `test_catalog_refresh.py`, `test_catalog_summary_line_endings.py`, `test_relevance_evaluator.py` and `test_skill_script_paths.py`. They require upstream refresh/evaluation/generation tools and packaging trees absent from the installed skill. The standalone helper/data tests remain bundled; this repository does not claim to run the upstream release-tooling suite.
- Root `AGENTS.md` chooses antislop during for this project and records that installation is complete. It routes to existing local supplements instead of requiring an installation wizard for every contributor. The vendored antislop entrypoints themselves are unchanged.
- `parceltrack-airway` routes to the approved guide, tokens and runnable reference, using repository-relative links. It keeps feature recommendations tied to module ownership and existing backend contracts.
- No personal global setting, API key, account configuration or developer-specific absolute path is committed as part of this setup.

## Updating

Treat a skill update as a reviewed repository change. Inspect the intended replacement, preserve its notices and required resources, and update this provenance record. Retain the project routing and portable command paths. Run the local search and contrast helpers and verify skill frontmatter and document links before sharing the update.

The repository's approved design takes precedence over generic search recommendations. A skill update does not implicitly approve new brand colors, font families, public data fields or product features.

## Installation verification

Checked on 13 November 2026:

- All six skill entrypoints passed the skill creator's frontmatter/name validation.
- The repository-local UI/UX helper returned relevant results for a keyboard-focus query and a shadcn form/focus query, using its copied data.
- Handoff cleanup reran the standalone helper/data suite: 137 tests pass, and catalog validation passes. The four excluded upstream-maintainer modules are listed under Repository adaptations.
- The repository-local contrast helper passed its eight reference-pair self-tests. White on the light indigo action measured 10.18:1.
- The token file parsed as JSON and had matching theme keys. Fourteen specified text pairs and two control pairs passed in each theme; the lowest checked text ratio was 4.83:1 in light and 5.16:1 in dark.
- Relative links in the root agent/design guides, contributor guide, current-design pointer, provenance document, component policy and Airway skill resolved locally.
- The standalone repository browser reference was visually reviewed at 1024px and 320px. Theme switching, the delivered sample, manifest navigation, status filtering, the no-match state and Clear filters worked; both narrow screens had equal content/scroll widths. The captured console error log was empty.
- Python caches are generated and ignored by the existing rule. The skill source, data, references, guide and visual reference are ordinary shareable repository files.

These checks verify the design handoff and its local helpers. Production application code was not changed or regression-tested for this documentation/skill installation.
