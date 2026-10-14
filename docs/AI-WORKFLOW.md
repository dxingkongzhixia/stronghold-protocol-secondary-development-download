# AI workflow — how we change, merge, commit and deploy this fork

Audience: the AI agent(s) working on this fork with the owner (`d星空之下`). This is the operational contract:
how a request is handled, how the upstream is merged, how commits and the GitHub/Gitee push work, how production is
deployed, and **when to stop and ask the owner**. It complements [`docs/MATCHMAKING.md`](MATCHMAKING.md) (the
decision record, including the merge blacklist §22) and [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) (the repository map).
Read `docs/DEVELOPMENT.md` first if you do not know the layout. The **fork-only mechanisms** (what is ours, where it
lives, how to extend it, the tests that pin it, and the merge "must not be lost" note) are catalogued in
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) — consult it during every upstream merge (see (b)).

> **Note for a newcomer:** start with [`docs/HANDOVER.md`](HANDOVER.md) — the entry point (repo map, run locally,
> build/verify, content, upstream merges, publish/deploy, known issues). This file is the operational contract it
> points at.

> **Navigation.** (a) Handling a feature / bug request · (b) Fork / merge discipline with upstream · (c) Commit & push discipline (GitHub primary + Gitee mirror) · (d) Production deploy procedure · (e) When to ask the owner.
> See also [`docs/HANDOVER.md`](HANDOVER.md) (the entry point) and [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) (lookup).

Companion conventions, quoted verbatim:

- **之后每次有更新都提交下** — after every change, commit it and push to the remotes (GitHub primary + Gitee mirror).
- **重启 / 上传前先推通知，署名 `d星空之下`** — before any restart or upload, push an in-game notice signed
  `d星空之下`.

---

## (a) Handling a feature / bug request

The loop, in order. Do not skip research; do not skip verification.

1. **Research against the official data first.**
   - Prefer primary sources: the cached official client tables (`.cache/gamedata/`, the `character_table` /
     `activity_table` JSON), `docs/research/*.json` + `docs/research/*.md`, and PRTS for wording.
   - Check the rules docs (`docs/design/`, `docs/history/`, `docs/MATCHMAKING.md`) and the code
     (`docs/SIM.md`, `docs/META.md`, `docs/DATA.md`). Find the nearest official precedent before inventing anything.
   - For a custom operator/bond/item, follow [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) and record a section in
     `docs/MATCHMAKING.md`. State explicitly what is *not* modelled and why.
2. **Make the smallest correct change.**
   - Data changes go through `tools/build-data.mjs` (or `CUSTOM_CHESS`), never by hand-editing `data/*.json`
     (exceptions: `data/tuning.json`, `data/assets.json`, see `docs/DEVELOPMENT.md` §3).
   - Reuse the engine helpers / sub-profession profiles before adding a new flag. If a new mechanic is unavoidable,
     add it in `server/sim/` or `server/sim/content/` with a module header explaining the official basis.
   - No random source other than `sim/rng.js`; content never touches engine internals; illegal client input returns
     `{error, code}` and never throws.
3. **Headless verification before tests.** Reproduce/inspect with a headless tool:
   - `node tools/simrun.mjs --mode … --round … --lineup "…" --ascii 5` — one battle, ASCII board.
   - `node tools/matchrun.mjs --mode coop --players 4 --seeds 10 --check --errors` — whole matches + invariants.
   - `node tools/botbench.mjs`, `node tools/balance.mjs` — AI and difficulty deltas.
4. **Tests.**
   - Add/extend a focused suite under `test/content|sim|match|ui|render/`. A bug fix gets a regression test that
     fails before and passes after.
   - Run `node --test` (in `_merge-scratch`; the git-less working project can only fail `docs-paths` / `package` —
     `docs/DEVELOPMENT.md` §8). Update the count assertions the change moves.
   - If the golden corpus moves, apply the attribution rule below.
5. **Docs + record.** Update the affected doc(s) and add a `docs/MATCHMAKING.md` section for anything non-obvious,
   with the decision, the evidence and an honest "保留意见" where a piece is approximated.
6. **Commit & push** (see (c)), and deploy if the owner asked (see (d)).

Checklist by task type:

| Task | Must touch / verify |
|---|---|
| New operator | `CUSTOM_CHESS` + kit + `07-assets.json` + art/voice fetch + count assertions + `docs/MATCHMAKING.md` (§NEW-OPERATOR recipe) |
| Kit tweak / balance | the kit file + a `test/content/*` case; `node tools/kit-coverage.mjs`; golden attribution if numbers move |
| Match / lobby / protocol | `shared/protocol.js` + server handler + client send/receive + protocol test + `docs/META.md` |
| Enemies / Boss | `tools/build-data.mjs` + `content/{enemies,bosses}.js` (exactly one of KITS/BOSS_KITS/STATS_ONLY) |
| UI / render | client files + `test/ui|render/`; run the relevant `RENDER_E2E=1` suite |
| Battle fx | a **procedural** archetype first (`FX_KINDS`, `render/fx/kinds.js`), then an optional `local` layer spec (`render/fx/localart.js`) if official art is extractable; pin both tiers in `test/render/fx-local.test.js` (docs/ASSETS.md "Battle effects"). Our custom operators' normal-attack **hits** are the one hand-authored exception (`render/fx/hits.js`, `test/render/fx-hits.test.js`) |
| Docs only | `test/docs-consistency.test.js` / `docs-paths.test.js`; no golden change |

**Battle fx rule (owner, 2026-10-08):** every fx kind has two tiers — the procedural drawing (mandatory, always
available, the guaranteed fallback) and an optional local-client art tier drawn only when the client has it listed
and loaded. Never a blank frame and never a network dependency in the fallback: a client without the art sees the
procedural effect (Minecraft-shader-style graceful degradation). A `local`-only kind is a bug. The **normal-attack
impact** is procedural for the season roster (no `local` tier) because the official per-attack hit is a
particle-system effect prefab the projectile prefabs name in `_effectsWhenHit`, not one texture — a signature-texture
ground field there was removed as visibly wrong. **Our seven custom operators are the exception** (`render/fx/hits.js`):
each has a hand-authored, body-anchored hit read from its own `_*_hit_*` prefab, with an optional same-bundle official
flash as a `local` core (docs/ASSETS.md "Battle effects", `docs/DEVELOPMENT.md` §9.1, `docs/OUR-FEATURES.md` §1). Faithful
per-attack impacts for the whole roster are a **planned future task** (a particle-system importer + per-operator
projectile mapping); do not start it without the owner.

---

## (b) Fork / merge discipline with upstream

The **mainline (主线项目)** is `origin` (`sganggs/Stronghold-Protocol`); our state lives in `_merge-scratch` on branch `ours`.
We have merged through upstream `feedback5` (`docs/MATCHMAKING.md` §33), then folded in **feedback6
(selective)** and **feedback7 (the R22 batch + Group A + the JP voice dub + Group C/R23)** by **selective
cherry-pick**. The chronological record of every batch — what came in, what was skipped and why, the conflicts,
the golden movement and the local commits — is [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md); consult it and
**append a section to it** for every new batch.

Merge procedure:

0. **Reconnaissance first.** `node tools/check-upstream.mjs` — fetches the mainline and reports how many commits are new
   to us, which of the files they touch we changed too (the predicted conflicts), whether any of them lands on the §0
   never-merge surface, and the **real** conflict list from an in-memory `git merge-tree` (it never touches the working
   tree). `--strict` exits 1 when there is new work, so it can gate a script; `--no-fetch` works offline against an
   existing ref. **Nothing to merge → stop here and say so** instead of opening a merge.
1. In `_merge-scratch`: the **store is the source of truth** — first make the working project mirror it, so both
   trees agree before the merge (`node tools/push-gitee.mjs --no-push` mirrors store → tree; the `git --work-tree`
   check in `docs/DEVELOPMENT.md` §1 is the same test).
2. `git fetch origin` (and/or `upstreamm`) then `git merge origin/master` for a **full** merge, or — the default for
   a **feedback batch** — the selective cherry-pick below.
3. Resolve **hunk-by-hunk, keeping both sides.**
   - **NEVER** `git checkout --theirs` / `git checkout --ours` on a source file. Never blanket-accept a file.
   - Keep our custom content and the upstream's new work together; when a block genuinely conflicts on the same line,
     take our behaviour and fold in the upstream improvement.
4. Honour the **merge blacklist** (`docs/MATCHMAKING.md` §22) and the **永不合并 list**
   ([`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0):
   - **#149 盟约收起 (foldable bond bar)** — excluded; the bond strip stays permanently shown and centred.
   - **最近的同盟 (recent alliances chips)** — our own removed feature; must not come back.
   - upstream 克莱门莎 (`2e122873` / `0b0ce4fb` / `ba5b998a`) — we keep our `char_4231_clemnt`.
   - R21P 满潜 / R22-LOADOUT (潜能 / 练度) — **kept since the v0.2.6 merge (2026-10-14)**: the merge re-introduced
     them and the owner chose to keep them, so **do not revert the loadout feature back out** (see §0 / §11).
   - Self-check after the merge: `grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server`
     and `grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test` must both be empty.
   - `git log -S bondsCollapsed -- public/js/screens/game.js` shows if upstream re-added it.
5. Run the full `node --test` in the store; only then publish (`node tools/push-gitee.mjs` pushes the store and
   mirrors it back into the working project).
6. Record the merge in [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) (a new `## N.` section) **and** in
   `docs/MATCHMAKING.md` (what came in, what conflicts, what we kept).

**Selective cherry-pick (the default for a feedback batch — feedback6, feedback7 R22/R23).** Do **not** rebase a
whole upstream branch onto `ours`. Instead:

1. Fetch upstream; the upstream object database is present locally, so an upstream hash is inspectable with
   `git show <hash>` even when it hangs off no ref. Write the ordered upstream commit list to a scratch note (the
   `D:\DOTK\_merge-attrib\all-fb7.txt` pattern: `git log --oneline <base>..<HEAD>`).
2. **Triage each upstream commit into an area** (`G-*`, `R2x-GHSIM/OSIM/RENDER/HUD/FIELDS/LATE`, `VOICES`, `dober`,
   `LOADOUT`, …) and mark it:
   - `OK` — cherry-pick as-is; `OKg` — it moves golden, so it is regenerated in our combine commit;
   - `SKIP` — not applied, **with the reason** (`SKIP-ALREADY` / `EMPTY`: ours already has it; *our file differs*:
     the hunk lives in `render/units.js` / `skills.js` / a kit / a test we rewrote; *doc-only leftover*: the code is
     already ours; *owner-excluded*: LOADOUT / the dobermann extras).
   Record the triage in a scratch note (`apply-log.txt` pattern) before touching `ours`.
3. Work in an **isolated throwaway worktree** (`git worktree add --detach <tmp> HEAD`) with `node_modules` and
   `.cache` **junctioned** from the store and the git-ignored `data/local-assets.json` copied from the dev tree, so
   the full suite (and the asset/package tests) run honestly; `cmd /c rmdir` the junctions afterwards — never delete
   through them.
4. **Cherry-pick the `OK`/`OKg` set onto `ours`, preserving the author and the subject**, adapting to the fork where
   the tree differs (our `Math.hypot` not upstream's `detmath.js`, our `teammateProgress`, our test files, our
   packaging). One commit per upstream commit is the target; the adaptation (`test/docs: adapt … to our fork`) and
   the goldens go in their own commits.
5. **Golden attribution proof first, regenerate second** (see the rule below). Never hand-edit golden and never
   loosen an engine guard.
6. **Preserve everything in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md)** — in particular §7 (the lobby-community
   surface: `server/community.js`, the rooms screen, the chat) and §8 (the post-0.3.0 surface: the JP voice
   `audio.voiceJp`, the stats page, `render/drag.js`, the 失衡 / R23 timing constants). A hunk that would drop one
   of these is a stop-and-ask item.
7. Bump the version and write the [`CHANGELOG.md`](../CHANGELOG.md) entry (see `test/version.test.js`), then push
   via the **one-way helper** `node tools/push-gitee.mjs` (store → remotes (GitHub primary + Gitee mirror) → dev tree;
   never the reverse without
   `--from-dev`) and **byte-verify the dev tree mirror**.

**Golden attribution rule.** Any `test/golden/*.json` change must be proven to come from your change and nothing else:
revert **only** your change (keep everything else) → `node tools/golden.mjs` must show **zero** diff; restore your
change → the diff must be **exactly** what you expect. Write the proof into the `docs/MATCHMAKING.md` section (see
§35.1). Never edit golden output without this proof, and never loosen an engine guard to make it pass.

---

## (c) Commit & push discipline (art relay first, then GitHub primary + Gitee mirror)

> **Order matters since 2026-10-14 (owner): publish the ART RELAY first.** `node tools/push-assets-relay.mjs` pushes the
> checkout to `123.57.150.185`, the box every client now loads assets from first — a push deploys it (its bare repo's
> `post-receive` checks the tree out into what nginx serves), and its full history came from gitee once, so the push
> carries only the new objects. Then push the mirrors as usual. Details, connection and routes:
> [`docs/ASSETS.md`](ASSETS.md) "The relay".


- **The git store `_merge-scratch` is the single source of truth** (history *and* files). The **working project has
  no `.git`** and is a byte-for-byte **mirror** of the store — the helper keeps it in step.
- Everything is mirrored **one way: store → remotes → working project.** `node tools/push-gitee.mjs` commits what you
  staged in the store, pushes the store's `HEAD` to **every configured remote** (the **GitHub primary** first, then the
  **Gitee 国内下载镜像**), and only then copies the store's tracked files into the
  working project (respecting `.gitignore`). It **never overwrites the store with the working project** — a stale
  working project must not revert the store's newer commits (that is why `--from-dev` exists and is **off** by default).
- `--from-dev` is the explicit, opt-in reverse sync (working project → store) for the rare case the working project
  is genuinely ahead; without it the helper warns that the tree diverged and restores it from the store.
- Push targets: the **`github`** remote (PRIMARY) →
  `https://github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download.git`, then the **`gitee`**
  remote (国内下载镜像) → `https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git`, branch
  **`master`** (the store's branch is `ours`; `HEAD:refs/heads/master`). A normal run pushes to **every configured
  remote**, primary first; `--remote <name>` restricts it, `--all-remotes` forces both, `--tags` also pushes
  `refs/tags/*`. Every push is fast-forward only and **never forced**. `origin` stays the GitHub upstream
  (`sganggs/Stronghold-Protocol`).
- **Credentials are not in the URL and must never be committed.** Each remote has its own:
  - **GitHub (primary) — the OWNER's credential.** By default the helper uses whatever git credential helper is
    configured (Git Credential Manager, already signed in, or `gh auth login`). For a per-run token set
    `GITHUB_TOKEN` (alias `GH_TOKEN`; `GITHUB_USERNAME` optional) — a PAT with `repo` scope. The helper writes it to a
    temp credential file OUTSIDE the repo (same mechanism as Gitee). If GitHub still asks for credentials the helper
    reports exactly what is needed; it never guesses a token.
  - **Gitee (mirror) — login name + token.** The ASCII login is **`marseille1`** (the Chinese name is only a display
    name) + a **personal access token** (账号设置 → 私人令牌, scope `projects`): `GITEE_USERNAME`/`GITEE_TOKEN`
    (aliases `GIT_USERNAME`/`GIT_PASSWORD`).
  ```powershell
  # one-time interactive sign-in (lets the credential manager store them), for either remote:
  node tools/push-gitee.mjs --interactive

  # or per-run (agent/CI): the helper writes a temp credential file outside the repo and resets the helper list
  $env:GIT_USERNAME="marseille1"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs -m "…"   # Gitee
  $env:GITHUB_TOKEN="<pat>"; node tools/push-gitee.mjs -m "…"                                      # GitHub
  ```
  This machine's **system** gitconfig sets `credential.helper=manager`; because the first helper that answers wins, a
  stale stored credential there can shadow a supplied token — the per-run path resets the list (`credential.helper=`)
  so the supplied token is used. The committed helper never writes a token into the repository.
- **Runtime static resources are tracked in the repository** (owner decision 2026-10-08; the GitHub primary and the
  Gitee mirror): `public/assets/**`,
  `public/fonts/**` and `public/vendor/**` are committed, so a plain `git clone` runs without fetching art. They used
  to be git-ignored and delivered by `tools/fetch-assets.mjs` (a public mirror) or `tools/local-extract/`;
  `node tools/fetch-assets.mjs --asset-source=mirror` is now **optional**, to pull upstream art that changed after the
  last commit. This repo is public and the art is (c) Hypergryph / Yostar — the owner made that call knowingly.
- Git-ignored and never committed: `node_modules/`, `.cache/`, `.venv-extract/`, `__pycache__/`, `test/e2e/out/`,
  `logs/`, `var/`, `data/local-assets.json`, `scripts/service.env.cmd`, `.env*`, `packs/index.json`. The mirror only
  copies paths that the store tracks (`git ls-files`), never deletes working-project-only files, and never stages the
  working project over the store; still review `git status` in the store before pushing.
- Commit messages: concise English subject; add a `docs/MATCHMAKING.md` section reference for non-trivial changes.

---

## (d) Production deploy procedure

> **This section is the only place the deploy order is defined. Follow it exactly.** The deploy is done by the owner
> / operator over SSH; never deploy without the owner's go-ahead (see (e)).

Production: `http://183.66.27.19:20522` (NAT → internal `:3000`) on a RainYun Debian KVM host.

**The hard order — do not reorder:**

1. **推通知 FIRST.** With the server still up, push a signed in-game notice to every logged-in player:
   ```bash
   curl -s -X POST "http://127.0.0.1:3000/admin/api/notify?token=$(cat var/admin-token.txt)" \
     -H 'Content-Type: application/json' \
     -d '{"text":"服务器将在 5 分钟后重启更新，请尽快结束当前对局；更新完成后刷新页面即可。","sign":"d星空之下"}'
   ```
   Signature is **`d星空之下`** by default; the text says what is being updated, roughly how long, and to refresh.
   (Admin panel equivalent: `/admin?token=…` → 通知 panel; history is kept in `/admin/api/state`.)
2. **Wait ~30 s** so clients render the notice before anything drops.
3. **Upload the delta** (incremental). Static files (`public/**`) need no restart but **must be uploaded**; anything
   under `shared/**` or `server/**` needs a restart. Back up first (see rollback below). Package excluding machine
   files:
   ```bash
   tar -czf sp-full.tgz --exclude=./node_modules --exclude=./public/assets --exclude=./public/vendor \
     --exclude=./public/fonts --exclude=./.cache --exclude=./var --exclude=./logs \
     --exclude=./test/e2e/out --exclude=./data/local-assets.json .
   scp -P 45217 sp-full.tgz root@183.66.27.19:/root/
   ```
   On the host: unpack into `/www/wwwroot/Stronghold-Protocol`, `chown -R www:www .`, dirs 755 / files 644. (Assets
   are the exception: new art/voice/Spine must be uploaded too — for a new operator, all files its manifest lists.)
4. **Restart** (only when server/shared changed): find the `:3000` pid (`ss -ltnp`) and `kill -TERM` it, then
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`.
5. **Verify**: `curl http://127.0.0.1:3000/healthz` (and the public URL), then spot-check the changed endpoints:
   `/data/<file>.json`, `/sim/content/...` for a new kit, an avatar/skill icon URL for new art. Confirm the notice
   history recorded the push.

**Rollback.** Before uploading, snapshot on the host; `PROJECT-STATE.md` §7 keeps the convention:

```
tar -czf /root/sp-backup-$(date +%Y%m%d-%H%M%S).tgz server shared public docs data   # on the host, before deploying
# roll back = unpack the wanted /root/sp-backup-*.tgz over /www/wwwroot/Stronghold-Protocol, then redeploy + restart
```

Locally, every change batch is snapshotted under `D:\DOTK\_optim-backup-<date>-<topic>\`.

**SSH details** (safe to record — no secret):

| Item | Value |
|---|---|
| SSH | `ssh root@183.66.27.19 -p 45217` |
| Project | `/www/wwwroot/Stronghold-Protocol` (runs as user `www`) |
| Process script | `/www/server/nodejs/vhost/scripts/server.sh` (`setsid`) |
| Logs | `/www/wwwlogs/nodejs/server.log` |
| Baota panel | `https://183.66.27.19:32467/rainy` (user `rainyun`) |
| Admin token | `var/admin-token.txt` on the host |

**The SSH password/key is NOT in this repository and must never be written into it.** It is held by the owner
(`d星空之下`) outside the repo (owner's password manager / local secret store); ask the owner for it at deploy time,
and never paste it into a commit, doc, script or log. See `docs/PROJECT-STATE.md` §3/§7 for the surrounding context.

---

## (e) When to ask the owner — and the notice/signature convention

**Stop and ask `d星空之下` before acting when:**

- A change would **remove, hide or override our custom content** (any of the eight custom operators, their kits/art,
  the custom traits, the leave/takeover rule, the 联防 arena) or a blacklisted feature would reappear.
- Two of our features conflict, or an upstream merge would force a choice between our behaviour and theirs beyond the
  blacklist.
- The spec is ambiguous or the official source is unclear/contradictory — present the options and the evidence; do not
  guess silently. (Record the eventual decision in `docs/MATCHMAKING.md`.)
- Anything touches **production**: restarting the service, uploading server files, changing env/`SP_VERIFY`, the
  admin token, firewall/proxy. Per §28: **得到同意后才执行** — get consent, then notice-then-restart.
- A push needs credentials you do not have, or a golden diff cannot be fully attributed.

**Notice / signature convention:**

- Every restart or server-file upload is preceded by an in-game notice (step 1 above).
- Signature defaults to **`d星空之下`**; keep it unless the owner says otherwise.
- Pure static (`public/**`) changes still get a notice before upload (the client version guard reloads open pages).
- Keep it short and player-facing: what changed, ~how long, refresh to get it.

**Never, without the owner:** force-push over remote work; rewrite published history; commit secrets; raise an engine
guard; hand-edit generated `data/*.json`; deploy.
