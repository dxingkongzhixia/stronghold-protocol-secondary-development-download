# Upstream merge log (`UPSTREAM-MERGES`)

Who this is for: **the next person who merges upstream** and **anyone auditing what we took from
`sganggs/Stronghold-Protocol`**. This is the chronological record of every upstream batch folded into our fork:
what came in, what we deliberately left out, how conflicts were resolved, how the golden corpus moved, and the
local commits it produced.

Read this together with:

| Read this | For |
|---|---|
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | the merge **procedure**, the golden-attribution rule, the Gitee push, the deploy order |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | what is **ours and must survive** a merge (and the §7 lobby-community surface) |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22 / §33–§38 | the **decision record** (the blacklist §22, the feedback5 merge §33, the fix log §35, the community surface §36/§38) |

Conventions used below:

- **Upstream commits** are authored `sganggs <sganggs@users.noreply.github.com>`; **our commits** are authored
  `merge <merge@local>` (the store `_merge-scratch`, branch `ours`). The upstream object database is present in
  the store even when a commit is unreachable from a ref, so an upstream hash can be inspected with
  `git show <hash>`.
- The git store `_merge-scratch` is the single source of truth; the working project `Stronghold-Protocol` has no
  `.git` and is a byte-for-byte mirror. See [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §6.
- **Never** `git checkout --theirs/--ours` on a source file. Resolve hunk-by-hunk, keeping both sides. When a
  block genuinely conflicts on the same line, **take our behaviour** and fold in the upstream improvement.

---

## 0. 永不合并 — the never-merge list

These upstream commits/features are **excluded by the owner** and must not be merged (or, if re-applied, must be
reverted):

| Item | Upstream evidence | Why never |
|---|---|---|
| **#149 盟约收起 (foldable bond bar)** | upstream `game.js` `bondsCollapsed` / `bonds-toggle` / `gm__bond-list` / `match-bond-strip` | The bond strip stays **permanently shown and centred**. Blacklisted in `docs/MATCHMAKING.md` §22. Self-check must stay empty: `grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server`. |
| **最近的同盟 (recent-alliance chips)** | our own removed feature | We removed it (commit `6d27d583`, 2026-10-07) and it must not come back. Self-check: `grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test` empty. |
| **Upstream 克莱门莎 (Clementia)** | `2e122873` *0.2.3: add Clementia and Shu/Ulpianus modules (#437)*, `0b0ce4fb` *Update expanded roster checks and register Clementia impact visuals*, `ba5b998a` *0.2.3: Clementia S2 releases a dead, hidden, uncarriable or pathless rider at once* | **We keep OUR `char_4231_clemnt`** (the self-made 6★ 本源近卫, `docs/MATCHMAKING.md` §37, `CUSTOM_CHESS`). Upstream's Clementia is a different, official-data operator; taking it would collide with ours. |
| **R21P 满潜 (every operator at full potential)** | `806a0477` / merge `b05845f5` (feedback6 R21P: 潜能 6) | The owner's **full-potential rule is not adopted**; our fork keeps its own potential handling. Never merged. |
| **R22-LOADOUT (per-operator 潜能 / 练度)** | `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`, `8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` | **The owner excluded the 潜能 / 练度 loadout screen** (`干员调配` per-operator potential/elite-level selects). Not taken in the R22 batch (see §4). |

The self-checks for the §22 blacklist are in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §5 and run after every merge.

---

## 1. feedback5 — the full upstream merge (2026-10-07)

**What it was.** The big upstream drop: `origin/master` at **`1303321` (v0.2.0)**, **383 commits / 848 files** —
v0.2.0 itself (补位 / 自选编队 / i18n / custom hotkeys / lite package), the four new languages (English, 日本語,
한국어, 繁體中文), the R19A–R19G community-fix stream and the CB1–CB5 community-report stream, plus the Boss and
asset work.

**Result.** Merge commit **`e3bd9de7`** (`merge upstream feedback5 (383 commits) …`), parents = our pre-merge
`1557a5a` + upstream `1303321`. Resolved block-by-block; no whole-file side was taken.

**Kept (our side):**

- **All six custom operators** at the time (阿斯卡纶 / 结城理 / 予愿安洁莉娜 / 澄闪 / 娜仁图亚 / 望) — data, kit,
  art, voice, tests, count assertions.
- **Option A — the shop chess win on a name clash**: upstream ships the same five names as *自选* (`ops/op-*.js`);
  upstream's five duplicate files were dropped, keeping our shop chess.
- **Our bond strip** (banned members hidden / counted, not upstream's "show + disable badge").
- **The §22 blacklist** (see §0) — #149 excluded, 最近的同盟 removed for good.

**Structural moves (upstream refactors we carried our changes into):**

- `kits/tier{1..6}.js` → one file per operator `kits/ops/chess_char_<…>-<codename>.js` + `kits/index.js`
  (`KIT_FILES` / `STANDIN_KIT_FILES` / `OPERATOR_KIT_FILES`); shared helpers in `kits/shared/tierN.js`.
- `docs/DESIGN.md` became an **index**; current rules in `docs/design/*.md`, revisions in `docs/history/*.md`.
- Broad split of `server/sim/Battle.js`, `server/match/Match.js` / `PlayerState.js`, `server/index.js` into thin
  façades + method modules.

**Conflicts and how they were resolved.** Kits (ours landed in the new per-operator files and `KIT_FILES`); the
bond strip; the i18n sweep (our new/kept Chinese strings wrapped in `t()`, module-level tables kept `N_()`);
the local-client token Spines (our extractor added 39 tokens / 117 files).

**Golden.** Regenerated on the merged tree; the merge commit's record (see §33) and the subsequent CB/R19 streams
enumerate every moved scenario.

**Verification.** `_merge-scratch` full `node --test`: **5110 / 5102 pass / 0 fail / 8 skip**;
`node tools/kit-coverage.mjs` **301/301 skills, 118/118 chess**; `node tools/build-data.mjs --offline` clean. The
working project passes the same except the two `git ls-files` suites (`docs-paths`, `package`) that need a `.git`.

**Local commits.** `e3bd9de7` (the merge) and the post-merge fixes `d2def363` → `7ef2607d` (docs §33, remove
最近的同盟, 望 棋子 auto-placement, funnel drones, 结城理 formats, 澄闪 浮游单元, kalts2, the unite arena, the
two-tier battle-fx system, the asset sources, the local-art pipeline, `push-gitee.mjs`, `ARMOR`/review fixes).

Full write-up: [`docs/MATCHMAKING.md`](MATCHMAKING.md) §33.

---

## 2. feedback6 — selective (2026-10-07)

**What it was.** Upstream's feedback6 line, released as **v0.2.1 (`c2a2ef77`)**. The upstream R21 stream is a set
of community rules (R21A…R21P + `fb6-diy-esc` + `fb6-small-fixes`). We took a **selective** subset.

**Taken (upstream hash = the commit as it sits in our history):**

| Upstream commit | Rule | Our golden move | Local commit |
|---|---|---|---|
| `322cd877` R21A | a 突袭 member may land on a teammate's half when both halves of a field are taken (two-helper 联防 and the Final Assault / Hidden Core pair); a lone helper's empty half, a solo boss field's other half and the hand/temp rows stay closed | 8 scenarios (boss pair fields + `coop4-ABYSS-7`) | `322cd877` |
| `11b05091` R21E | 外勤医疗 Touch casts 恳切福音 on an injured ally inside its 5‑2, and the Touch card is an operator card | `roster-041`, `coop2-NORMAL-14-standins` | `11b05091` |
| `dd3cb3c4` R21E | an operator's 凋亡 burst drains the official 技力 (stored charges included) | 5 (fields + `diy-058/059`) | `dd3cb3c4` |
| `6a081266` R21E | a refresh runs the 刷新时 特质 of the chess that stood on the board / in the hand when it happened | unchanged | `6a081266` |
| `8ae8c4e4` R21H | the round's enemy effects reach the 频次 器物 and the leaders' mid-fight summons | 74 | `8ae8c4e4` |
| `c44f2ad6` R21D | a consume-on-equip item on a full carrier opens the replace dialog and replaces the picked item first | 10 matches | `c44f2ad6` |

**Skipped (not taken at that time):**

- **R21B** (联防 on the round's battlefield) — **ours already did this** (`14b58ec1` / `1fa045bf` / `9ddce457`,
  `docs/MATCHMAKING.md` §35.4 reverts upstream #41's escaped map).
- **R21C** (自选 picks in bond member lists), **R21F** (enemy flyer hover), **R21G** (held control messages),
  **`fb6-diy-esc`** (Esc in the 自选 picker), **`fb6-small-fixes`** — not part of the selective set (where the
  behaviour was wanted it is present in `ours` by another route or arrived later).
- **R21P 满潜** — **never merged** (§0).

**Conflicts.** The R21E Touch card reads our `tokens.json` record; every golden was regenerated on the merged
tree and the R21 streams' moves were kept. Local: `8fa90abb` (feedback6 selective: regenerate the golden corpus
for R21A / R21E×3 / R21H / R21D).

**Our own version bump** at this stage: the fork went from the merged `0.2.0` toward its own `0.3.0` (the next
section). Upstream's own release tags `v0.2.1`/`v0.2.2`/`v0.2.3` exist in the store as upstream objects; our fork
does not bump to them.

---

## 3. 0.3.0 — our own feature release (2026-10-08/09, not upstream)

0.3.0 is **ours**, not an upstream merge — but it sits between the merge batches and is the state the next batches
were applied on top of. It brought the lobby community (更新日志 / bug提交 / 公开房间), the 8th custom operator
**克莱门莎** (`char_4231_clemnt`), room text chat (等待室 + 局内 临时气泡), the 凯尔希·思衡托 S2 特效 fix, the
official battle-fx art (two-tier system for the whole roster + our operators), and it bumped `APP_VERSION` to
`0.3.0`. This work is 0.3.0/**deployed** and is documented in [`CHANGELOG.md`](../CHANGELOG.md) 0.3.0 and
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §36–§38 + [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §1–§7.

---

## 4. feedback7 — the R22 batch (2026-10-09/10)

**What it was.** The large feedback7 stream, upstream HEAD **`62eb1134` (feedback7 v0.2.2)**, later **`1db8e510`
(0.2.3, also `upstreamm/master`)**. The full ordered upstream commit list is preserved at
`D:\DOTK\_merge-attrib\all-fb7.txt` (138 commits); the per-commit triage is in
`D:\DOTK\_merge-attrib\apply-log.txt` and the area index in `order.txt` / `take-order.txt`. Areas:
`G-TOOLS`, `G-UI`, `G-SMALL`, `stats`, `UIBACK`, `R22-GHSIM`, `R22-OSIM`, `R22-RENDER`, `R22-HUD`,
`R22-FIELDS`, `R22-LATE`, `R22-VOICES`, `dober`, `R22-E2EFIX`, `R22-UNBAL`, `R22-LOADOUT`.

**Method (the selective cherry-pick).** Each upstream commit was **cherry-picked onto `ours` with its author and
subject preserved**, then adapted to the fork where our tree differs. The triage marks are:

- `OK` — cherry-picked as-is (source applied; goldens later).
- `OKg` — cherry-picked and marked **"golden ours"**: the commit moves golden scenarios, so the golden corpus was
  regenerated in **our** combine commit (attribution first, see below).
- `SKIP` — not applied; the reason is one of: **ours already has it** (a fork implementation with the same
  behaviour — we do not take upstream's file), **the hunk lives in a file our fork rewrote** (`render/units.js`,
  `skills.js`, a kit, a test), **doc-only leftover** (the code is already ours), or **excluded by the owner**
  (LOADOUT, the dobermann extras). `SKIP-ALREADY` / `EMPTY` mean the behaviour/diff was already present.

**Golden attribution.** No golden file was hand-edited. For a moving commit, the change was reverted alone →
`node tools/golden.mjs` shows **zero** diff; restored → the diff is exactly the expected scenarios. The combined
regenerations are our commits **`eeae4210`** (R22 source changes: roster 21, bonds 14, fields 15, matches 12,
standins 2, diy 8 move) and **`177bad63`** (re-based onto Group A, combined corpus). The rule is
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b).

**Taken — by area** (upstream hash → ours; the rule in one line; `→` = our re-implementation under our author):

*G-TOOLS / G-UI / G-SMALL / stats / UIBACK*

| Upstream | Ours | Rule |
|---|---|---|
| `51c53de1` | `a202a59a` | listen on `::` so one socket serves IPv6 and IPv4 (#291) |
| `c36320fe` | `eb9b4092` | GitHub issue templates (#300) |
| `e8ba0912` | `c48adc99` | battle performance bench under `public/dev` (#198) |
| `1f147a28` | `74357012` | `tools/ci.mjs` + `npm run ci` (#367) |
| `a2a3f524` | `252c499d` | `SP_VERIFY` re-runs slices inside the 8 ms budget (#352) |
| `5f0a06cc` | `99afe008` | retreat with a full bench counts the summon stack's slot (#361) |
| `bc22f9cb` | `808b476e` | Enter on the equip-replace dialog keeps native behaviour (#358) |
| `59525390` | `286b9adb` | clear the 调度中心 upgrade confirm for the level after D (#356) |
| `246622be` | `baf4a344` | spectator prep view updates after a 机变 pick (#349) |
| `8597b66d` | `cddc8669` | boot build tag includes sim / shared / data (#351) |
| `e2503c7f` | `1b7b9385` | import dialog traps keyboard focus (#341) |
| `063408e4` | `095a3a5e` | `build-data --refresh` fails instead of falling back (#350) |
| `d07d97dc` | `c9c5879f` | selling a summoner counts the slots its stacks free (#309) |
| `5662b7ef` | `19eab0c7` | out-of-order language-pack responses (#304) |
| `25bcdff3` | `fab2adab` | reselecting the same operator keeps its draft skill/module (#306) |
| `7c307d86` | `25f5fa3b` | a reconnect token cannot be claimed twice (#299) |
| `b5c29b53` | `1fffc8ff` | asset downloads honour `HTTP(S)_PROXY` (#289) |
| `fd791a66` | `7572dbdb` | co-op rooms can make AI teammates draft last (#368) |
| `073507ec` | `fed6ee97` | double-click a teammate avatar in prep to open their field (#374) |
| `3f884412` | `2ef6339b` | settings can copy local diagnostics (#321) |
| `438a6b52` | `e33a8838` | the local statistics page (PR #323, as submitted) |
| `51e0e60b` | `ecf2d1d0` | a match left right away stays in history but does not count; bounded storage; tabs |
| `df540b62` | `a0d2e884` | a stage device explains itself on a tap (#228 / PR #229) |
| `911e4bff` | `a9a1592a` | a 设置 button in the lobby / room top bar (#238) |
| `7fb41f4f` | `73de8b8d` | 准备就绪 folds the shop bar (#138) |
| `d7c665db` | `e071de72` | the 观战席 capsule + host removes a spectator (PR #120) |
| `b4bc89ad` | `d8ce0214` | the top-bar capsule counts resolved = killed + leaked (PR #308) |
| `4bb0c11e` | `7f54f647` | a 调度中心 upgrade opens the new shop slot EMPTY (#332 / PR #333) |
| `f632e0b0` | `24c074bc` | `docs/design/client.md` names the new screen pieces |
| `1a880699` | `d0af4e5a` | a finished 联防 / boss-pair field publishes its own resolved (our capsule-progress fix) |

*R22-GHSIM / R22-OSIM / R22-RENDER / R22-HUD / R22-FIELDS / R22-LATE / dober*

| Upstream | Ours | Rule |
|---|---|---|
| `3356b340` | `e8c7bb30` | ≥3 overlapping 同名效果取最高 resume strongest-first (#342 / PR #348) |
| `5a50f7b5` | `a898e5a0` | REA-Y「攻击范围内存在N名…」 applied by the engine (#293) |
| `a0cd6826` | `56e9de88` | 异客 S3 雷暴 covers the 13-tile diamond at the target's tile (#322 / PR #329) |
| `b2510524` | `b8f598ce` | 歌蕾蒂娅 S3's skill-end net pulls within 1 tile (tornado keeps 1.5) (#324 / PR #329) |
| `ca671f2f` | `7672a38f` | 大帝 加急调度 stacks without a cap (#328 / PR #329) |
| `bfef34ff` | `b3c561ba` | 假想敌：骨刺 changes model with its 隐匿 (render) (#296 / PR #365) |
| `c250ff66` | `77c18a03` | 假想敌：骨刺 targets as PRTS writes (sim) (#296 / PR #365) |
| `4bd154e3` | `2549d8af` | a 速射手 blocking a ground enemy shoots a flyer first (#220, owner) |
| `895653fc` | `4cb35fd5` | 帝国炮火先兆者 shells hit the impact tile + 8 around (#364) |
| `38d4c3e4` | `85a2e8ae` | 饵·【文火慢炖】 skips noStack bonds (owner) |
| `6d6fbe92` | `b27dc27b` | 伊内丝 S3 restarts on a 突袭 landing |
| `42caca3b` | `d583d719` | 引星棘刺 alchemy units restore HP as 生命回复速度 |
| `977215e1` | `1fe6956d` | PRTS 不可对空 effects spare the flying 炎佑 |
| `dd23572b` | `b2701903` | 琳琅诗怀雅's 香槟炸弹 never shows an HP bar |
| `1e78648a` | `f8ad9834` | closed eyes stay closed without the stencil masks (GitHub #177) |
| `6326dd4d` | `c1a56290` | a late-seen attack plays its whole clip (#246) |
| `8a64edc9` | `4781a863` | an enemy out its attack recovery is drawn standing (PR #381, supersedes #307/#314) |
| `8ae891f1` | *(n/a)* | HP-bar ammo cells: the sim/snapshot part is ours; the doc hunk was skipped — see skipped below |
| `030d0a29` | `fee27b1c` | a renderer that loses the 12 s race no longer mounts late (PR #302) |
| `3484178e` | `2be8fd90` | an early skill cue is held and sounds once (PR #292) |
| `bc11c0d6` | `58d56357` | cached-atlas refreshes take turns from the update order (#327 / PR #334) |
| `16df0bf4` | `ef5d6675` | every shop card draws its own slot's frost (#354) |
| `ffa538c3` | `0e277b34` | 赤刃明霄陈 S3's sword wave is drawn along its path (PR #382, owner item 12) |
| `a87cc1e9` | `96ae10db` | boss-field portals teleport (route-end → far exit → that side's door) (#336 / PR #337) |
| `f14b3a06` | `c8b2ee6a` | 耀骑士临光's 卡西米尔 redeploy reduction floors at 0 (#370) |
| `8d896e40` | `67e40844` | the path tie-break never wades into more 深水区 (#375) |
| `1205336a` | `ee95372e` | a route ending on a corner portal stays hidden 3 s (review of #337) |
| `48a2d37e` | `34365c87` | 突袭 members jump to 隐匿 ground enemies (owner, GitHub #316) |
| `19c7b268` | `fcef8d87` | a 画卷 copy that completes a merge copies the target's equipment |
| `1a67ecc3` | `3af24d3f` | 引星棘刺 S1: two alchemy units add their DEF on one ally |
| `7c56335c` | `4bff9b26` | 谢拉格's 盟约寒风 blows a blizzard up the field (PR #386, owner) |
| `03688c82` | `dc1294ec` | 度算浪波 breaks an HP-ratio tie by the latest deployment |
| `ac423184` | `eec49a10` | a 画卷's copied items arrive unequipped |
| `2df1cf15` | `a41a2e76` | a watched teammate's bond popup counts their bench (#385 / PR #387) |
| `0ca2a9c2` | `45a8cc7f` | an open detail card draws its field unit's current attack range (#281) |
| `05eb2b80` | `eb98158d` | the Final Assault / Hidden Core pay a 战术特训 perfect-battle card (PR #353) |
| `66a228c6` | `f09499f1` | a boss field's perfect payout needs the client result to agree with its `b.progress` |

*R22-VOICES (the JP dub) and the UNBAL slide*

| Upstream | Ours | Rule |
|---|---|---|
| `cb8865d9` | `cb2e3ed9` | a tap on an operator says its 选中干员 line in every phase (owner) |
| `ddf8c39e` | `b398cc46` + `af981bd7` | **the Japanese voice dub** as a second tree beside the Chinese one (`audio.voiceJp`, 设置 → 语音语言 中文 / 日本語, CN fallback; full zip ships both) — our packaging (one switch, `FULL_ZIP_JP_VOICE`) differs from upstream's, so re-implemented |
| `bcee737f` | `af981bd7` | voices review fixes (a 选中 tap no longer restarts the battle-voice gap; the second card says its 选中 line; measured JP size) |
| `2669b6ab` | `20ae5ac2` + `5f78eb63` | a pushed / pulled enemy **slides** to where the sim put it; a dying flyer keeps its lift; a long Die clip plays whole (PR #380) |
| `7a33bc7e` | `453a4e81` | a unit killed on the step of its push lies where the sim put it (Grok review) |
| `cdf2bd5c` | `6e71870d` | the official **失衡 (UNBALANCE)**: no walking / normal attack for the push's 位移时间 or the pull's window (idea PR #392, re-implemented from the sources) |
| `1db84d79` | `c59aab17` | 失衡 review fixes (pulled 静态刚体 held for the window, 弧光锋卫 bleeds, no skill/blink/scripted move, route APPEAR / 逐火 重生 ends it) |
| `a0043d42` | `5616d9b7` | **Preserve enemy facing through push and pull slides** (#418, #427) — re-applied on the R22 slide stack |

*Adaptations, goldens and data (ours):* `9947a64a` (`portalPickup` uses our `Math.hypot`, no `detmath.js`),
`5fa3ae2d` (adapt the strongest-status overlap test + README suite count), `eeae4210` and `177bad63` (goldens),
`2cab8b6b` (**rebuild `data/enemies.json`** — a one-line drift left by the cache merge when 克莱门莎 was added;
the offline rebuild reproduces `data/` byte-for-byte again).

**Ours on top of the statistics page (PR #323 — not an upstream merge).** The local statistics page (`438a6b52` /
`e33a8838`, rows above) later grew a **server-backed** store: `shared/stats.js`, `server/stats.js` on a new
`match_stats` table (schema v5), the `stats.submit` / `list` / `clear` / `view` protocol, the per-owner sync and the
online-player `stats.view`. That layer is entirely ours (caps = 2× the mainline) and must survive a merge — see
`docs/MATCHMAKING.md` §40 and `docs/OUR-FEATURES.md` §8.

**Skipped — the explicit list (upstream hash + why):**

| Upstream | Why skipped (the files it would have touched) |
|---|---|
| `ffa538c3` | already ours — `SKIP-ALREADY` (Group A's `0e277b34` drew the sword qi) |
| `8a64edc9` | `EMPTY` — already applied under another commit |
| `2669b6ab` | our `render/units.js`, `test/render/unitview.test.js`, `test/sim/displace-fx.test.js` differ — ported by hand (`20ae5ac2`/`5f78eb63`) |
| `ddf8c39e` | `README.md`, `data/assets.json`, `docs/DEPLOY.md`, `tools/package.mjs` differ — re-implemented (`b398cc46`) |
| `f2aec39e` | our `server/sim/content/bosses.js` differs — the Hidden-Core 链 change was not taken |
| `7e8b435f` | our `chess_char_4_01-rmixer.js` differs |
| `6326dd4d` | our `test/render/feedback2-enemy-attack-clip.test.js` differs |
| `8ae891f1` | our `interp.js` / `battle/events.js` / `op_hsgma2.test.js` differ — the HP-bar readout is ours |
| `030d0a29` / `bc11c0d6` | doc-only leftovers (`docs/design/client.md`); the code is ours |
| `bfef34ff` | our `render/units.js` differs — ported by hand (`b3c561ba`) |
| `5a045731` | 望's `op-wang.js` / `op_wang.test.js` differ |
| `5f98baec` / `e733171b` | our `chess_char_3_04-swire2.js` (琳琅诗怀雅) / `tokens.js` differ |
| `4128965a` / `db29acf9` | our `skills.js` differs (the #298 instant-skill cycle) |
| `bcee737f` | our `detailPanel.js` / `feedback7-voices.test.js` / `tools/package.mjs` differ — re-implemented (`af981bd7`) |
| `7a33bc7e` | our `render/units.js` differs — ported by hand (`453a4e81`) |
| `69d791f9` | our `skills.js` / `queries.js` differ (白铁 铁钳号) |
| `2df1cf15` / `0ca2a9c2` | doc-only leftovers (`docs/PLAYING.md`); the code is ours |
| `a1bc37ed` | our `public/js/ui/gameLogic.js` differs (Enter during facing selection) |
| `cdf2bd5c` / `1db84d79` | our `displacement.js` / render / goldens differ — ported by hand (`6e71870d`/`c59aab17`) |
| `b972c1fc` / `267a826b` / `917e8924` | our `screens/diy.js` and the loadout e2e tests differ |
| `56a7b918` / `e6321457` / `1ab12763` | **excluded by the owner** (教练 personal choice; the bots' zero-range heavy-guard placement; their docs) |

**R22-LOADOUT (excluded, §0).** `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`,
`8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` — the per-operator 潜能 / 练度 loadout screen; the
owner excluded it, so it was never applied.

**Local commits produced:** the ~50 cherry-picks listed above plus the goldens/adaptations/data commits, ending
`177bad63`, then the slide + UNBAL stack `20ae5ac2`→`c59aab17` and `b3c561ba`/`b398cc46`/`af981bd7`/`2cab8b6b`.

---

## 5. Group A — the post-0.3.0 upstream combat fixes (2026-10-09/10)

**What it was.** A small upstream stream on top of our pre-Group-A tip `a4e11922`
(tag `backup-pre-groupA`). Upstream HEAD ~ the tip of this stream. The commits are authored `sganggs` and were
applied **linearly** (no merge commit), then adapted.

**Taken (upstream = local hash here; they were applied as-is):**

| Commit | Rule |
|---|---|
| `a181b462` | 修复赤刃明霄陈三技能对空自动开启并核实社区反馈 (chen3 S3 air + community combat) |
| `09d74ee3` | charged guardian heals act without enemies; mixed S2 triggers fixed (#406) |
| `bffd06c9` | source-owned Lemuen (蕾缪安) detection and wanted-skill triggers (#428) |
| `a0043d42` | preserve enemy facing through push and pull slides (#418, #427) |
| `5f9e0d51` | count Fartooth (远牙) granted layers on doll swaps (#415, #429) |
| `fe2d1bff` | correct community-reported combat and strategy draft behaviour |
| `2e793db3` | clipboard fallback selection inside dialogs (#433) |
| `ddea1542` | report missing asset leaves + opt-in strict mode (#421) |
| `42fe3279` | Korean wording + default contribution template (#414, #432) |
| `e6f72273` | clean up browser test pipes; scope deliberate outage errors |

**Our adaptations (authored `merge`):** `a36b475e` (restore the rear-player 蕾缪安 S3 lock/ammo regression onto
our test file), `6bdd0800` (**golden: regenerate for Group A gameplay** — chen3 S3 air, guardian heals, Lemuen
wanted, doll-swap layers, community combat/draft), `ce11e4fc` (adapt the Group A regressions to our fork).

**Conflicts.** Where upstream's test/doc files differ from ours (the Lemuen regression, the combat/draft tests,
the docs), the upstream behaviour was kept and the fork's files adapted. Golden re-baselined once on the combined
corpus.

**Note.** The facing fix (`a0043d42`) appears twice in the graph: as the Group A cherry-pick and again as
`5616d9b7` on the R22 slide stack (the R22 RENDER/UNBAL work re-applied it on top of the slide). Both are in
`ours`.

---

## 6. Group C — the R23 stream (2026-10-10)

**What it was.** The final upstream feedback7 additions after v0.2.2, the **R23** stream (plus our adaptations).
Built on the `groupc` branch, rebased to `groupc-rb` = `ours` HEAD.

**Taken (upstream, authored `sganggs`; the same commits appear on `groupc` as `8cbf0ee4` / `de121460` /
`bfbe07e9` / `b4adce31`):**

| Commit (`ours`) | Rule |
|---|---|
| `ddaef46f` R23-TOAST | 拟态物质 / 简易通讯机 / 寻呼模块 that grant nothing say why (`{who}：卡池中已没有{name}` / `{who}：没有可获得的同盟约干员`); the item is still destroyed; en / ja / ko / zh-TW; golden unchanged (GitHub #401, owner OK) |
| `10a7f68d` R23-TICK | an attack interval or a time-SP cost of a whole number of frames takes exactly that many — 1 s = 30 frames, not 31 (PR #402); **golden: every family moves** |
| `4dde652e` R23-TICK | the docs for the whole-frame rule: `docs/SIM.md` §2 / §7.1, `docs/design/geometry-time.md` §4, §27.61 in the DESIGN index + the intro area map |
| `d366dcc0` R23-DRAGSNAP | a dragged operator stands on the tile under the pointer while it is a legal target (`render/drag.js` `dragStandTile`), held under the pointer elsewhere; pick / highlight / tileHover / wheel / drop stay the pointer's tile (the owner's 2026-10-09 recording; report in PR #403, not merged); golden unchanged |

**Our adaptations (authored `merge`):** `cd4887ed` (adapt the 顶栏胶囊 resolved test to our
`teammateProgress`), `8d20f50f` (regenerate the golden corpus for the applied R23 source, rebased onto `ours`),
`f26a4837` (adapt the doc / data tests to our fork and **regenerate the stale `data/enemies.json`** — the one-line
drift is now gone and `node tools/build-data.mjs --offline` reproduces `data/` byte-for-byte).

**Golden.** Every family moved with R23-TICK (commit `10a7f68d`), then was regenerated in `8d20f50f`; compare
`roster 49`, `bonds 46`, `fields 22`, `matches 18`, `standins 10`, `diy 138`.

**Verification.** The isolated-worktree full suite at HEAD `f26a4837`: **5806 tests / 5795 pass / 0 fail /
11 skipped** (see the report in `docs/PROJECT-STATE.md` §9).

**Deliberate divergence.** The 设置 → **问题反馈 / DIAGNOSTICS** section that upstream's `3f884412` added (our R22 port
`2ef6339b`, §4 above) was **deliberately dropped**: it duplicates our own bug-report entry point (the lobby's
「bug提交」), so `public/js/ui/settings.js` no longer carries the section, its 「复制诊断信息」 button, its
recorded-errors row or its `ISSUES_URL`, and the `set-diag*` CSS hooks are gone. `public/js/diag.js` itself stays —
`main.js`, `ui/toasts.js` and `battle/runner.js` still record into its error log.

---

## 7. Pending: the displacement-slide + 失衡 port (`port-r22-slide`)

The branch **`port-r22-slide`** (worktree `D:\DOTK\_merge-wt`) was created to hold the R22 **push/pull slide +
失衡 (UNBALANCE)** port while it was resolved by hand (the upstream commits `2669b6ab` (slide), `7a33bc7e`
(dying-view anchor), `cdf2bd5c` (UNBAL) and `1db84d79` (UNBAL review) all `SKIP` in the batch — see §4).

**Status at HEAD `f26a4837`:** the branch is an **ancestor of `ours`** — `git rev-list --count
port-r22-slide..ours` = 40 and `git log ours..port-r22-slide` is empty. Its tip `b3c561ba` and the whole slide +
失衡 stack (`20ae5ac2` → `5f78eb63` → `453a4e81` → `6e71870d` → `c59aab17` → `5616d9b7`) are **already integrated**
in `ours`, so **nothing remains to merge from it**. Do not delete or touch it (per the owner); it is kept as the
staging branch of record for that port.

> If a future instruction says the slide/UNBAL port is still pending, re-check this: at `f26a4837` it is in.
> The branch's own tree is 40 commits behind and is **not** a source of truth.

---

## 8. How to add the next batch to this log

1. Fetch upstream; write the ordered commit list (`git log --oneline <base>..<head>`) to a scratch note (the
   `_merge-attrib/all-fb7.txt` pattern).
2. Triage each commit into an area; mark `OK` / `OKg` / `SKIP` and the skip reason (already-ours / our file
   differs / doc-only / owner-excluded). Record it (`apply-log.txt` pattern).
3. Cherry-pick the `OK` set onto `ours`, **preserving the author and subject**, adapting to the fork.
4. Golden: attribute first, then regenerate in a dedicated commit (never hand-edit; never loosen a guard).
5. Update this file (a new `## N.` section), [`docs/MATCHMAKING.md`](MATCHMAKING.md) for any non-obvious rule, and
   [`CHANGELOG.md`](../CHANGELOG.md) for the release.
6. Full `node --test` in the store, then publish with the one-way helper (`node tools/push-gitee.mjs`) and mirror
   the working project. See [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b)/(c).
