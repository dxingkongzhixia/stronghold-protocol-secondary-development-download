# Keel 模块 / 权限参考矩阵

> 代码基线：2026-11-02。**代码是唯一事实来源**：
> `shared/keel/manifest.js`（`KEEL_MODULE_KINDS` / `KEEL_PERMISSIONS`）、`shared/keel/contracts.js`（stable / experimental 扩展点）、
> `shared/keel/runtime.js`（API 与 hook 调度）、`server/keel/attach.js`（Battle → hook）、`server/match/match/`（match / policy 触发点）。
>
> 本页回答三个问题：**每种模块放在哪里、能声明哪些权限、实际被哪段运行时兑现**。
> 功能总览见 [`FEATURES.md`](FEATURES.md)，扩展点契约见 [`CONTRACTS.md`](CONTRACTS.md)，Worker / 委托边界见 [`RUNTIME.md`](RUNTIME.md)。

图例：

- ✅：当前代码已兑现；
- ◐：声明被接受，但只做兼容投影 / 部分兑现；
- —：声明存在，当前 Keel 路径没有运行时（不要依赖）。

## 1. 七种模块

| kind | 声明方式 | 运行位置 | trust | `api` 域 | 可用能力 | 备注 |
|---|---|---|---|---|---|---|
| `content` | `files` / `parts` / `provides` / `consumes` | content set 构建期；服务端与客户端数据 | `data` | `content` | `content.define` / `content.extend` / `content.patch` / `content.override` / `content.reference` / `content.dsl` / `content.offers` | 纯数据；不执行代码 |
| `asset` | `files` / `assets` | 安装期 / 视觉集 `/vs`、`/p` | `data` | `asset` | `asset.add` / `asset.override` / `asset.theme` | 立绘、Spine、音频、FX、主题、UI 资源 |
| `sim` | `entry`（ESM） | 浏览器模拟 Worker（`WorkerSimHost`） | `sandbox` | `sim` | `sim.read` / `sim.damage.write` / `sim.heal.write` / `sim.buff.write` / `sim.bond.read` / `sim.bond.write` / `sim.status.write` / `sim.spawn` / `sim.rng` / `sim.fx` / `sim.code` | SES；每 field 一个 Worker；`trust: native` 被拒绝 |
| `match` | `entry`（ESM） | 服务端 match host child（meta） | `sandbox` | `match` | `match.read` / `match.economy.write` / `match.rng` / `match.code` / `native.execute` | 只加载 `match` / `policy`，不会进页面 |
| `policy` | `entry`（ESM） | 服务端 match host child（meta） | `sandbox` | `policy` | `policy.observe` / `policy.act` | 默认 50ms 预算 |
| `ui` | `entry`（HTML）+ `slots` | 客户端沙箱 frame | `sandbox` | `ui` | `ui.frame` / `ui.theme` / `ui.native` | `slots` 只能是 `hud.right` / `result.tab` / `stats.tab` / `room.panel` |
| `lang` | `entry` 或 `files`（JSON） | 加载期语言包 / 文本覆盖 | `data` | `lang` | 无 | 只做 i18n，不跑代码 |

`trust` 规则：`data` 不能带 `sim` / `match` / `policy`（否则 `KEEL_TRUST_CODE`）；`native` 在 Keel 房间会被 `server/keel/room-source.js` 拒绝（`PLUGIN_KEEL_NATIVE`），仍只属于旧的 trusted 链路。

## 2. 按模块

### 2.1 `content`

`files` 里的 JSON 可以是记录数组 `{ file, id, value }`，也可以是 `{ "<id>": <value> }` 表；`parts` 给每个文件标角色：

```json
{
  "kind": "content",
  "files": ["content/enemies.json", "content/bonds.json"],
  "parts": { "data": ["content/enemies.json"] },
  "permissions": ["content.define", "content.patch"],
  "provides": ["enemy:enemy_x_demo", "bond:bond_x_demo"]
}
```

当前 content 读取的表（`server/keel/content.js`）：

| 表 | 备注 |
|---|---|
| `enemies` / `enemy` | 敌人记录 |
| `operators` / `operator` | 干员记录，展开为 normal / elite / DIY |
| `stages` / `stage` | 关卡 |
| `modes` / `mode` | 模式 |
| `waves` / `wave` | 波次 |
| `bosses` / `boss` | Boss |
| `tokens` / `token` | 召唤物 / 装置 |
| `bands` / `band` | 策略 |
| `bonds` / `bond` | 盟约 |
| `items` / `item` | 装备 |

能力含义：

| 能力 | 含义 | 当前状态 |
|---|---|---|
| `content.define` | 新增记录 | ✅ |
| `content.extend` | 追加/合并已有记录（与 patch 共用读取路径） | ✅ |
| `content.patch` | 按字段路径修改已有记录 | ✅ |
| `content.override` | 整体替换记录 | ✅（构建期，需审计） |
| `content.reference` | 引用已有记录（旧 `data.add` 投影） | ◐ |
| `content.dsl` | 注册 DSL kit / 准备期效果 | ✅ |
| `content.offers` | 注册 offers | ✅ |

> **C2 对齐**：`content.extend` 已在 `KEEL_PERMISSIONS` 中，manifest 3 可以声明；它投影到 v2 `data.patch`，
> 与 `content.patch` 共用同一条构建期 patch / merge 读取路径。记录文件里用 `patch: 1` 的 ops 表达追加 / 合并 / set。

### 2.2 `asset`

`assets` 是与 `data/assets.json` 同形状的 overlay，`files` 列出实际文件。可写的容器：

```text
chars[charId] / enemies[key] / tokens[id] / bonds / items / bands / skills / modules / ui
prof.icon / large / battlecard / sub
audio.bgm / bossBgm / voice / voiceJp / voiceEn / voiceKr / voiceNative / sfx
```

`asset.add` 新增、`asset.override` 替换官方条目；`asset.theme` 只投影到旧 `theme` 权限，当前 Keel 路径没有独立主题运行时（◐）。文件通过 `/p/<id>/<hash>/...` 提供，组合成视觉集 `/vs/<vs16>/overlay.json`。

### 2.3 `sim`

`entry` 是一个 ESM 文件，`export default { setup, hooks }`。它在模拟 Worker 里由 SES 编译执行；页面只收到 `b.snap` / `b.ev`。

```js
export default {
  setup({ api, state, manifest, host }) {
    api.state.patch({ ticks: 0 });
  },
  hooks: {
    'sim.tick'({ dt }, api) {
      api.state.patch({ ticks: api.state.get().ticks + 1 });
    },
  },
};
```

Hook 表（`server/keel/attach.js` + `shared/keel/contracts.js`）：

| Hook | 触发 | ctx / 可写 | 能力 | 稳定性 |
|---|---|---|---|---|
| `sim.setup` | `runtime.start()` 内，模块 `setup()` 之后 | `{}`；通过 `api` 写 | `sim.read` | stable |
| `sim.battleStart` | Battle `battleStart` | `{}`；初始单位 / 装置 | `sim.spawn` | stable |
| `sim.deploy` | 部署 / 再部署 / 移动 | `{ unit, initial, move }` | `sim.buff.write` | stable |
| `sim.tick` | 每帧 | `{ dt }` | `sim.read` | stable |
| `sim.beforeAttack` | 攻击前 | `{ attacker, targets, isSkill, profile }`；可替换 `targets` | `sim.read` | stable |
| `sim.hit` | 伤害结算前 | `{ source, target, dmg }`；可写 `dmg.amount/type/mul/tags/cancel/isSkill/isAttack/sourceless` | `sim.damage.write` | stable |
| `sim.damaged` | 实际伤害后 | `{ source, target, amount, type, dmg, credit }`；只能把 `amount` 调低 | `sim.damage.write` | stable |
| `sim.heal` | 治疗 | `{ source, target, amount, opts }`；可改 `amount` | `sim.heal.write` | stable |
| `sim.kill` | 击杀 | `{ killer, victim }` | `sim.damage.write` | stable |
| `sim.battleEnd` | 战斗结束 | `{ result }` | `sim.read` | stable |
| `sim.death` | 单位死亡 | `{ unit, reason, killer, dying, revivedBy }` | 无稳定能力映射 | experimental |
| `sim.enemySpawn` | 敌人出生 | `{ enemy }` | `sim.read` | experimental |
| `sim.enemyLeak` | 敌人漏过 | `{ enemy }` | `sim.read` | experimental |
| `sim.blocked` | 阻挡 | `{ blocker, enemy }` | `sim.read` | experimental |

`api` 表：

| API | 需要能力 | 作用 |
|---|---|---|
| `api.frame` / `api.id` / `api.capabilities` | — | 当前帧 / 模块 id / 已授权能力 |
| `api.units(query)` | `sim.read` | 只读单位视图 |
| `api.damage(spec)` / `api.heal(spec)` | `sim.damage.write` / `sim.heal.write` | 伤害 / 治疗 |
| `api.buffs.has/list` / `apply/remove` | `sim.read` / `sim.buff.write` | buff |
| `api.bonds.get/list` / `addLayers` | `sim.bond.read` / `sim.bond.write` | 盟约（受 `BOND_LAYER_CAP` / `layerGains`） |
| `api.status.apply/remove` | `sim.status.write` | 自定义状态 |
| `api.spawn(spec)` | `sim.spawn` | 召唤物 / token / 装置 |
| `api.rng(stream)` | `sim.rng` | 确定性随机流 |
| `api.fx(kind, at, data)` | `sim.fx` | 表现事件 |
| `api.state.get/set/patch` | — | JSON state |
| `api.setView(data)` | — | 发布只读视图（HUD / diag） |
| `api.command(command)` | `match.economy.write` | 命令日志（当前 sim 模块不能持有该能力；见 §8） |
| `api.finish(result)` | — | 结束比赛（meta 用） |
| `api.log(level, message, data)` | — | 诊断日志（最多 1000 条） |

`sim.code` 是 v2 script 的标记；原生 manifest 3 的 `sim` 模块**不要求**它，能力列表才决定 API。`native.execute` 只有 `trust: native` 才能声明，而 Keel 房间拒绝 native。

### 2.4 `match`

`entry` 是 ESM；只由 match host child 以 `code: 'meta'` 加载（`server/match/host/entry.js`），不会进页面。当前实际派发的 hook：

| Hook | ctx | 备注 |
|---|---|---|
| `match.onMatchStart` | `{ round: 0 }` | 比赛开始 |
| `match.onRoundStart` | `{ round }` | 回合开始 |
| `match.onRoundEnd` | `{ round, result: { kills, leaks } }` | 回合结束 |
| `match.checkEnd` | `{ round }` | 可 `api.finish(...)` 结束比赛 |

能力：

- `match.read`：读比赛视图（当前 host 是 `createFakeHost`，不是完整 Match 视图）；
- `match.economy.write`：`api.command(...)`，命令会记录进 command log，并通过 `Match.keelApplyCommand` 应用到 `PlayerState`（白名单见 §3）；
- `match.rng`：声明被接受，但当前没有 `api.rng` 的 match 版本（`api.rng` 要 `sim.rng`）；
- `match.code`：v2 meta 标记；
- `native.execute`：只有 `trust: native` 才能声明，Keel 路径不可用。

> **当前限制**：`Match` 创建 meta runtime 时用的是 `createFakeHost`，所以 `api.units` 看到的是 fake host，不是正在跑的战斗。
> `api.command` 已接到 `Match.keelApplyCommand`；未知命令会被拒绝（写进 command log 的 `result.error`，不改状态）。
> meta 模块也可以使用 `api.state`、`api.setView`、`api.finish`。

### 2.5 `policy`

`entry` 是 ESM；实际预算默认 **0.2 ms/hook、0.05 ms/frame、100 ms/match**（`shared/keel/budget.js`，不是 50 ms）。

| Hook | ctx | 当前状态 |
|---|---|---|
| `policy.decide` | `{ round, observation: { round, gold, lives }, legal: [] }` | ✅ 被派发 |
| `policy.onDraft` | 契约 P2 | — 当前没有派发点 |

`policy.observe` / `policy.act` 是声明能力。`policy.decide` 的返回值现在由 `Match` 消费：返回 `{ type, ... }` 时，
若 `type` 在 `ctx.legal` 里，会走与 `api.command` 相同的 `Match.keelApplyCommand` 白名单；非法/未知动作会记一条
`reportError`，不改状态。多个 policy 模块同时返回时，取第一个返回的动作并校验类型（全部结果保存在 `Match.keelPolicyDecisions`）。

### 2.6 `ui`

`entry` 是 HTML（通常还带 CSS/JS），`slots` 来自：

```text
hud.right / result.tab / stats.tab / room.panel
```

页面把它放进沙箱 frame，只通过 `postMessage` 提供只读 `pluginView`；它不能碰页面 DOM / 存储，也不能发 intent。契约里的 `ui.render`（声明式组件树）和 `ui.slot`（占用槽位）是加载期扩展点；`ui.frame` 是能力。`ui.theme` 目前只投影到旧 `theme`（◐）；`ui.native` 投影到旧 `trusted.page`，当前 Keel 路径不支持（—）。

### 2.7 `lang`

`entry`（或 `files`）指向 JSON 语言包；只做 UI / 游戏文本覆盖，没有权限、没有代码、没有稳定契约。`api.lang` 是模块域，但 `CONTRACTS.md` 还没有 lang 的扩展点。

## 3. 权限总表（31 个）

“状态”以当前 Keel 路径为准，不以旧 manifest 2 的 class 为准。

| 能力 | 允许模块 | 含义 | 运行时 / 兑现 | v2 投影 | 状态 |
|---|---|---|---|---|---|
| `content.define` | content | 新增记录 | content set 构建 | `data.add` | ✅ |
| `content.extend` | content | 追加 / 合并已有记录 | content set 构建（与 patch 共用） | `data.patch` | ✅ |
| `content.patch` | content | 改已有字段 | content set 构建 | `data.patch` | ✅ |
| `content.override` | content | 整体替换 | content set 构建，需审计 | `data.patch` | ✅ |
| `content.reference` | content | 引用已有记录 | 构建期 | `data.add` | ◐ |
| `content.dsl` | content | DSL kit / 准备期效果 | `server/keel/content.js` 校验 + Match 注册 | `dsl` | ✅ |
| `content.offers` | content | offers 记录 | `readOffers` | `offers` | ✅ |
| `sim.read` | sim | 读单位 / 状态 / 帧 | `api.units` / `buffs.list` / `bonds.get` | — | ✅ |
| `sim.damage.write` | sim | 造成 / 修改伤害 | `api.damage`；`sim.hit/damaged` 回写 | — | ✅ |
| `sim.heal.write` | sim | 修改治疗 | `api.heal`；`sim.heal` 回写 | — | ✅ |
| `sim.buff.write` | sim | 加 / 删 buff | `api.buffs.apply/remove` | — | ✅ |
| `sim.bond.read` | sim | 读盟约 | `api.bonds.get/list` | — | ✅ |
| `sim.bond.write` | sim | 加盟约层数 | `api.bonds.addLayers` | — | ✅ |
| `sim.status.write` | sim | 施加 / 移除状态 | `api.status.*` | — | ✅ |
| `sim.spawn` | sim | 生成单位 / 装置 | `api.spawn` | — | ✅ |
| `sim.rng` | sim | 命名随机流 | `api.rng` | — | ✅ |
| `sim.fx` | sim | 表现事件 | `api.fx` | — | ✅ |
| `sim.code` | sim | v2 脚本标记 | v2 `compat.v2Script`；原生模块不靠它 | `sim.code` | ◐ |
| `match.read` | match | 读比赛视图 | meta host | — | ◐ |
| `match.economy.write` | match | 改经济 / 候选（命令） | `api.command` → `Match.keelApplyCommand`（资金 / 层数 / 棋子和装备 / 免费刷新 / toast） | `meta.code` | ✅ |
| `match.rng` | match | 比赛随机流 | 无 match 版 `api.rng` | — | — |
| `match.code` | match | v2 meta 标记 | v2 / 兼容层 | `meta.code` | ◐ |
| `policy.observe` | policy | 读观察 / 合法动作 | `policy.decide` | — | ✅ |
| `policy.act` | policy | 返回动作 | `policy.onDraft` 未派发；`decide` 返回值**已消费**（`keelApplyCommand` 白名单） | — | ◐ |
| `ui.frame` | ui | 沙箱 frame | UI host `/p/` | `ui.frame` | ✅ |
| `ui.theme` | ui | 主题 | **没有 `ui.theme` 投影**（未实现） | `theme` | — |
| `ui.native` | ui | 原生页面 | 投影 `trusted.page`，未启用 | `trusted.page` | — |
| `asset.add` | asset | 新增资产 | `/p` + `/vs` | `assets.add` | ✅ |
| `asset.override` | asset | 替换官方资产 | `/vs` overlay | `assets.override` | ✅ |
| `asset.theme` | asset | 主题资源 | 只投影 `theme` | `theme` | ◐ |
| `native.execute` | sim / match / ui | 原生执行 | 只允许 `trust: native`；Keel 房间拒绝 native | `trusted.server` | — |

> `content.extend` 已对齐：`contracts.js` 的 C2、`KEEL_PERMISSIONS` 和 manifest 3 都接受它；v2 投影为 `data.patch`。

## 4. 模板覆盖

| 模板 | 模块（能力） |
|---|---|
| `keel-content` | `content`（`content.define`） |
| `keel-lang` | `lang`（无） |
| `keel-policy` | `policy`（`policy.observe` + `policy.act`） |
| `keel-multi-module` | `content`（`content.define`）+ `sim`（`sim.read` / `sim.damage.write` / `sim.spawn` / `sim.rng`）+ `policy`（`policy.observe` + `policy.act`）+ `ui`（`ui.frame`） |
| `keel-survival` | `content`（`content.define`）+ `sim`（`sim.read` / `sim.damage.write` / `sim.spawn` / `sim.rng`）+ `match`（`match.read` + `match.economy.write`）+ `policy`（`policy.observe` + `policy.act`）+ `ui`（`ui.frame`） |
| `keel-cosmetic` | `asset`（`asset.override`） |
| `keel-ui` | `ui`（`ui.frame`，`hud.right`） |
| `keel-script` | `sim`（`sim.code`，`compat.v2Script`） |
| `keel-reference` | `content`（`content.define`）+ `asset`（`asset.add`）+ `sim`（`sim.read` / `sim.damage.write` / `sim.spawn` / `sim.rng`）+ `policy`（`policy.observe` + `policy.act`）+ `ui`（`ui.frame`） |
| `keel-bond` | `content`（`content.define`）+ `sim`（`sim.read` / `sim.bond.read` / `sim.bond.write` / `sim.rng`） |
| `keel-item` | `content`（`content.define`）+ `sim`（`sim.read` / `sim.status.write` / `sim.rng`） |

没有单个模板同时包含七类模块；`keel-survival` 覆盖 5 类，`keel-reference` 覆盖 5 类。

## 5. 权限 / 钩子 / 位置的快速判断

| 我想…… | 该用 | 不该用 |
|---|---|---|
| 加敌人 / 干员 / 关卡 / 盟约数据 | `content` + `content.define` / `content.patch` | `sim` 里硬编码数据 |
| 改官方立绘 / 音频 / FX | `asset` + `asset.add` / `asset.override` | `ui` 里加载远程资源 |
| 改战斗规则 / 加 buff / 召唤 | `sim` + 对应 `sim.*` 能力 | `match` / `policy`（不在战斗进程） |
| 改回合经济 / 商店 / 胜负 | `match` + `match.read` / `match.economy.write` / `api.finish` | `sim`（每 field，不能改全局经济） |
| 做 bot / 选秀策略 | `policy` + `policy.observe` / `policy.act` | `match` 里写策略循环 |
| 加 HUD / 结算页界面 | `ui` + `ui.frame` + `slots` | 直接改页面 DOM |
| 加语言包 | `lang` | `content` 里塞 i18n |

## 6. 校验与生成

```bash
node tools/keel.mjs check <plugin> --strict
node tools/keel.mjs graph <plugin>
node tools/keel.mjs surface --check
```

代码入口：

- `shared/keel/manifest.js`：模块 / 能力 / slots / trust / state / compat 校验；
- `shared/keel/graph.js`：模块图、`provides/consumes`、顺序提示、native 提示；
- `shared/keel/contracts.js`：24 个 stable 扩展点 + experimental 列表；
- `shared/keel/runtime.js`：`api`、预算、hook 调度、state / command / view；
- `server/keel/attach.js`：Battle 事件 → `sim.*`；
- `server/match/match/platform.js`：meta runtime 的 `keelRun` / `publishKeelView`。

## 7. Experimental（不承诺稳定）

`sim.death` / `sim.skillStart` / `sim.skillEnd` / `sim.statusApplied` / `sim.enemySpawn` / `sim.enemyLeak` /
`sim.elementBurst` / `sim.hpDamage` / `match.onPhase` / `match.onSettle` / `policy.review` / `ui.theme`。

这些点在 `shared/keel/contracts.js` 的 `KEEL_EXPERIMENTAL_POINTS` 里，minor 版本可能改签名；新插件不要依赖，除非有对应测试。

## 8. 已知差异 / 未接点（按代码现状记录）

> 2026-11-02 已对齐：`content.extend` 进入 `KEEL_PERMISSIONS`；`policy.decide` 的返回值由 `Match` 消费；
> `match.economy.write` 的 `api.command` 接到 `Match.keelApplyCommand`。下面只列仍未接的点。

| 项 | 现状 | 影响 / 建议 |
|---|---|---|
| `policy.onDraft` | 只在契约里，`Match` 没有派发 | 不要依赖；当前只有 `policy.decide` |
| `match.rng` | 能力存在，但没有 match 版 `api.rng` | 需要新增 API 或删掉该能力 |
| `ui.native` / `native.execute` | 投影 `trusted.page` / `trusted.server`；Keel 房间拒绝 `trust: native` | 当前不可用；不要在新插件里声明 |
| `ui.theme` / `asset.theme` | `ui.theme` 无投影；`asset.theme` 仍走旧 `theme` | 没有独立主题运行时；资产用 `asset.add/override` |
| `sim.code` / `match.code` | v2 兼容标记 | 原生 manifest 3 模块不需要；v2 `compat.v2Script` 才用 |
| `lang` 契约 | `contracts.js` 没有 lang 的扩展点 | 只做静态语言包；需要新契约时再补 |

> 这些差异不影响“普通插件可用”，但会影响作者对能力的预期。新插件按上表“✅ / ◐”选择；标 — 的能力不要用。
