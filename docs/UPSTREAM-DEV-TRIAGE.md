# Upstream `dev` Triage (2026-10-20)

Source: `sganggs/Stronghold-Protocol`, `upstream/master..upstream/dev`, 26 commits.
Baseline: upstream `master` `c9d804f47`, upstream `dev` `23dfa3d79`.
Decision rule: do not merge the branch; port only what this fork needs, with its own tests and docs.

## Summary

| Decision | Count / scope |
|---|---|
| Ported | `removeBuff` re-entrancy fix; Wild Mane S2 rear radial push (#782); settlement title/button/item-slot fixes (#745) |
| Not applicable to this fork | asset-download readiness count (`#725`) |
| Candidates, later | picture-only outfits, bond-timer readout |
| Deferred, not plugin core | external AI / bot strategies |
| Docs / merge commits | no code by themselves |

## Commit groups

| Commit(s) | Feature | Decision | Why |
|---|---|---|---|
| `126f0bc03` `42c05035e` | `removeBuff` nested removal re-entrancy | **Ported** | Plugins/kits can remove a buff from an `onRemove`; the old loop lost its index. Code + upstream synthetic tests are in this fork. |
| `ca185d064` `72bef87c0` | asset download ready count (`#725`) | **Not applicable** | This fork has no `public/js/ui/assetDownload.js`; its asset-cache UI is different. |
| `77b91081c` `3f6c07863` | picture-only outfits (avatar/portrait, default battle model) | **Candidate** | Plugin/skin-adjacent, but a large client-wide feature. Owner decision 2026-10-20 keeps it out; an appearance plugin must ship a Spine model. |
| `60d182c3d` `a3190a4e7` | skill-clip mappings for six operators | **Ported** (`c38adb532`) | VFX quality improvement; only the mapping and one test assertion were adapted to this fork. |
| `84fbd1cb9` `30089aac5` | bond-timer readout on the selected unit card | **Deferred** | UI/gameplay convenience; not a plugin compatibility blocker. |
| `ea2548c4b` `9e57431ae` `38a1eb840` | strategy pick opens enemy information (`#484`) | **Ported** (`1c55157a7`) | `ui/matchEnemies.js` is shared by the briefing, the draft dialog and match info; `test/ui/match-info.test.js` passes. |
| `a1b6b86d1` | result-screen translated titles, CSS button fallback, item-slot bounds (#745) | **Ported (settlement only)** | Took `settle.js` / `settle.css` and the unit tests; the unrelated Python 3.8 CI and docs history were not merged. |
| `6da62da73` | late-entry test accepts the re-entry block form | **Not needed** | Test-only adaptation for the `#746` merge; no matching code here. |
| `4908a73b2` `ba3f86bd8` `835f2dbfd` `868cd6e07` `81fb9611d` | bot-strategy hooks, external AI, advisor mode | **Deferred / separate** | This is an AI/ops feature, not plugin compatibility. It needs a product decision, config, transports and tests. |
| `a26ffab3f` `23dfa3d79` | Wild Mane S2 radial behind push (`#782`) | **Ported** (`1b58cdd7b`, golden `e6aafeeff`) | Gameplay accuracy; behind targets move radially away at the reduced force row, with the dedicated sim regression tests. Canonical record: `UPSTREAM-MERGES` 13.10. |
| `20807cb5d` `35ded423b` `b1cea7417` `bf7af482e` | strategy-info merge/docs | **Deferred** | Merge/documentation commits; no plugin work. |

## Ported change

`server/sim/battle/status.js`:

- snapshot the matching buffs in reverse order
- locate each survivor again in the current list before removal
- buffs added by callbacks wait for the next call
- nested removals keep their own counts and callback order

Tests:

- `test/sim/remove-buff.test.js`
- `test/content/sargon-remove-buff.test.js`

These are the upstream synthetic regression tests; no official game files are included.

## Next candidates

1. **Picture-only outfits** — if skins/plugin cosmetics are the next product priority.
2. **Skill clips** — with the VFX batch, not by itself.
3. **Bond timer readout** — when the client UI batch is scheduled.

Do not merge `upstream/dev` wholesale: it would bring the external-AI product, bot-strategy API and unrelated UI/gameplay changes into this fork at once.
