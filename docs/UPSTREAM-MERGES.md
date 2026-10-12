# Upstream merge log (`UPSTREAM-MERGES`)

Who this is for: **the next person who merges upstream** and **anyone auditing what we took from
`sganggs/Stronghold-Protocol`**. This is the chronological record of every upstream batch folded into our fork:
what came in, what we deliberately left out, how conflicts were resolved, how the golden corpus moved, and the
local commits it produced.

Read this together with:

| Read this | For |
|---|---|
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | the merge **procedure**, the golden-attribution rule, the GitHub/Gitee push, the deploy order |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | what is **ours and must survive** a merge (and the 搂7 lobby-community surface) |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂22 / 搂33鈥撀?8 | the **decision record** (the blacklist 搂22, the feedback5 merge 搂33, the fix log 搂35, the community surface 搂36/搂38) |

Conventions used below:

- **Upstream commits** are authored `sganggs <sganggs@users.noreply.github.com>`; **our commits** are authored
  `merge <merge@local>` (the store `_merge-scratch`, branch `ours`). The upstream object database is present in
  the store even when a commit is unreachable from a ref, so an upstream hash can be inspected with
  `git show <hash>`.
- The git store `_merge-scratch` is the single source of truth; the working project `Stronghold-Protocol` has no
  `.git` and is a byte-for-byte mirror. See [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) 搂6.
- **Never** `git checkout --theirs/--ours` on a source file. Resolve hunk-by-hunk, keeping both sides. When a
  block genuinely conflicts on the same line, **take our behaviour** and fold in the upstream improvement.

---

## 0. 姘镐笉鍚堝苟 鈥?the never-merge list

These upstream commits/features are **excluded by the owner** and must not be merged (or, if re-applied, must be
reverted):

| Item | Upstream evidence | Why never |
|---|---|---|
| **#149 鐩熺害鏀惰捣 (foldable bond bar)** | upstream `game.js` `bondsCollapsed` / `bonds-toggle` / `gm__bond-list` / `match-bond-strip` | The bond strip stays **permanently shown and centred**. Blacklisted in `docs/MATCHMAKING.md` 搂22. Self-check must stay empty: `grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server`. |
| **鏈眬绂佺敤鐩熺害琚己鍒跺け鏁?(a 鏈眬绂佺敤 bond forced inert even when its members activate it)** | upstream `server/match/bondsMeta.js` `computeBonds`' `if (gd.modeInactiveBonds.has(id)) continue;` (`01a44cd2`, the initial import 鈥?still at `upstreamm/master` `1db8e510`); the 鏈眬绂佺敤 UI `b4fa21a0` + `695ece26` (feedback1b WG) and `offBondCounts` / grey discs `c0cc1d61` (feedback3 WH). Carried unchanged by feedback5 `e3bd9de7`, Group A `6bdd0800`, R22 `177bad63`, R23 `8d20f50f`. | **The owner's rule (2026-10-11): the ban only stops a bond being OFFERED** (pool / strategy draft / bots). It must NOT make an otherwise-active bond inert 鈥?銆岃 ban 鐨勭洘绾﹀嵆浣胯婵€娲讳篃鏃犳硶鐢熸晥銆?is the bug. `computeBonds` counts every bond, so a 鏈眬绂佺敤 bond whose members reach its threshold is `active` and **takes effect**; one below its threshold stays inert (its layers still ride into the battle, 搂27). The dialog still reads 鏈眬绂佺敤 while it is inactive. Not the 搂22 bond-collapse family (that is the foldable bar). Self-check: `computeBonds` in `server/match/bondsMeta.js` has no `modeInactiveBonds.has(id)) continue`, and `PlayerState.battleBonds` forces no `active: false`. |
| **鏈€杩戠殑鍚岀洘 (recent-alliance chips)** | our own removed feature | We removed it (commit `6d27d583`, 2026-10-07) and it must not come back. Self-check: `grep -rn "recentRooms\|rememberRoom\|鏈€杩戠殑鍚岀洘" public shared server test` empty. |
| **Upstream 鍏嬭幈闂ㄨ帋 (Clementia)** | `2e122873` *0.2.3: add Clementia and Shu/Ulpianus modules (#437)*, `0b0ce4fb` *Update expanded roster checks and register Clementia impact visuals*, `ba5b998a` *0.2.3: Clementia S2 releases a dead, hidden, uncarriable or pathless rider at once* | **We keep OUR `char_4231_clemnt`** (the self-made 6鈽?鏈簮杩戝崼, `docs/MATCHMAKING.md` 搂37, `CUSTOM_CHESS`). Upstream's Clementia is a different, official-data operator; taking it would collide with ours. |
| **R21P 婊℃綔 (every operator at full potential)** | `806a0477` / merge `b05845f5` (feedback6 R21P: 娼滆兘 6) | The owner's **full-potential rule is not adopted**; our fork keeps its own potential handling. Never merged. |
| **R22-LOADOUT (per-operator 娼滆兘 / 缁冨害)** | `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`, `8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` | **The owner excluded the 娼滆兘 / 缁冨害 loadout screen** (`骞插憳璋冮厤` per-operator potential/elite-level selects). Not taken in the R22 batch (see 搂4). |
| **璁剧疆 鈫?闂鍙嶉 / DIAGNOSTICS (copy local diagnostics)** | upstream `3f884412` (our R22 port `2ef6339b`, 搂4) 鈥?the settings section that copies local diagnostics for a GitHub issue | **We dropped it** in `60e9eab8` (the 搂6 *Deliberate divergence* note): our own bug-report entry (the 璁剧疆 dialog's 銆宐ug鎻愪氦銆?since 2026-10-11, before that the lobby's) already reports bugs, so the duplicate section must not be re-introduced. Self-check: `grep -rn "ISSUES_URL\|set-diag\|澶嶅埗璇婃柇淇℃伅" public/js/ui/settings.js` must be empty. |
| **涓婃父鐨?璁剧疆 鎸夐挳浣嶇疆 (top-bar placement)** | upstream `911e4bff` (`a9a1592a`) 鈥?the 璁剧疆 button of the lobby / room top bar, placed left of 鐜╂硶璇存槑 (#238) | **We move 璁剧疆 next to the 妗ｆ account chip** instead (the top bar's right-hand group; in the room, beside the invite key). Upstream's middle placement must not be restored by a later merge. |
| **涓婃父閬撳叿鐗屽簱鎶娿€岀櫧缁欒澶囥€嶄篃鍗″簱瀛?(`6bfc08270c`)** | upstream `6bfc08270c` *0.2.4-dev: round-29 community fixes and the official shared card pool* 鈥?`server/match/player/acquire.js` `acquireItem` adds `if (!this.m.itemPool.canGain(itemId)) { 鈥?'瑁呭搴撳瓨涓嶈冻锛屾湭鑾峰緱璇ヨ澶?; return null; }` with **no `requirePool` escape**, and `server/match/effectsMeta.js` `grantItem` forwards only `source` / `toTemp` / `deferMerge`, so the `requirePool: false` the callers already pass (`server/sim/content/bands/meta.js` 鍙樺舰鑰呴泦缇?R5/10/15; `server/sim/content/garrisons/meta.js` `H.SERVER_GAIN_EQUIP` 鈥?缂皵璧涙€?s `<鑾峰緱鏃?` `garrison_76_a/b`) is dropped; GitHub issue **#488** (saltwmc, 2026-10-11): the trait and the strategy stop paying 鍙樺舰鍚屾瀯浣?once the 3-copy item stock is out (鎶曡祫浜?脳2 exhausts it sooner). | **A `<鑾峰緱鏃?` / strategy grant is not a shop purchase 鈥?the official text has no stock premise.** Our `acquireItem` has **no `itemPool` check**, so 缂皵璧涙€?s trait and 鍙樺舰鑰呴泦缇?pay 鍙樺舰鍚屾瀯浣?every time (the trait's total can pass the upstream cap 3). If the shared card pool is ever merged, `requirePool` must be forwarded through `grantItem` 鈫?`acquireItem` and the trait / strategy grants must pass `requirePool: false`. Self-check: `grep -rn "itemPool\|canGain" server` empty (or those grants pass `requirePool: false`); `test/content/garrisons_meta.test.js` #488. Mirrored in [`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂39.2. |

The self-checks for the 搂22 blacklist are in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) 搂5 and run after every merge.

---

## 璐﹀彿涓庣粺璁★細涓庝富绾跨殑璁捐宸紓锛堟湰鍒嗘敮鐙湁锛岄潪涓婃父鍚堝苟锛?
This note sits beside 搂0 because it is the fork's other standing divergence from upstream: it is not a single merge
record but the **two features the fork adds outside the mainline** 鈥?a server-side account system and server-side match
statistics 鈥?with the rationale and a recommendation for upstream. Read it with [`docs/OUR-FEATURES.md`](OUR-FEATURES.md)
搂8 (the fork-only surface to keep), [`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂2 (accounts) / 搂40 (statistics) and
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md) 搂13 (the schema).

> **鎻愪氦鎽樿锛堝彲绮樿创鍒颁笂娓?PR / issue锛?* 鏈垎鏀湪涓荤嚎涔嬪寮曞叆浜?*鏈嶅姟绔处鍙蜂綋绯?*锛坄server/auth.js` +
> `server/db.mjs`锛孲QLite `var/accounts.db`锛氱櫥褰?/ 娉ㄥ唽銆佽鑹蹭笌鏉冮檺銆佷細璇濅护鐗屻€佽处鍙蜂笌娓稿鍖哄垎锛夛紝骞舵妸**瀵瑰眬缁熻浠?> 娴忚鍣ㄦ湰鍦拌縼绉诲埌鏈嶅姟绔?* 鈥斺€?瀹㈡埛绔妸涓€鏉?*宸茶鑼冨寲**鐨勮褰曪紙娌跨敤涓荤嚎鐨?`normalizeRecord` schema銆?*涓嶆敼瀛楁**锛夌粡
> `stats.submit` 鎻愪氦锛屾湇鍔＄鍐欏叆鏂板鐨?`match_stats` 琛紙`user_version 5`锛夛紝**褰掑睘閿?*涓虹櫥褰曡处鍙风殑 account id锛堟父瀹?> 鐢ㄥ叾浼氳瘽 / 娓稿韬唤锛夛紝鍥犳**鍚屼竴韬唤璺ㄨ澶囧彲瑙?*锛涗笂闄?*娌跨敤涓荤嚎瑙勫垯銆佹暟鍊煎彇涓荤嚎鐨?2 鍊?*锛?000 / 60 / 1.6M 鈫?> 1000 / 30 / 800k锛夛紝`localStorage` 閫€鍖栦负鏈嶅姟绔笉鍙敤鏃剁殑绂荤嚎鍏滃簳銆備富绾裤€岀函鏈満銆侀浂涓婁紶銆侀浂鏈嶅姟绔礋鎷呫€侀殣绉侀潰鏈€灏忋€?> 鐨勮璁℃洿杞伙紝鏈垎鏀敤**鏈嶅姟绔寔涔呭寲鎹㈤暱鏈熺暀瀛樸€佽法璁惧銆佺帺瀹朵簰鐪嬩笌鍚庣画鏁版嵁鍒嗘瀽**锛屽洜姝ゆ妸闅愮鏀舵暃涓恒€屽彧鏆撮湶娓告垙鍐?> 宸插叕寮€瀛楁銆嶏紙涓嶅惈璐﹀彿 id / 閭 / 浠ょ墝 / 娓稿瀵嗛挜锛夛紝骞朵繚鐣欑绾垮厹搴曚笌璐﹀彿绾у垹闄ゃ€?*寤鸿**锛氳嫢涓荤嚎鎰挎剰閲囩撼锛屽仛鎴?> **鍙€夊悗绔?* 鈥斺€?鏃犺处鍙锋垨鏈嶅姟绔笉鍙敤鏃惰嚜鍔ㄥ洖钀藉埌涓荤嚎鐜版湁鐨?localStorage 鏂规锛屼袱渚у叡鐢ㄥ悓涓€璁板綍 schema锛岄浂鎴愭湰鍏煎銆?
**杩欐槸鏈垎鏀殑鍋忕锛屼笉鏄笂娓搞€?* The account system and server-backed statistics are **our fork's additions**;
mainline ships neither (its statistics page is the local, browser-only PR #323). They must survive a merge 鈥?[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) 搂8 lists every file.

**璐﹀彿锛堟湇鍔＄锛夈€?* 鏈垎鏀湪涓荤嚎涔嬪寮曞叆浜嗕竴濂?*鏈嶅姟绔处鍙蜂綋绯?*锛歚server/auth.js`锛坄AuthService`锛?
`server/db.mjs`锛坄node:sqlite`锛宍var/accounts.db`锛夛紝鎻愪緵**鐧诲綍 / 娉ㄥ唽銆佽鑹蹭笌鏉冮檺銆佷細璇濅护鐗屻€佽处鍙蜂笌娓稿鐨勫尯鍒?*锛?閲庢帓绛夐渶瑕佽韩浠界殑鍔熻兘**浠ヨ处鍙蜂负鍓嶆彁**锛堜富绾挎槸绾湰鏈恒€佹棤璐﹀彿鐨勶級銆?
**瀵瑰眬缁熻锛堟湇鍔＄锛夈€?* 骞舵妸**瀵瑰眬缁熻浠庢祻瑙堝櫒鏈湴杩佺Щ鍒版湇鍔＄**锛?
- 姣忔鏈湴鐜╁鍙備笌鐨勫灞€缁撴潫鍚庯紝瀹㈡埛绔妸涓€鏉?*宸茶鑼冨寲**鐨勮褰曠粡 `stats.submit` 鎻愪氦锛涜璁板綍**娌跨敤涓荤嚎鐨?  `normalizeRecord` schema锛屼笉鏀瑰瓧娈?*锛坄shared/stats.js`锛夈€?- 鏈嶅姟绔啓鍏ユ柊澧炵殑 `match_stats` 琛紙`server/db.mjs`锛宍user_version 5`锛岀储寮?`(owner, ended_at DESC)`锛夈€?- **褰掑睘閿紙owner锛?*涓虹櫥褰曡处鍙风殑 account id銆佹父瀹㈠垯鐢ㄥ叾**浼氳瘽 / 娓稿韬唤**锛屽洜姝?*鍚屼竴韬唤璺ㄨ澶囧彲瑙?*锛堢櫥褰曞悗鏈湴
  绉帇琛ヤ紶銆佸綊鍏ヨ处鍙凤級銆?- 鏀寔 `stats.list`锛堣嚜宸辩殑璁板綍锛夈€乣stats.clear`銆乣stats.view`锛堝湪銆屽湪绾跨帺瀹躲€嶄腑鏌ョ湅浠栦汉**浠呮父鎴忓唴宸插叕寮€瀛楁**鐨勮褰曪級銆?- `localStorage` 閫€鍖栦负**鏈嶅姟绔笉鍙敤鏃剁殑绂荤嚎鍏滃簳**锛涢噸澶嶆彁浜ゆ寜璁板綍鑷韩鐨?id / seed+start 鍘婚噸銆?- 鏁伴噺涓婇檺**娌跨敤涓荤嚎瑙勫垯銆佷絾鏁板€煎彇涓荤嚎鐨?2 鍊?*锛?000 / 60 / 1.6M 鈫?1000 / 30 / 800k锛夛紝鏈嶅姟绔寜**鍚屼竴濂楄鍓?*鎵ц锛?  涓嶅彧渚濊禆瀹㈡埛绔€?
璇﹁ [`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂40锛坰chema銆乷wner銆佷笂闄愩€侀殣绉侊級涓?[`docs/DEVELOPMENT.md`](DEVELOPMENT.md)
搂13锛坄server/db.mjs` schema v5锛夈€?
**璁捐鍙栬垗銆?* 涓荤嚎銆岀函鏈満銆侀浂涓婁紶銆侀浂鏈嶅姟绔礋鎷呫€侀殣绉侀潰鏈€灏忋€嶇殑璁捐鏇磋交锛涙湰鍒嗘敮鐢?*鏈嶅姟绔寔涔呭寲鎹㈤暱鏈熺暀瀛樸€?璺ㄨ澶囥€佺帺瀹朵簰鐪嬩笌鍚庣画鏁版嵁鍒嗘瀽**锛屽洜姝ゆ妸闅愮鏀舵暃涓恒€?*鍙毚闇叉父鎴忓唴宸插叕寮€瀛楁**銆嶏紙涓嶅惈璐﹀彿 id / 閭 / 浠ょ墝 /
娓稿瀵嗛挜锛夛紝骞朵繚鐣欑绾垮厹搴曚笌璐﹀彿绾у垹闄ゃ€?
**缁欎笂娓哥殑寤鸿銆?* 鑻ヤ富绾挎効鎰忛噰绾筹紝鍋氭垚**鍙€夊悗绔?* 鈥斺€?鏃犺处鍙锋垨鏈嶅姟绔笉鍙敤鏃惰嚜鍔ㄥ洖钀藉埌涓荤嚎鐜版湁鐨?localStorage
鏂规锛屼袱渚?*鍏辩敤鍚屼竴璁板綍 schema**锛岄浂鎴愭湰鍏煎銆?
---

## 鏍囬鐢婚潰锛氬叕鍛?/ 鍏充簬鏈湇鍔″櫒 / 娣诲姞鍒版闈紙鏈垎鏀嫭鏈夛紝鐏垫劅鏉ヨ嚜鍙︿竴閮ㄧ讲锛?
**杩欐槸鏈垎鏀殑鍋忕锛屼笉鏄笂娓搞€?* 鏍囬鐢婚潰鐨勪笁澶勫皬鍏ュ彛鏄湰鍒嗘敮鑷繁鍔犵殑锛岀伒鎰熸潵鑷彟涓€涓儴缃诧紙`wei.linxia.dev`
鐨?0.2.4 鏋勫缓锛夌殑鎴浘锛涙暟鎹笌鏂囨閮芥帴**鎴戜滑鑷繁鐨勫疄鐜?*锛屾病鏈夋妱瀹冪殑**璧勬簮棰勮浇锛圥RELOAD锛?*闈㈡澘锛?
- **鍏憡 banner + 鍏憡 鍏ュ彛** 鈥斺€?鎺?*鎴戜滑鑷繁鐨勯€氱煡瀛樺偍**锛歚server/community.js` 鎸佷箙鍖栥€屾洿鏂版棩蹇椼€嶉噷
  `source: 'notice'` 鐨勬潯鐩紙绠＄悊绔?`POST /admin/api/notify` 鈫?`lobby.broadcastNotice` 鈫?`recordNotice` 杩藉姞
  `0.2.N`锛夈€傛爣棰橀〉椤堕儴妯箙鏄剧ず**鏈€鏂颁竴鏉?*鍏憡锛沗鐭ラ亾浜哷 鍏抽棴鍚庢妸璇ユ潯鐩殑 id 鍐欒繘 `loadPref`/`savePref`
  锛堥敭 `noticeSeen`锛夛紝鍚屼竴鏉′笉鍐嶆墦鎵般€佹湁鏂板叕鍛婂啀鍑虹幇锛沗GET /community/api/changelog` 鍙栦笉鍒帮紙绂荤嚎 / 杩樻病鏈夊叕鍛婏級
  鏃舵í骞呴殣钘忋€傜櫥褰曟涓嬫柟鐨勩€屽叕鍛娿€嶅叆鍙ｆ墦寮€**鍚屼竴浠?*銆屾洿鏂版棩蹇椼€嶆诞灞傦紙`ui/community.js` `ChangelogOverlay`锛屾爣棰?  鏀逛负銆屽叕鍛娿€嶏級鈥斺€?*涓嶆槸绗簩涓?store**锛涗笌 `ui/notice.js` 鐨勫疄鏃?`sys.notice` 鏉°€佹埧闂存枃瀛楄亰澶╂棤鍏炽€傛枃浠讹細
  `public/js/ui/announce.js`锛沗public/js/screens/title.js`锛堟寕杞斤級锛沗public/js/ui/community.js`锛坄title` 鍙傛暟锛夈€?- **鍏充簬鏈湇鍔″櫒** 鈥斺€?鍙啓鎴戜滑鑷繁鐨勯」鐩簨瀹烇紙`README.md` 搂涓€銆屼簩娆″紑鍙戠増鐨勪笅杞?/ 闀滃儚搴撱€嶃€丟itee 浠撳簱銆?  `shared/constants.js` 鐨勭増鏈?/ 妯″紡銆乣/healthz` 鐨勬瀯寤哄彿涓庡湪绾夸汉鏁般€侀〉鑴氬悓娆剧殑绱犳潗鐗堟潈澹版槑锛夛紝骞舵槑纭湰閮ㄧ讲
  **浠呮敮鎸佺綉椤电増锛堟闈㈡祻瑙堝櫒锛夈€佹墜鏈虹鍙兘瀛樺湪鍏煎闂**锛堟爣棰樼敾闈㈠叆鍙ｄ笅鏂逛篃鏈変竴鍙ュ悓鏍风殑鎻愮ず锛夈€傛枃浠讹細
  `public/js/ui/about.js`銆?- **娣诲姞鍒版闈?* 鈥斺€?鎺ユ祻瑙堝櫒鑷繁鐨勫畨瑁呮彁绀猴紙`beforeinstallprompt` 鈫?`prompt()`锛夛紱宸插畨瑁?/ 鐙珛绐楀彛 / 娌℃湁鎻愮ず鏃?  闅愯棌锛堜紭闆呯┖鎿嶄綔锛夛紝iOS 绛夋棤鎻愮ず鐨勬祻瑙堝櫒缁欎竴鍙ユ墜鍔ㄣ€屾坊鍔犲埌涓诲睆骞曘€嶇殑璇存槑銆?*瀹夎璧勬牸宸茶ˉ榻?*锛氫笂娓?0.2.3 鐨?  瀹夎鍥炬爣涓?`public/manifest.json`锛坄upstreamm/master` 鐨?`90421254`銆乣9ec84f36`锛夊凡鍚堝叆鏈簮锛堣 搂8锛夛紝鍥犳
  Chromium / Edge 112+ 浼氱湡姝ｈЕ鍙戝畨瑁呮彁绀恒€佹寜閽墠鍙兘鏄剧ず銆傛湰鍒嗘敮**涓嶆敞鍐?service worker**锛堜笌涓婃父涓€鑷达紱
  Chrome 108 / Edge 112 璧峰畨瑁呬笉鍐嶈姹傦級锛屾墍浠ヤ笂娓哥殑 `public/js/pwa.js` 鏈悎骞垛€斺€旀垜浠凡鏈?  `public/js/ui/install.js`銆傛枃浠讹細`public/js/ui/install.js`銆?
**涓嶈鎶?*杩欎笁澶?UI 涓庝笂娓哥殑**璧勬簮棰勮浇锛圥RELOAD锛?*娣蜂负涓€璋堬細鍚庤€咃紙`res-pill` / 銆岄杞借祫婧愮鐞嗐€? ZIP 瀵煎叆瀵煎嚭锛?渚濊禆 Service Worker + Cache Storage锛?*涓嶅睘浜庢湰鍒嗘敮**锛涙垜浠嚜宸辩殑 `public/js/preload.js` 鍙槸**鍚姩鏃剁殑鍥剧墖棰勭儹**锛?涓庡畠鏃犲叧銆傦紙涓婃父 0.2.3 鐨?manifest / `public/icons/` 鐜板湪宸插悎骞讹紝瑙?搂8銆傦級

---

## 1. feedback5 鈥?the full upstream merge (2026-10-07)

**What it was.** The big upstream drop: `origin/master` at **`1303321` (v0.2.0)**, **383 commits / 848 files** 鈥?v0.2.0 itself (琛ヤ綅 / 鑷€夌紪闃?/ i18n / custom hotkeys / lite package), the four new languages (English, 鏃ユ湰瑾?
頃滉淡鞏? 绻侀珨涓枃), the R19A鈥揜19G community-fix stream and the CB1鈥揅B5 community-report stream, plus the Boss and
asset work.

**Result.** Merge commit **`e3bd9de7`** (`merge upstream feedback5 (383 commits) 鈥), parents = our pre-merge
`1557a5a` + upstream `1303321`. Resolved block-by-block; no whole-file side was taken.

**Kept (our side):**

- **All six custom operators** at the time (闃挎柉鍗＄憾 / 缁撳煄鐞?/ 浜堟効瀹夋磥鑾夊 / 婢勯棯 / 濞滀粊鍥句簹 / 鏈? 鈥?data, kit,
  art, voice, tests, count assertions.
- **Option A 鈥?the shop chess win on a name clash**: upstream ships the same five names as *鑷€? (`ops/op-*.js`);
  upstream's five duplicate files were dropped, keeping our shop chess.
- **Our bond strip** (banned members hidden / counted, not upstream's "show + disable badge").
- **The 搂22 blacklist** (see 搂0) 鈥?#149 excluded, 鏈€杩戠殑鍚岀洘 removed for good.

**Structural moves (upstream refactors we carried our changes into):**

- `kits/tier{1..6}.js` 鈫?one file per operator `kits/ops/chess_char_<鈥?-<codename>.js` + `kits/index.js`
  (`KIT_FILES` / `STANDIN_KIT_FILES` / `OPERATOR_KIT_FILES`); shared helpers in `kits/shared/tierN.js`.
- `docs/DESIGN.md` became an **index**; current rules in `docs/design/*.md`, revisions in `docs/history/*.md`.
- Broad split of `server/sim/Battle.js`, `server/match/Match.js` / `PlayerState.js`, `server/index.js` into thin
  fa莽ades + method modules.

**Conflicts and how they were resolved.** Kits (ours landed in the new per-operator files and `KIT_FILES`); the
bond strip; the i18n sweep (our new/kept Chinese strings wrapped in `t()`, module-level tables kept `N_()`);
the local-client token Spines (our extractor added 39 tokens / 117 files).

**Golden.** Regenerated on the merged tree; the merge commit's record (see 搂33) and the subsequent CB/R19 streams
enumerate every moved scenario.

**Verification.** `_merge-scratch` full `node --test`: **5110 / 5102 pass / 0 fail / 8 skip**;
`node tools/kit-coverage.mjs` **301/301 skills, 118/118 chess**; `node tools/build-data.mjs --offline` clean. The
working project passes the same except the two `git ls-files` suites (`docs-paths`, `package`) that need a `.git`.

**Local commits.** `e3bd9de7` (the merge) and the post-merge fixes `d2def363` 鈫?`7ef2607d` (docs 搂33, remove
鏈€杩戠殑鍚岀洘, 鏈?妫嬪瓙 auto-placement, funnel drones, 缁撳煄鐞?formats, 婢勯棯 娴父鍗曞厓, kalts2, the unite arena, the
two-tier battle-fx system, the asset sources, the local-art pipeline, `push-gitee.mjs`, `ARMOR`/review fixes).

Full write-up: [`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂33.

---

## 2. feedback6 鈥?selective (2026-10-07)

**What it was.** Upstream's feedback6 line, released as **v0.2.1 (`c2a2ef77`)**. The upstream R21 stream is a set
of community rules (R21A鈥21P + `fb6-diy-esc` + `fb6-small-fixes`). We took a **selective** subset.

**Taken (upstream hash = the commit as it sits in our history):**

| Upstream commit | Rule | Our golden move | Local commit |
|---|---|---|---|
| `322cd877` R21A | a 绐佽 member may land on a teammate's half when both halves of a field are taken (two-helper 鑱旈槻 and the Final Assault / Hidden Core pair); a lone helper's empty half, a solo boss field's other half and the hand/temp rows stay closed | 8 scenarios (boss pair fields + `coop4-ABYSS-7`) | `322cd877` |
| `11b05091` R21E | 澶栧嫟鍖荤枟 Touch casts 鎭冲垏绂忛煶 on an injured ally inside its 5鈥?, and the Touch card is an operator card | `roster-041`, `coop2-NORMAL-14-standins` | `11b05091` |
| `dd3cb3c4` R21E | an operator's 鍑嬩骸 burst drains the official 鎶€鍔?(stored charges included) | 5 (fields + `diy-058/059`) | `dd3cb3c4` |
| `6a081266` R21E | a refresh runs the 鍒锋柊鏃?鐗硅川 of the chess that stood on the board / in the hand when it happened | unchanged | `6a081266` |
| `8ae8c4e4` R21H | the round's enemy effects reach the 棰戞 鍣ㄧ墿 and the leaders' mid-fight summons | 74 | `8ae8c4e4` |
| `c44f2ad6` R21D | a consume-on-equip item on a full carrier opens the replace dialog and replaces the picked item first | 10 matches | `c44f2ad6` |

**Skipped (not taken at that time):**

- **R21B** (鑱旈槻 on the round's battlefield) 鈥?**ours already did this** (`14b58ec1` / `1fa045bf` / `9ddce457`,
  `docs/MATCHMAKING.md` 搂35.4 reverts upstream #41's escaped map).
- **R21C** (鑷€?picks in bond member lists), **R21F** (enemy flyer hover), **R21G** (held control messages),
  **`fb6-diy-esc`** (Esc in the 鑷€?picker), **`fb6-small-fixes`** 鈥?not part of the selective set (where the
  behaviour was wanted it is present in `ours` by another route or arrived later).
- **R21P 婊℃綔** 鈥?**never merged** (搂0).

**Conflicts.** The R21E Touch card reads our `tokens.json` record; every golden was regenerated on the merged
tree and the R21 streams' moves were kept. Local: `8fa90abb` (feedback6 selective: regenerate the golden corpus
for R21A / R21E脳3 / R21H / R21D).

**Our own version bump** at this stage: the fork went from the merged `0.2.0` toward its own `0.3.0` (the next
section). Upstream's own release tags `v0.2.1`/`v0.2.2`/`v0.2.3` exist in the store as upstream objects; our fork
does not bump to them.

---

## 3. 0.3.0 鈥?our own feature release (2026-10-08/09, not upstream)

0.3.0 is **ours**, not an upstream merge 鈥?but it sits between the merge batches and is the state the next batches
were applied on top of. It brought the lobby community (鏇存柊鏃ュ織 / bug鎻愪氦 / 鍏紑鎴块棿), the 8th custom operator
**鍏嬭幈闂ㄨ帋** (`char_4231_clemnt`), room text chat (绛夊緟瀹?+ 灞€鍐?涓存椂姘旀场), the 鍑皵甯屄锋€濊　鎵?S2 鐗规晥 fix, the
official battle-fx art (two-tier system for the whole roster + our operators), and it bumped `APP_VERSION` to
`0.3.0`. This work is 0.3.0/**deployed** and is documented in [`CHANGELOG.md`](../CHANGELOG.md) 0.3.0 and
[`docs/MATCHMAKING.md`](MATCHMAKING.md) 搂36鈥撀?8 + [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) 搂1鈥撀?.

---

## 4. feedback7 鈥?the R22 batch (2026-10-09/10)

**What it was.** The large feedback7 stream, upstream HEAD **`62eb1134` (feedback7 v0.2.2)**, later **`1db8e510`
(0.2.3, also `upstreamm/master`)**. The full ordered upstream commit list is preserved at
`D:\DOTK\_merge-attrib\all-fb7.txt` (138 commits); the per-commit triage is in
`D:\DOTK\_merge-attrib\apply-log.txt` and the area index in `order.txt` / `take-order.txt`. Areas:
`G-TOOLS`, `G-UI`, `G-SMALL`, `stats`, `UIBACK`, `R22-GHSIM`, `R22-OSIM`, `R22-RENDER`, `R22-HUD`,
`R22-FIELDS`, `R22-LATE`, `R22-VOICES`, `dober`, `R22-E2EFIX`, `R22-UNBAL`, `R22-LOADOUT`.

**Method (the selective cherry-pick).** Each upstream commit was **cherry-picked onto `ours` with its author and
subject preserved**, then adapted to the fork where our tree differs. The triage marks are:

- `OK` 鈥?cherry-picked as-is (source applied; goldens later).
- `OKg` 鈥?cherry-picked and marked **"golden ours"**: the commit moves golden scenarios, so the golden corpus was
  regenerated in **our** combine commit (attribution first, see below).
- `SKIP` 鈥?not applied; the reason is one of: **ours already has it** (a fork implementation with the same
  behaviour 鈥?we do not take upstream's file), **the hunk lives in a file our fork rewrote** (`render/units.js`,
  `skills.js`, a kit, a test), **doc-only leftover** (the code is already ours), or **excluded by the owner**
  (LOADOUT, the dobermann extras). `SKIP-ALREADY` / `EMPTY` mean the behaviour/diff was already present.

**Golden attribution.** No golden file was hand-edited. For a moving commit, the change was reverted alone 鈫?`node tools/golden.mjs` shows **zero** diff; restored 鈫?the diff is exactly the expected scenarios. The combined
regenerations are our commits **`eeae4210`** (R22 source changes: roster 21, bonds 14, fields 15, matches 12,
standins 2, diy 8 move) and **`177bad63`** (re-based onto Group A, combined corpus). The rule is
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b).

**Taken 鈥?by area** (upstream hash 鈫?ours; the rule in one line; `鈫抈 = our re-implementation under our author):

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
| `59525390` | `286b9adb` | clear the 璋冨害涓績 upgrade confirm for the level after D (#356) |
| `246622be` | `baf4a344` | spectator prep view updates after a 鏈哄彉 pick (#349) |
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
| `911e4bff` | `a9a1592a` | a 璁剧疆 button in the lobby / room top bar (#238) |
| `7fb41f4f` | `73de8b8d` | 鍑嗗灏辩华 folds the shop bar (#138) |
| `d7c665db` | `e071de72` | the 瑙傛垬甯?capsule + host removes a spectator (PR #120) |
| `b4bc89ad` | `d8ce0214` | the top-bar capsule counts resolved = killed + leaked (PR #308) |
| `4bb0c11e` | `7f54f647` | a 璋冨害涓績 upgrade opens the new shop slot EMPTY (#332 / PR #333) |
| `f632e0b0` | `24c074bc` | `docs/design/client.md` names the new screen pieces |
| `1a880699` | `d0af4e5a` | a finished 鑱旈槻 / boss-pair field publishes its own resolved (our capsule-progress fix) |

*R22-GHSIM / R22-OSIM / R22-RENDER / R22-HUD / R22-FIELDS / R22-LATE / dober*

| Upstream | Ours | Rule |
|---|---|---|
| `3356b340` | `e8c7bb30` | 鈮? overlapping 鍚屽悕鏁堟灉鍙栨渶楂?resume strongest-first (#342 / PR #348) |
| `5a50f7b5` | `a898e5a0` | REA-Y銆屾敾鍑昏寖鍥村唴瀛樺湪N鍚嶁€︺€?applied by the engine (#293) |
| `a0cd6826` | `56e9de88` | 寮傚 S3 闆锋毚 covers the 13-tile diamond at the target's tile (#322 / PR #329) |
| `b2510524` | `b8f598ce` | 姝岃暰钂傚▍ S3's skill-end net pulls within 1 tile (tornado keeps 1.5) (#324 / PR #329) |
| `ca671f2f` | `7672a38f` | 澶у笣 鍔犳€ヨ皟搴?stacks without a cap (#328 / PR #329) |
| `bfef34ff` | `b3c561ba` | 鍋囨兂鏁岋細楠ㄥ埡 changes model with its 闅愬尶 (render) (#296 / PR #365) |
| `c250ff66` | `77c18a03` | 鍋囨兂鏁岋細楠ㄥ埡 targets as PRTS writes (sim) (#296 / PR #365) |
| `4bd154e3` | `2549d8af` | a 閫熷皠鎵?blocking a ground enemy shoots a flyer first (#220, owner) |
| `895653fc` | `4cb35fd5` | 甯濆浗鐐伀鍏堝厗鑰?shells hit the impact tile + 8 around (#364) |
| `38d4c3e4` | `85a2e8ae` | 楗德枫€愭枃鐏參鐐栥€?skips noStack bonds (owner) |
| `6d6fbe92` | `b27dc27b` | 浼婂唴涓?S3 restarts on a 绐佽 landing |
| `42caca3b` | `d583d719` | 寮曟槦妫樺埡 alchemy units restore HP as 鐢熷懡鍥炲閫熷害 |
| `977215e1` | `1fe6956d` | PRTS 涓嶅彲瀵圭┖ effects spare the flying 鐐庝綉 |
| `dd23572b` | `b2701903` | 鐞崇悈璇楁€€闆?s 棣欐鐐稿脊 never shows an HP bar |
| `1e78648a` | `f8ad9834` | closed eyes stay closed without the stencil masks (GitHub #177) |
| `6326dd4d` | `c1a56290` | a late-seen attack plays its whole clip (#246) |
| `8a64edc9` | `4781a863` | an enemy out its attack recovery is drawn standing (PR #381, supersedes #307/#314) |
| `8ae891f1` | *(n/a)* | HP-bar ammo cells: the sim/snapshot part is ours; the doc hunk was skipped 鈥?see skipped below |
| `030d0a29` | `fee27b1c` | a renderer that loses the 12 s race no longer mounts late (PR #302) |
| `3484178e` | `2be8fd90` | an early skill cue is held and sounds once (PR #292) |
| `bc11c0d6` | `58d56357` | cached-atlas refreshes take turns from the update order (#327 / PR #334) |
| `16df0bf4` | `ef5d6675` | every shop card draws its own slot's frost (#354) |
| `ffa538c3` | `0e277b34` | 璧ゅ垉鏄庨渼闄?S3's sword wave is drawn along its path (PR #382, owner item 12) |
| `a87cc1e9` | `96ae10db` | boss-field portals teleport (route-end 鈫?far exit 鈫?that side's door) (#336 / PR #337) |
| `f14b3a06` | `c8b2ee6a` | 鑰€楠戝＋涓村厜's 鍗¤タ绫冲皵 redeploy reduction floors at 0 (#370) |
| `8d896e40` | `67e40844` | the path tie-break never wades into more 娣辨按鍖?(#375) |
| `1205336a` | `ee95372e` | a route ending on a corner portal stays hidden 3 s (review of #337) |
| `48a2d37e` | `34365c87` | 绐佽 members jump to 闅愬尶 ground enemies (owner, GitHub #316) |
| `19c7b268` | `fcef8d87` | a 鐢诲嵎 copy that completes a merge copies the target's equipment |
| `1a67ecc3` | `3af24d3f` | 寮曟槦妫樺埡 S1: two alchemy units add their DEF on one ally |
| `7c56335c` | `4bff9b26` | 璋㈡媺鏍?s 鐩熺害瀵掗 blows a blizzard up the field (PR #386, owner) |
| `03688c82` | `dc1294ec` | 搴︾畻娴尝 breaks an HP-ratio tie by the latest deployment |
| `ac423184` | `eec49a10` | a 鐢诲嵎's copied items arrive unequipped |
| `2df1cf15` | `a41a2e76` | a watched teammate's bond popup counts their bench (#385 / PR #387) |
| `0ca2a9c2` | `45a8cc7f` | an open detail card draws its field unit's current attack range (#281) |
| `05eb2b80` | `eb98158d` | the Final Assault / Hidden Core pay a 鎴樻湳鐗硅 perfect-battle card (PR #353) |
| `66a228c6` | `f09499f1` | a boss field's perfect payout needs the client result to agree with its `b.progress` |

*R22-VOICES (the JP dub) and the UNBAL slide*

| Upstream | Ours | Rule |
|---|---|---|
| `cb8865d9` | `cb2e3ed9` | a tap on an operator says its 閫変腑骞插憳 line in every phase (owner) |
| `ddf8c39e` | `b398cc46` + `af981bd7` | **the Japanese voice dub** as a second tree beside the Chinese one (`audio.voiceJp`, 璁剧疆 鈫?璇煶璇█ 涓枃 / 鏃ユ湰瑾? CN fallback; full zip ships both) 鈥?our packaging (one switch, `FULL_ZIP_JP_VOICE`) differs from upstream's, so re-implemented |
| `bcee737f` | `af981bd7` | voices review fixes (a 閫変腑 tap no longer restarts the battle-voice gap; the second card says its 閫変腑 line; measured JP size) |
| `2669b6ab` | `20ae5ac2` + `5f78eb63` | a pushed / pulled enemy **slides** to where the sim put it; a dying flyer keeps its lift; a long Die clip plays whole (PR #380) |
| `7a33bc7e` | `453a4e81` | a unit killed on the step of its push lies where the sim put it (Grok review) |
| `cdf2bd5c` | `6e71870d` | the official **澶辫　 (UNBALANCE)**: no walking / normal attack for the push's 浣嶇Щ鏃堕棿 or the pull's window (idea PR #392, re-implemented from the sources) |
| `1db84d79` | `c59aab17` | 澶辫　 review fixes (pulled 闈欐€佸垰浣?held for the window, 寮у厜閿嬪崼 bleeds, no skill/blink/scripted move, route APPEAR / 閫愮伀 閲嶇敓 ends it) |
| `a0043d42` | `5616d9b7` | **Preserve enemy facing through push and pull slides** (#418, #427) 鈥?re-applied on the R22 slide stack |

*Adaptations, goldens and data (ours):* `9947a64a` (`portalPickup` uses our `Math.hypot`, no `detmath.js`),
`5fa3ae2d` (adapt the strongest-status overlap test + README suite count), `eeae4210` and `177bad63` (goldens),
`2cab8b6b` (**rebuild `data/enemies.json`** 鈥?a one-line drift left by the cache merge when 鍏嬭幈闂ㄨ帋 was added;
the offline rebuild reproduces `data/` byte-for-byte again).

**Ours on top of the statistics page (PR #323 鈥?not an upstream merge).** The local statistics page (`438a6b52` /
`e33a8838`, rows above) later grew a **server-backed** store: `shared/stats.js`, `server/stats.js` on a new
`match_stats` table (schema v5), the `stats.submit` / `list` / `clear` / `view` protocol, the per-owner sync and the
online-player `stats.view`. That layer is entirely ours (caps = 2脳 the mainline) and must survive a merge 鈥?see
`docs/MATCHMAKING.md` 搂40 and `docs/OUR-FEATURES.md` 搂8.

**Skipped 鈥?the explicit list (upstream hash + why):**

| Upstream | Why skipped (the files it would have touched) |
|---|---|
| `ffa538c3` | already ours 鈥?`SKIP-ALREADY` (Group A's `0e277b34` drew the sword qi) |
| `8a64edc9` | `EMPTY` 鈥?already applied under another commit |
| `2669b6ab` | our `render/units.js`, `test/render/unitview.test.js`, `test/sim/displace-fx.test.js` differ 鈥?ported by hand (`20ae5ac2`/`5f78eb63`) |
| `ddf8c39e` | `README.md`, `data/assets.json`, `docs/DEPLOY.md`, `tools/package.mjs` differ 鈥?re-implemented (`b398cc46`) |
| `f2aec39e` | our `server/sim/content/bosses.js` differs 鈥?the Hidden-Core 閾?change was not taken |
| `7e8b435f` | our `chess_char_4_01-rmixer.js` differs |
| `6326dd4d` | our `test/render/feedback2-enemy-attack-clip.test.js` differs |
| `8ae891f1` | our `interp.js` / `battle/events.js` / `op_hsgma2.test.js` differ 鈥?the HP-bar readout is ours |
| `030d0a29` / `bc11c0d6` | doc-only leftovers (`docs/design/client.md`); the code is ours |
| `bfef34ff` | our `render/units.js` differs 鈥?ported by hand (`b3c561ba`) |
| `5a045731` | 鏈?s `op-wang.js` / `op_wang.test.js` differ |
| `5f98baec` / `e733171b` | our `chess_char_3_04-swire2.js` (鐞崇悈璇楁€€闆? / `tokens.js` differ |
| `4128965a` / `db29acf9` | our `skills.js` differs (the #298 instant-skill cycle) |
| `bcee737f` | our `detailPanel.js` / `feedback7-voices.test.js` / `tools/package.mjs` differ 鈥?re-implemented (`af981bd7`) |
| `7a33bc7e` | our `render/units.js` differs 鈥?ported by hand (`453a4e81`) |
| `69d791f9` | our `skills.js` / `queries.js` differ (鐧介搧 閾侀挸鍙? |
| `2df1cf15` / `0ca2a9c2` | doc-only leftovers (`docs/PLAYING.md`); the code is ours |
| `a1bc37ed` | our `public/js/ui/gameLogic.js` differs (Enter during facing selection) |
| `cdf2bd5c` / `1db84d79` | our `displacement.js` / render / goldens differ 鈥?ported by hand (`6e71870d`/`c59aab17`) |
| `b972c1fc` / `267a826b` / `917e8924` | our `screens/diy.js` and the loadout e2e tests differ |
| `56a7b918` / `e6321457` / `1ab12763` | **excluded by the owner** (鏁欑粌 personal choice; the bots' zero-range heavy-guard placement; their docs) |

**R22-LOADOUT (excluded, 搂0).** `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`,
`8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` 鈥?the per-operator 娼滆兘 / 缁冨害 loadout screen; the
owner excluded it, so it was never applied.

**Local commits produced:** the ~50 cherry-picks listed above plus the goldens/adaptations/data commits, ending
`177bad63`, then the slide + UNBAL stack `20ae5ac2`鈫抈c59aab17` and `b3c561ba`/`b398cc46`/`af981bd7`/`2cab8b6b`.

---

## 5. Group A 鈥?the post-0.3.0 upstream combat fixes (2026-10-09/10)

**What it was.** A small upstream stream on top of our pre-Group-A tip `a4e11922`
(tag `backup-pre-groupA`). Upstream HEAD ~ the tip of this stream. The commits are authored `sganggs` and were
applied **linearly** (no merge commit), then adapted.

**Taken (upstream = local hash here; they were applied as-is):**

| Commit | Rule |
|---|---|
| `a181b462` | 淇璧ゅ垉鏄庨渼闄堜笁鎶€鑳藉绌鸿嚜鍔ㄥ紑鍚苟鏍稿疄绀惧尯鍙嶉 (chen3 S3 air + community combat) |
| `09d74ee3` | charged guardian heals act without enemies; mixed S2 triggers fixed (#406) |
| `bffd06c9` | source-owned Lemuen (钑剧吉瀹? detection and wanted-skill triggers (#428) |
| `a0043d42` | preserve enemy facing through push and pull slides (#418, #427) |
| `5f9e0d51` | count Fartooth (杩滅墮) granted layers on doll swaps (#415, #429) |
| `fe2d1bff` | correct community-reported combat and strategy draft behaviour |
| `2e793db3` | clipboard fallback selection inside dialogs (#433) |
| `ddea1542` | report missing asset leaves + opt-in strict mode (#421) |
| `42fe3279` | Korean wording + default contribution template (#414, #432) |
| `e6f72273` | clean up browser test pipes; scope deliberate outage errors |

**Our adaptations (authored `merge`):** `a36b475e` (restore the rear-player 钑剧吉瀹?S3 lock/ammo regression onto
our test file), `6bdd0800` (**golden: regenerate for Group A gameplay** 鈥?chen3 S3 air, guardian heals, Lemuen
wanted, doll-swap layers, community combat/draft), `ce11e4fc` (adapt the Group A regressions to our fork).

**Conflicts.** Where upstream's test/doc files differ from ours (the Lemuen regression, the combat/draft tests,
the docs), the upstream behaviour was kept and the fork's files adapted. Golden re-baselined once on the combined
corpus.

**Note.** The facing fix (`a0043d42`) appears twice in the graph: as the Group A cherry-pick and again as
`5616d9b7` on the R22 slide stack (the R22 RENDER/UNBAL work re-applied it on top of the slide). Both are in
`ours`.

---

## 6. Group C 鈥?the R23 stream (2026-10-10)

**What it was.** The final upstream feedback7 additions after v0.2.2, the **R23** stream (plus our adaptations).
Built on the `groupc` branch, rebased to `groupc-rb` = `ours` HEAD.

**Taken (upstream, authored `sganggs`; the same commits appear on `groupc` as `8cbf0ee4` / `de121460` /
`bfbe07e9` / `b4adce31`):**

| Commit (`ours`) | Rule |
|---|---|
| `ddaef46f` R23-TOAST | 鎷熸€佺墿璐?/ 绠€鏄撻€氳鏈?/ 瀵诲懠妯″潡 that grant nothing say why (`{who}锛氬崱姹犱腑宸叉病鏈墈name}` / `{who}锛氭病鏈夊彲鑾峰緱鐨勫悓鐩熺害骞插憳`); the item is still destroyed; en / ja / ko / zh-TW; golden unchanged (GitHub #401, owner OK) |
| `10a7f68d` R23-TICK | an attack interval or a time-SP cost of a whole number of frames takes exactly that many 鈥?1 s = 30 frames, not 31 (PR #402); **golden: every family moves** |
| `4dde652e` R23-TICK | the docs for the whole-frame rule: `docs/SIM.md` 搂2 / 搂7.1, `docs/design/geometry-time.md` 搂4, 搂27.61 in the DESIGN index + the intro area map |
| `d366dcc0` R23-DRAGSNAP | a dragged operator stands on the tile under the pointer while it is a legal target (`render/drag.js` `dragStandTile`), held under the pointer elsewhere; pick / highlight / tileHover / wheel / drop stay the pointer's tile (the owner's 2026-10-09 recording; report in PR #403, not merged); golden unchanged |

**Our adaptations (authored `merge`):** `cd4887ed` (adapt the 椤舵爮鑳跺泭 resolved test to our
`teammateProgress`), `8d20f50f` (regenerate the golden corpus for the applied R23 source, rebased onto `ours`),
`f26a4837` (adapt the doc / data tests to our fork and **regenerate the stale `data/enemies.json`** 鈥?the one-line
drift is now gone and `node tools/build-data.mjs --offline` reproduces `data/` byte-for-byte).

**Golden.** Every family moved with R23-TICK (commit `10a7f68d`), then was regenerated in `8d20f50f`; compare
`roster 49`, `bonds 46`, `fields 22`, `matches 18`, `standins 10`, `diy 138`.

**Verification.** The isolated-worktree full suite at HEAD `f26a4837`: **5806 tests / 5795 pass / 0 fail /
11 skipped** (see the report in `docs/PROJECT-STATE.md` 搂9).

**Deliberate divergence.** The 璁剧疆 鈫?**闂鍙嶉 / DIAGNOSTICS** section that upstream's `3f884412` added (our R22 port
`2ef6339b`, 搂4 above) was **deliberately dropped**: it duplicates our own bug-report entry point (the 璁剧疆 dialog's
銆宐ug鎻愪氦銆?since 2026-10-11, before that the lobby's), so `public/js/ui/settings.js` no longer carries the section, its
銆屽鍒惰瘖鏂俊鎭€?button, its recorded-errors row or its `ISSUES_URL`, and the `set-diag*` CSS hooks are gone.
`public/js/diag.js` itself stays 鈥?`main.js`, `ui/toasts.js` and `battle/runner.js` still record into its error log.
**Both it and the upstream 璁剧疆-button placement are on the 姘镐笉鍚堝苟 list (搂0).**

**Divergence (2026-10-11) 鈥?the 璁剧疆 button's position.** Upstream `911e4bff` put the 璁剧疆 button left of 鐜╂硶璇存槑 in the
lobby / room top bar; we keep 璁剧疆 in the top bar's right-hand group instead 鈥?in the lobby immediately before the 妗ｆ
account chip (right of 鐧诲綍 / 娉ㄥ唽), in the room beside the invite key 鈥?so the merge must not restore upstream's middle
placement (搂0). Lobby right group, left鈫抮ight: 缁熻 路 骞插憳璋冮厤 路 鐧诲綍 / 娉ㄥ唽 (guests only) 路 璁剧疆 路 妗ｆ chip.

**Divergence (2026-10-12) — 玩法说明 / 资料库 are NOT in the 设置 dialog; bug提交 still is.** The lobby's top bar keeps 公开房间 · 更新日志
(and the room keeps its other controls). The 设置 dialog's action row now carries only the player **bug提交** entry beside 完成:
`public/js/ui/settings.js` `set-bug` → `openBugReport` (the `ui/community.js` `BugReportHost`, mounted once by `main.js`,
`css .bug-host` above `--z-modal`, opens above the modal and still submits through `bug.report` + the image upload). The
2026-10-11 玩法说明 (`set-guide`) and 资料库 (`set-codex`) actions were **removed on 2026-10-12**: the codex has its own
lobby top-bar entry (`codex-entry`) and the guide stays reachable in-match (the gear / step-head `GuideButton`,
`ui/matchChrome.js`). A later merge must not move the bug提交 entry back onto a top bar nor drop it, and must not
re-introduce the removed 玩法说明 / 资料库 settings actions. (The in-match gear / step-head 玩法说明 buttons stay as they are.)
The **title screen's** own 玩法说明 button (`.title-guide`, in the callsign console's 已连接服务器 · ping row, next to the
settings gear) was **removed** earlier — the title reaches the guide through the in-match triggers now, and the connection
row carries only the status dot / text / ping · 设置 · 全屏.

**Divergence (2026-10-11) 鈥?a 鏈眬绂佺敤 bond is banned from being OFFERED, not from taking effect.** Upstream's
`computeBonds` skips `gd.modeInactiveBonds` (`01a44cd2`; the 鏈眬绂佺敤 UI `b4fa21a0` / `695ece26` / `c0cc1d61`, all
carried unchanged by our merges) so a bond the mode never offers could never activate 鈥?and upstream's `battleBonds`
(the 0.1.3 搂27 fix) even handed such a bond to the battle as an INACTIVE entry. The owner's decision of 2026-10-11
(銆岃 ban 鐨勭洘绾﹀嵆浣胯婵€娲讳篃鏃犳硶鐢熸晥銆?: **the ban only governs the offer** (the pool, the strategy draft, the bots);
`computeBonds` now counts every bond, so a banned bond whose members reach its threshold is `active` and its effect
applies, while one below its threshold stays inert (its layers still ride into the battle, 搂27). `bondList` still marks
an inactive one `off: true` (grey 鏈眬绂佺敤 disc) and the dialog says 鏈眬绂佺敤 until it is activated. Blacklisted in
搂0; self-check: no `modeInactiveBonds.has(id)) continue` in `computeBonds`, and `battleBonds` forces no `active: false`.

---

## 7. Pending: the displacement-slide + 澶辫　 port (`port-r22-slide`)

The branch **`port-r22-slide`** (worktree `D:\DOTK\_merge-wt`) was created to hold the R22 **push/pull slide +
澶辫　 (UNBALANCE)** port while it was resolved by hand (the upstream commits `2669b6ab` (slide), `7a33bc7e`
(dying-view anchor), `cdf2bd5c` (UNBAL) and `1db84d79` (UNBAL review) all `SKIP` in the batch 鈥?see 搂4).

**Status at HEAD `f26a4837`:** the branch is an **ancestor of `ours`** 鈥?`git rev-list --count
port-r22-slide..ours` = 40 and `git log ours..port-r22-slide` is empty. Its tip `b3c561ba` and the whole slide +
澶辫　 stack (`20ae5ac2` 鈫?`5f78eb63` 鈫?`453a4e81` 鈫?`6e71870d` 鈫?`c59aab17` 鈫?`5616d9b7`) are **already integrated**
in `ours`, so **nothing remains to merge from it**. Do not delete or touch it (per the owner); it is kept as the
staging branch of record for that port.

> If a future instruction says the slide/UNBAL port is still pending, re-check this: at `f26a4837` it is in.
> The branch's own tree is 40 commits behind and is **not** a source of truth.

---

## 8. 0.2.3 PWA install icons + manifest (mint rook) 鈥?the 娣诲姞鍒版闈?button's missing half (2026-10-11)

**Why.** Our title screen's 娣诲姞鍒版闈?install button (`public/js/ui/install.js`) was a graceful no-op because our
tree shipped no `public/manifest.json` and no icons, so no browser fired `beforeinstallprompt`. The 0.2.3 install-icon
work had never been merged (it rode in the skipped 0.2.3 batch).

**What came in** (taken verbatim 鈥?`git checkout upstreamm/master -- public/manifest.json public/icons`, verified
byte-identical blob hashes):

| Path | Notes |
|---|---|
| `public/manifest.json` | `name 鍗垗鍗忚锛氱洘绾 / `short_name 鍗垗鍗忚` / `start_url`+`scope` `/` / `display fullscreen` / `orientation landscape-primary`; `any` and `maskable` 192 + 512 PNG icons |
| `public/icons/app.svg` | the 512-square mint-rook master (owner's pick, refines the 0.2.x castle) |
| `public/icons/app-192.png` `app-512.png` | `purpose: any` |
| `public/icons/app-maskable-192.png` `app-maskable-512.png` | `purpose: maskable` (mark inside the W3C safe circle; `tools/export-app-icons.py` `MASK_SCALE = 0.875`) |
| `public/icons/favicon-16/32/48.png` `favicon.ico` `apple-touch-icon.png` | favicon + Apple touch (the ICO keeps its transparent 1-bit mask) |

Upstream commits: `90421254` *閲嶇粯绯诲垪閫氱敤瀹夎鍥炬爣鈥anifest sizes, maskable and favicons re-exported* and `9ec84f36`
*the install icon keeps the 0.2.x mint rook (the owner's choice)鈥?. Their tooling (`tools/export-app-icons.py`,
the PWA section of `tools/assets/manifest.mjs`) is **not** needed here 鈥?the binaries are committed 鈥?so only the
assets were taken. `public/index.html` now links the manifest and the icon set (replacing our inline data-URI
favicon).

**No service worker (deliberate).** Upstream ships none 鈥?its `public/js/pwa.js` states it explicitly 鈥?and Chrome
108 (Android) / 112 (desktop) dropped the fetch-handler requirement, so `beforeinstallprompt` fires without a worker
in current Chromium. We deliberately do **not** add one: a worker here would only risk re-introducing the
stale-`index.html` class of bug (the stats.css lesson) and cost a startup per navigation, for a game already served
over the LAN with an explicit `?v=`/ETag cache. Upstream's `public/js/pwa.js` is **not** merged (we already have
`public/js/ui/install.js`), so no `sw.js` / `service-worker.js` is shipped. (Chromium on iOS and Firefox never fire
the event; iOS gets the manual hint, Firefox silently hides the button.)

**Stale-`index.html` guard.** `public/js/ui/ensureManifest.js` re-links `/manifest.json` at boot (its boot call is in
`public/js/main.js`), like `ui/ensureStylesheet.js`, so a served `index.html` that predates this merge cannot keep the
button hidden. The source of truth is still the `<link>` in `public/index.html`.

**Guards.** New `test/ui/pwa-assets.test.js` (the manifest is installable, every named icon exists, decodes to its
declared size, is opaque with a real mark, and the maskable ones stay inside the safe circle; the favicon / Apple tags
resolve to real files of the declared size). `test/ui/ensure-manifest.test.js` covers the re-link; the updated
`test/ui/title-surfaces.test.js` asserts the manifest + icons are present and linked with no service worker.

---

## 9. 0.2.5 official battlefield scenes on the 3D board (2026-10-12)

**Extraction on this machine (2026-10-12).** The owner's standing rule is the local client first: the **CN** Bilibili
client (`D:\...\Arknights_Data\StreamingAssets\AB\Windows`) has the autochess bundles but is **off-season** (no
`scenes/activities/act1autochess`), so the scene bundles came from the CDN (`fetch_scenes.py`) while the materials /
textures still came from the client. `node tools/setup.mjs --scenes` alone finds no client here (the owner's install
sits under a custom path, `D:\<local network games>\...`), so the run was
`node tools/setup.mjs --scenes --game "<CN AB root>"`. Result: **33/33 bundles**, **11/11 stages**.
`public/assets/local/scene/` = **92 files, 64,423,310 bytes** (`scene/<stageId>/{scene.json,scene.bin,lm<i>.png,lm<i>.webp}`
for the 11 stages; `scene/tex/` = 30 files); `.cache/official-scenes/26-04-13-12-31-42_e9b560/` = the 33 bundles
(**29,714,076 bytes** on disk; the list's 22,801,308 is the CDN-compressed size). Stages: `act1autochess_m01`-`m07`
and `act2autochess_m01`-`m04`. Backup at
`C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip` (**67,603,003 bytes**; `scene\` +
`official-scenes\`) - restore in runbook (d) below. `data/local-assets.json` now lists all 12 `scene/...` groups
(`sceneListed` needs group `scene/<stageId>` with a `scene` and a `bin` entry); the files stay git-ignored
(`git ls-files` shows 0).

**Why.** Upstream 0.2.5 renders the official battlefield scene on the 3D board (PR #532 / #533 by @andrew05060414),
falling back to our procedural metal board when a scene is absent. Our fork already had the 3D board
(`public/js/render/board3d/`), so this is an additive client feature plus a local extraction tool step.

**What came in** (each `cherry-pick -x`, adapted; author and subject preserved; the local commits carry the upstream
hash in their `(cherry picked from commit 鈥?` trailer):

| Upstream | Status | What it is |
|---|---|---|
| `d482fbb8` | taken (`-x`) | the full ported feature: `load.js` `loadScenePack` / `parseSceneChunks` / `sceneGroupRects` / `sceneListed` / `sceneGroup`; `materials.js` `sceneMaterial` / `sceneWaterMaterial` / `sceneBlend` / `SCENE_LIGHT`; `scene.js` `setScenePack` / `_sceneResources` / `_disposeScene` / `_buildScene` / `sceneGroupVisible`; `app.js` `useOfficialScene`; the extractor `tools/local-extract/{scenes.py,fetch_scenes.py}` + `extract.py --only scene`; `tools/setup.mjs --scenes`; `tools/package.mjs` full-zip scenes; `tools/doctor.mjs`; `test/render/board3d-scene.test.js`, `test/scene-assets.test.js` |
| `3bb7fef7` | taken (`-x`) | `load.js` `mergeSceneChunks` / `sceneMaterialKey` and the `scene.js _buildScene` bucketing (chunks sharing a material / lightmap page become one mesh 鈥?draw calls back in budget), plus the boss-round real-server test reading the actual seat pairing (`test/ui/playtest2.real.e2e.test.js`) |
| `1fe81947` | **subsumed 鈥?no separate commit** | the raw #532 PR by @andrew05060414. Its whole content is contained in `d482fbb8` (the ported #533): `git diff 1fe81947 d482fbb8 -- public/js/render/board3d/ public/js/render/app.js tools/local-extract/` shows only refinements on `d482fbb8`'s side (a `load.js` reformat, the `c.lightmap >= 0` guard, the `sceneWater` array, the DXT5nm normal-map comment) and `app.js` is identical 鈥?so taking `d482fbb8` carries it. |

**Adapted to this fork** (ours wins where they differ):

- `load.js`: kept our `resetBoardPack()` (our fork never had the `threeFailures` retry state) and added
  `sceneCache.clear()`; the scene loader is otherwise upstream's.
- `scene.js` / `materials.js`: kept our `environmentMap` PMREM `__rt` disposal (`envRT`, which upstream lacks) 鈥?  the merged files carry both the scene code and our `envRT` handling.
- `CHANGELOG.md`: our 0.4.0 section kept; one scene bullet added under 鏂板姛鑳? Upstream's `docs/history/0.2.5.md`
  is **not** imported (kept deleted 鈥?our fork does not carry upstream's 0.2.3鈥?.2.5 history docs).
- `docs/DESIGN.md`, `docs/DEPLOY.md`, `docs/ASSETS.md`, `docs/design/client.md`, `tools/package.mjs`, `tools/setup.mjs`:
  resolved to our docs and our JP-voice `held` logic, plus the scene row / paragraphs / `SCENE_ART_PREFIX` /
  `scenes` plan field. The stale `搂30.17` citation in `docs/design/client.md` (our DESIGN stops at 搂29) was
  repointed at `docs/ASSETS.md`.
- `test/scene-assets.test.js`: fixed the Windows path (`fileURLToPath`; upstream used `new URL(...).pathname`, which
  yields `D:\D:\鈥) and asserted our `.gitignore` invariant (`public/assets/local/scene/` ignored, since this fork
  otherwise tracks `public/assets/**`).
- `test/ui/playtest2.real.e2e.test.js`: upstream's fix reads `m.public.bossPairs`; our server publishes none, so
  `assignedBossSide` recomputes the pair from the alive players in seat order (the rule `prepCamera` already uses).
  Opt-in real-server E2E only.

**Nothing official is committed.** The bundles and the extracted files stay out of the tree: `.gitignore` now lists
`public/assets/local/scene/` explicitly (this fork otherwise tracks `public/assets/**`) and `.cache/` already covers
`.cache/official-scenes/`. `tools/package.mjs` ships the extracted scenes in the **full** zip when the packaging
machine extracted them (`SCENE_ART_PREFIX`; the `battlefield scenes` summary line) and never in the lite zip.
`node tools/setup.mjs --scenes` fetches (`fetch_scenes.py`: 33 bundles, 22,801,308 bytes compressed on the Android
list, md5-checked) and extracts (`extract.py --only scene`) on the machine. The client falls back to the metal board
whenever `data/local-assets.json` lists no `scene/<stageId>` 鈥?or a load fails, or `version` is unknown.

**Where they live / size.** Extracted: `public/assets/local/scene/<stageId>/{scene.json,scene.bin,lm<i>}` and
`public/assets/local/scene/tex/<texture>`; downloaded bundles: `.cache/official-scenes/<version>/`. In this
environment **no scenes are extracted** (`data/local-assets.json` lists no `scene/鈥; `.cache/official-scenes/` is
absent), so nothing was cached or backed up here 鈥?run the two steps above on a machine with the client / network to
get them. Because they are git-ignored, a `git revert` / `reset --hard` does not delete them; still copy them aside
before a re-clone or `git clean -x` (runbook below).

**Golden: unchanged.** The scenes are render-only 鈥?the 3D board is a client view over the same sim 鈥?so `test/golden/*`
is byte-identical (both `-x` messages say "golden: unchanged"; `node tools/golden.mjs` reports no movement).

**Restore point (the backup).** Annotated tag **`backup/pre-3d-scenes`** on commit
**`fc06debda36da1f7c735ed10be04d9ddf7625bdd`** (the pre-merge `ours` HEAD), pushed to GitHub and Gitee (remote tag object
`3d5a475afac546895812b4f220faa109254ec8f4`). A standalone bundle of the tag + `refs/heads/ours` is at
`C:\Users\31273\AppData\Local\Temp\opencode\sp-backup-pre-3d-scenes.bundle` (582,104,649 bytes, `git bundle verify`
okay).

### Runbook 鈥?revert the 3D scenes at any time

PowerShell, copy-paste. `$SP = D:\DOTK\Stronghold-Protocol`, `$STORE = D:\DOTK\_merge-scratch`.

**(a) Revert only the 3D-scene change (preferred 鈥?keeps the other concurrent merges).** Revert the two `-x`
commits; git adds a revert commit each, history stays linear and the other agents' work is untouched.

```powershell
$STORE = 'D:\DOTK\_merge-scratch'
git -C $STORE fetch gitee
git -C $STORE checkout ours
git -C $STORE pull --ff-only gitee master                      # the latest ours
$scene1 = git -C $STORE log --format=%H --grep 'cherry picked from commit d482fbb8' -1
$scene2 = git -C $STORE log --format=%H --grep 'cherry picked from commit 3bb7fef7' -1
git -C $STORE revert --no-edit $scene2 $scene1                 # newest first
# a conflict here just means later work touched the same files 鈥?resolve keeping the later work
```

**(b) Reset to the tag and re-apply the later work** (heavier; only if (a) conflicts badly). Keep the current tip so
nothing is lost, reset to the restore point, then re-apply the batches merged after it.

```powershell
$STORE = 'D:\DOTK\_merge-scratch'
git -C $STORE branch backup/ours-before-scenes-revert-$(Get-Date -Format yyyyMMddHHmm) ours
git -C $STORE reset --hard backup/pre-3d-scenes
git -C $STORE log --oneline --first-parent backup/ours-before-scenes-revert-* ^backup/pre-3d-scenes
# cherry-pick / merge the listed commits back, then publish with (c).
```

**(c) Publish the revert to the remotes (GitHub primary + Gitee) and restore the dev tree.** The store is the source of truth; the one-way helper
pushes it and mirrors it into `Stronghold-Protocol` (it never copies the dev tree back).

```powershell
$env:GIT_USERNAME = 'marseille1'; $env:GIT_PASSWORD = '<token>'   # the Gitee PAT, never committed
node $SP\tools\push-gitee.mjs --dry-run                           # what would move
node $SP\tools\push-gitee.mjs                                     # push HEAD:refs/heads/master + mirror
```

**(d) Keep / restore the extracted scenes without re-extracting.** They are git-ignored, so a revert or `reset --hard`
leaves them in place. If they are removed, restore a copy or re-extract:

```powershell
robocopy $SP\public\assets\local\scene C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup /E
robocopy C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup $SP\public\assets\local\scene /E
# or from scratch (needs the client / network):
Set-Location $SP; python tools\local-extract\fetch_scenes.py; python tools\local-extract\extract.py --only scene
```

**Backup taken 2026-10-12** (the extracted scenes + the downloaded bundles):
`C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip` (67,603,003 bytes) packs `scene\` (the 92
files) and `official-scenes\` (the 33 bundles). Unpack it and copy each part back over the tree:

```powershell
Expand-Archive C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip -DestinationPath $env:TEMP\sp-scenes-restore -Force
robocopy $env:TEMP\sp-scenes-restore\scene $SP\public\assets\local\scene /E
robocopy $env:TEMP\sp-scenes-restore\official-scenes $SP\.cache\official-scenes /E
```

**(e) Last resort 鈥?restore the whole pre-merge tree from the bundle** (offline, no Gitee):

```powershell
git clone C:\Users\31273\AppData\Local\Temp\opencode\sp-backup-pre-3d-scenes.bundle D:\DOTK\_restore-pre-scenes -b ours
# then compare / cherry-pick back whatever work is needed.
```

---

## 10. 0.2.5 鈥?the 椹鏈笀 funnel/drone hit fixes (upstream `e0f37718` / `a451ddcf`, ported) (2026-10-12)

**What it was.** The 0.2.5-dev funnel/drone commit and its review fix, cherry-picked and adapted where our tree
differs. The hit-tile rounding (#520) and the #523 澶栧嫟鍖荤枟 initial aggro were **already in `ours`** from the
concurrent low-risk batch, so this batch does not carry them (see the coordination note below).

| Upstream | Rule | Ours |
|---|---|---|
| `e0f37718` (PRs #537/#536/#535/#520/#518) | the 椹鏈笀 unreleased drones are ADDITIONS beside the caster's own hit (`funnelMul`/`funnelBodyHits`, `ai.js resolveHit`); a redeploy resets the drone ramp and the per-target map (`professions.js installFunnel`); 娲涙礇 S2 releases its drone into an independent skill tick that keeps the lock until a kill or the skill ends; bots softly avoid a living teammate's opening factions until that teammate is eliminated (PR #518) | taken: `ai.js`, `professions.js`, the funnel kits, `server/match/bot.js`. Dropped: `op-gdglow.js` (we keep `chess_char_377_gdglow-gdglow.js`), the 0.2.5 history/CHANGELOG docs, the #475 tests (ours never had them), and the PR #520 hit-tile part (`ours` already has it 鈥?see below) |
| `a451ddcf` (review fix) | attached drones (`funnelBodyHits !== 0`) keep the own hit for a skill that only buffs/retargets the attack; only a drone-only skill (`funnelBodyHits: 0`) skips it (鑰舵媺 S2 both forms, 鑽掕姕鎷夋櫘鍏板痉 S1) | taken (鑰舵媺's two forms use the shared `kjeraRelease`; 鑽掕姕鎷夋櫘鍏板痉 S2 is the drone-only case) |
| `f1ea116f` | golden matches recomputed on the merged tree | subsumed by our golden regeneration (below) |
| `37e0fffb` (#523) | the 澶栧嫟鍖荤枟 reserve medic takes the initial aggro order before the ordinary battle-start deployment | **not taken here 鈥?already in `ours`** via the low-risk batch (commit `3a91fb32`); the instruction was to take it only if the other agent had not, and the two branches raced |

**PR #520 (hit tiles) and PR #518 (bot).** The hit-tile round-half-to-even + `FIELD_EDGE_INSET` landed in `ours` from
the low-risk batch (`8994d163`, `roundHalfEven` defined and exported in `body.js`). This batch's own port (a minimal
`server/sim/detmath.js`) was dropped on the rebase 鈥?one implementation stays. The PR #518 bot change **is** taken
here: `ours` had only the crude hard-exclude (`4e904de3`, IceCodeNew's original PR commit, reserve 鈫?weight 0); the
ported `e0f37718` version makes it a **soft** reserve (`SOFT_BAND_RESERVE` = 0.25, the reservation lifts when the
teammate is eliminated), which supersedes it.

**Our funnel rules kept (deliberate divergence from upstream).** Upstream's 婢勯棯 (`op-gdglow.js`) is a fully custom
`dealDamage` drone model. Ours (`chess_char_377_gdglow-gdglow.js`, 搂31 / OUR-FEATURES 搂35.2) rides the shared
`funnel` profession: `attack.hits` is the drone count and every drone locks the ONE target (`funnelTarget` /
`funnelScale`), each at the full ramp-scaled ATK 鈥?the fix only adds the caster's own hit beside them. The own hit
stays on the normal attack and S1/S2; S3 婢勫噣闂€€ 鍋滄鏀诲嚮, so its spec sets `funnelBodyHits: 0` (drone-only, the ramp
inside the hits; `attack.hits` = 3 for +2 drones). `docs/SIM.md` (the `funnel` row) and `docs/design/engine.md`
carry this fork adaptation. `public/js/render/fx/official.js` is regenerated (the ported 娲涙礇 S2/`drone` fx made
`char_4040_rockr`'s table entry stale; generated file, `tools/build-fx-official.mjs`).

**Golden.** Attribution first: reverting only the non-golden source of the source commit and re-running `node
tools/golden.mjs --update` reproduces the pre-merge golden byte-for-byte (an empty `git diff 3f38337f -- test/golden`).
Moved: **roster 17 / bonds 14 / fields 2 / matches 15** (standins and diy unchanged 鈥?they field stand-in kits and
owned 6鈽?DIY picks, not the funnel's shop chess). The funnel/#518 changes moved the 琛ヤ綅 scenario's whole trajectory,
so `tools/golden.mjs` re-chooses its not-owned set (pieces with a 琛ヤ綅 prototype) to keep `test/golden-standins.test.js`
meaningful. Local commits: `cc35f164` (source) 鈫?`2661d8d2` (golden) 鈫?`881a80c0` (docs), on `3f38337f`.

---
## 11. How to add the next batch to this log

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
