# AI workflow — how we change, merge, commit and deploy this fork

Audience: the AI agent(s) working on this fork with the owner (`d星空之下`). This is the operational contract:
how a request is handled, how the upstream is merged, how commits and the Gitee push work, how production is
deployed, and **when to stop and ask the owner**. It complements [`docs/MATCHMAKING.md`](MATCHMAKING.md) (the
decision record, including the merge blacklist §22) and [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) (the repository map).
Read `docs/DEVELOPMENT.md` first if you do not know the layout.

Companion conventions, quoted verbatim:

- **之后每次有更新都提交下** — after every change, commit it and push to Gitee.
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
| Docs only | `test/docs-consistency.test.js` / `docs-paths.test.js`; no golden change |

---

## (b) Fork / merge discipline with upstream

The upstream is `origin` (`sganggs/Stronghold-Protocol`); our state lives in `_merge-scratch` on branch `ours`.
We have already merged through upstream `feedback5` (`docs/MATCHMAKING.md` §33).

Merge procedure:

1. In `_merge-scratch`: **first sync the working project** into the store (the store must equal the tree before you
   start). `node tools/push-gitee.mjs --no-push` or the `git --work-tree` check in `docs/DEVELOPMENT.md` §1.
2. `git fetch origin` (and/or `upstreamm`) then `git merge origin/master`.
3. Resolve **hunk-by-hunk, keeping both sides.**
   - **NEVER** `git checkout --theirs` / `git checkout --ours` on a source file. Never blanket-accept a file.
   - Keep our custom content and the upstream's new work together; when a block genuinely conflicts on the same line,
     take our behaviour and fold in the upstream improvement.
4. Honour the **merge blacklist** (`docs/MATCHMAKING.md` §22):
   - **#149 盟约收起 (foldable bond bar)** — excluded; the bond strip stays permanently shown and centred.
   - **最近的同盟 (recent alliances chips)** — our own removed feature; must not come back.
   - Self-check after the merge: `grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server`
     and `grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test` must both be empty.
   - `git log -S bondsCollapsed -- public/js/screens/game.js` shows if upstream re-added it.
5. Run the full `node --test` in the store; only then mirror the store back to the working project.
6. Record the merge in `docs/MATCHMAKING.md` (new section: what came in, what conflicts, what we kept).

**Golden attribution rule.** Any `test/golden/*.json` change must be proven to come from your change and nothing else:
revert **only** your change (keep everything else) → `node tools/golden.mjs` must show **zero** diff; restore your
change → the diff must be **exactly** what you expect. Write the proof into the `docs/MATCHMAKING.md` section (see
§35.1). Never edit golden output without this proof, and never loosen an engine guard to make it pass.

---

## (c) Commit & push discipline (Gitee)

- The **working project has no `.git`** — it is the source of truth for files, but commits happen in `_merge-scratch`.
- Everything is **mirrored byte-for-byte**: after changes, `node tools/push-gitee.mjs` copies the working project's
  tracked files into the store (respecting `.gitignore`), commits, and pushes.
- Push target: remote **`gitee`** → `https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git`,
  branch **`master`** (the store's branch is `ours`; `HEAD:refs/heads/master`). `origin` stays the GitHub upstream.
- **Credentials are not in the URL and must never be committed.** A push needs a Gitee **username + personal access
  token**. Supply it once via a credential helper, or per-run via `GIT_USERNAME` / `GIT_PASSWORD`:
  ```powershell
  git config --global credential.helper manager     # sign in once when prompted
  # or, for one run (needs a helper that reads these; the built-in prompt is disabled by the helper):
  $env:GIT_USERNAME="<gitee-user>"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs -m "…"
  ```
- Git-ignored and never committed: `node_modules/`, `.cache/`, `.venv-extract/`, `__pycache__/`, `test/e2e/out/`,
  `public/assets/`, `public/fonts/`, `public/vendor/`, `logs/`, `var/`, `data/local-assets.json`,
  `scripts/service.env.cmd`, `.env*`, `packs/index.json`. The helper only ever touches `git ls-files` paths, so it
  cannot smuggle these in — but review `git status` in the store before pushing anyway.
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

- A change would **remove, hide or override our custom content** (any of the seven custom operators, their kits/art,
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
