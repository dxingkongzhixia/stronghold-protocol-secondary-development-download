# plugins/AGENTS.md — making a Keel plugin with an AI agent

For AI coding assistants asked to make or fix a plugin of 卫戍协议：盟约. **Keel（龙骨）is the current plugin system**:
manifest 3 is the only entry. Learn from the schema and checker, and loop until they are quiet.

- Keel entry / feature map: [docs/keel/README.md](../docs/keel/README.md), [docs/keel/FEATURES.md](../docs/keel/FEATURES.md)
- manifest 3 spec: [docs/keel/MANIFEST-V3.md](../docs/keel/MANIFEST-V3.md)
- architecture / N1 / V2: [docs/keel/ARCHITECTURE.md](../docs/keel/ARCHITECTURE.md)
- workflow (dev / compat / test / reference plugin): [docs/keel/WORKFLOW.md](../docs/keel/WORKFLOW.md)
- v2 compatibility reference: [docs/PLUGINS.md](../docs/PLUGINS.md), [docs/PLUGIN-API.md](../docs/PLUGIN-API.md)

## The loop

1. **Start from a Keel template** — never from a blank file:
   `node tools/keel.mjs new <keel-content|keel-lang|keel-policy|keel-multi-module|keel-survival|keel-cosmetic|keel-ui|keel-script|keel-reference|keel-bond|keel-item> <id>`
   The id is the folder name: `^[a-z0-9][a-z0-9-]{1,31}$`. `keel-reference` is the standard full example.
2. **Write manifest 3**: `plugin.keel.json`, or `plugin.json` with `"manifest": 3`.
   - modules: `content` / `asset` / `sim` / `match` / `policy` / `ui` / `lang`;
   - every module has `entry` or `files`; permissions are capabilities, not v2 names;
   - `trust: "data"` for data-only; `trust: "sandbox"` for code; `trust: "native"` is refused.
3. **Check, read the issues, fix, repeat:**
   `node tools/keel.mjs check <id> --strict --json`
   Stop when problems and warnings are 0 (or every warning is explained).
4. **Run / test:**
   `node tools/keel.mjs dev <id>` (watch changes) and `node tools/keel.mjs test <id>` (smoke run).
5. **Pack:**
   `node tools/keel.mjs pack <id> [--zip]` or `node tools/plugin.mjs pack <id> --zip`.
   This writes `plugin.lock.json`; never hand-edit it.
6. **Real room:** copy to `plugins/<id>/`, start the server with `SP_PLUGIN_SCRIPTS=sandbox` for native code, enable in
   the room, accept the per-browser native consent, and verify the battle.

## Manifest 3 rules the checker enforces

- Required: `id`, `name`, `version`, `app`, `api`, `scope`, `trust`, `modules`.
- `api` is `{ "<domain>": <version> }`, one domain per module kind used.
- Module permissions must be valid capabilities for that kind (`content.define`, `sim.damage.write`, `match.economy.write`,
  `policy.act`, `ui.frame`, `asset.override`, `native.execute`, …).
- Each module needs `entry` or `files`; paths stay inside the plugin folder (no `..`, no leading `/`, no URL).
- `trust: "data"` cannot contain `sim` / `match` / `policy` (code modules).
- Dependencies: `requires` / `optional` / `conflicts` / `loadAfter` / `loadBefore` / `priority`.
- `provides` / `consumes` are `<kind>:<id>` strings; the graph reports missing providers.
- Do not write `legacy`, `compat.manifest2`, `keelToV2` in a new native plugin. `compat.v2Script` is only for migrated
  v2 scripts / Forge kits.

## Native code (`sim` / `match` / `policy`)

- `sim`: browser Worker; hooks such as `sim.setup`, `sim.battleStart`, `sim.tick`, `sim.beforeAttack`, `sim.hit`,
  `sim.damaged`, `sim.heal`, `sim.kill`, `sim.battleEnd`; state/view/commands/RNG/budget APIs.
- `match` / `policy`: server match host meta only; never downloaded to the browser.
- Production execution needs: valid lock, `SP_PLUGIN_SCRIPTS` owner mode, and (browser) per-content-set consent.
- No lock / stale lock / no owner mode / no consent = not executed; that is the design.
- `trusted.server` / `trusted.page` are not supported; `trust: "native"` is refused.
- Do not put official game art in a plugin. Use `{ "ref": "<official key>" }` for existing entries.

## v2 compatibility

- A mainline manifest-2 plugin must be migrated first:
  `node tools/keel.mjs import <id> --write`, then confirm module boundaries and `provides`.
- `compat.v2Script: true` keeps a `setup(sp)` in the Worker SES; it still needs lock/pin/sandbox/consent.
- `keelToV2` is an internal projection, not a loader. Do not add `legacy` to a newly authored native plugin.

## Forge import

- `node tools/plugin.mjs import-forge <dir|zip> --dry-run --json` previews the conversion.
- Forge defaults to manifest 3; the importer never runs pack scripts.
- Kits become a `kits-<id>` plugin; `--no-scripts` leaves it out.
- Inspect `IMPORT-REPORT.md`; implement unsupported effects with content / DSL / native modules.
- Installing or importing never authorizes code execution.

## The studio HTTP API

- Browser studio: `/studio/` (this machine and LAN only).
- Mutations need `X-SP-Studio: <key>`; the key is `plugins/.studio-key`.
- Create a Keel plugin, write files, edit manifest 3, apply fixes, pack/download, preview.
- Every answer carries `check.issues`; the real checker is the one from `keel check`.
- The studio refuses to overwrite an external edit (`PLUGIN_STUDIO_CHANGED`); reload instead.

## Do not

- Do not invent fields or capabilities; unknown fields warn, unknown capabilities are problems.
- Do not hand-edit `plugin.lock.json`.
- Do not copy plugin folders with symlinks; a linked plugin folder is never opened.
- Do not commit `plugins/*` (git-ignored except this file, the README and `_template/`).
- Do not hand-edit `data/*.json`.
- Do not add `unsafe-eval` or page-wide lockdown to make a plugin run.
