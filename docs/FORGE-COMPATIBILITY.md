# Forge 兼容矩阵与不支持清单

本文说明 `node tools/plugin.mjs import-forge` 能把 Forge 工坊包转换成什么、哪些部分会被明确拒绝或丢弃，以及导入报告怎么读。它对应本分支 `0.4.0`，不承诺 Forge 运行时 100% 等价。

## 1. 先看结论

- Forge 包不会被直接运行；导入器只读字节，把它转成我们的 manifest 2 插件。
- 一个 Forge 包可能生成多个插件：`content`、`cosmetic`、`ui`、`lang` 和可选的 `kits-<id>` 脚本插件。
- 转换是**选择性**的。Forge 的服务端逻辑、引擎资源容器、动画/特效行为声明、任意脚本不会自动执行，也不会被猜测翻译。
- 所有没导入的条目都应出现在 `IMPORT-REPORT.md` 或 `--json` 报告里；没有出现在报告里的拒绝项视为导入器缺陷。
- 脚本插件只有在服务器开启 `SP_PLUGIN_SCRIPTS`、并且房间选中它时才可能运行；导入阶段绝不执行包里的代码。

## 2. 产品映射

| Forge 输入 | 转成 | 状态 | 边界 |
|---|---|---|---|
| `operators`、`chess`、`units`、`bonds`、`items`、`enemies`、`stages`、`waves`、`tokens`、`bosses`、`factions`、`garrisons`、`bands`、`effects`、`choices`、`traits`、`overrides` | 一个 `content` 插件 | ✅ 可转换 | 字段按下表保留；未知记录/字段会报告 |
| `art` 的 `chars`、`enemies`、`tokens`、`bonds`、`bands`、`items`、`skills`、`modules`、Spine、音频、皮肤 | 一个 `cosmetic` 插件 | ✅ 可转换 | 只接受本安装认识的槽位；未知槽位报告 |
| `client.panels` | 一个 `ui` 插件 | ⚠️ 部分 | 只支持少量挂载点和只读 shim；不执行包代码 |
| `kits/<id>.js` 或记录 `kit` 指向的脚本 | 一个 `kits-<id>` `script` 插件 | ⚠️ 部分 | 只有能映射到 `sp:sdk@1` 的脚本；需 `SP_PLUGIN_SCRIPTS` |
| `i18n` 扁平 `{ msgid: text }` | 一个 `lang` 插件 | ✅ 可转换 | `zh` 是源语言，不生成 `lang` 插件 |
| `i18n` 的 `{ version: 1, files }` | content 插件自己的翻译 | ⚠️ 部分 | 只有每个叶子都替换已有字符串时才接受 |
| `client.theme.vars` | `cosmetic` 插件的 `theme.vars` | ⚠️ 部分 | 只保留本安装定义过的设计 token，最多 64 个 |
| `notices` / `credits` | `cosmetic` 插件的 manifest notices | ✅ 可转换 | 纯文本，不接收 HTML；有长度上限 |
| `dependencies` / `conflicts` | `requires` / `conflicts` | ✅ 可转换 | 省略版本范围时用 `*` |
| `pack.json` 本身 | 不单独导入 | — | 只作为导入输入和报告来源 |

## 3. 数据字段

### 3.1 干员 / 棋子

保留的典型字段：

- `charId`、`name`、`profession`、`subProfessionId`、`position`、`rarity`
- `chess.tier`、`bonds`、`garrisonIds`、`price`、`sellPrice`、`upgradeNum`
- `stats`、`rangeGrid`、`trait`、`skill` / `skills`、`talents`、`tags`
- `dmgType`、`attackKind`、`projectile`、`canHitFly`、`targetPriority`
- `assets` 中本安装认识的 `avatar`、`avatarE2`、`portrait`、`portraitE2`、`illust`

转换规则：

- `DEFENDER` / `HEAVY` / `GUARDIAN` → `TANK`；`VANGUARD` → `PIONEER`；`GUARD` → `WARRIOR`。
- 缺失 `position` 时：坦克/近卫/先锋按 `MELEE`，其余按 `RANGED`。
- Forge 的 form rank 按整数比较；最低 rank 变 normal，最高 rank 变 elite，只有一个 rank 时两边复制。
- 技能从选中 form 的 `forms[rank].skills` 取；没有则用记录自己的 `skills`。
- 技能保留 `name`、数值、`bb`、`desc` / `descRaw`、`bbStr`、`skillType`、`spType`、`durationType`、`trigger`、`rangeGrid` 等类型匹配的字段。
- 天赋（具名、纯数值）和 trait 按同样方式复制；模块天赋会报告并丢弃。
- 6★ 且声明在 `operators` 里的单位按 `自选`（`as: "diy"`）处理；低星按商店棋子处理。
- 新 `_a/_b` 对会合成一个紧凑记录；没有羁绊时用 `协防干员` 作为 fallback；所有羁绊都不认识时不导入。
- 所有技能 id 都对应同一个官方干员时，记录会引用该官方 kit；部分匹配或歧义时保留 `generic` 并报告。
- 覆盖数组会替换官方数组；超出 `±1e9` 的有限数、未知羁绊/驻守/棋子 id 会被报告并跳过对应值或列表。

### 3.2 明确丢弃 / 不转换的字段

以下字段会报告并丢弃，不会静默写入：

- `modules`、`potentials`
- `statsBase`、`traitBase`、`talentsBase`
- `immunities`、`summons`
- 模块天赋
- `talents` / `talentsBase` 的 Forge 按索引合并语义（本版本不替换，只报告）
- 导入器不认识的 `chess.json` / 干员字段
- 未知的音频键、未知的 `art` 容器、未知的皮肤 id

## 4. 顶层不支持项

以下 Forge 顶层字段会被明确拒绝，原因同时写中英文报告：

| Forge 字段 | 原因 |
|---|---|
| `server` / `serverModules` | 服务端逻辑，会改协议或对局 |
| `routes` | 没有只读 HTTP 路由插件类 |
| `assets` | 要替换引擎资源容器（`.spresources`），不是可叠加图片 |
| `forms` | 动画形态的行为声明，不是素材 |
| `fx`（除 `silentPhases` 的有限处理） | 特效相位行为声明 |
| `variants` | 引擎口径开关，不是模式数据 |
| `behaviour` | 引擎写死的行为开关 |
| `playtest` | 试玩名单，不是对局数据 |
| `support` | 助战卡池规则，不是干员数据 |
| `combat` | 战斗引擎开关，不是数据 |
| `layer` | Forge 加载层声明，我们的 manifest 没有这一格 |

这些内容不会通过导入获得等价能力。需要时应在我们的插件模型里单独实现，而不是自动翻译。

## 5. UI 面板

支持的面板挂载：

- `screen.game.hud` → `hud.right`
- `screen.game.aside` → `hud.right`
- `screen.result.footer` → `result.tab`
- `root.guide` 且监听 `room.state` → `room.panel`
- 其他能通过静态扫描的映射到 suggestion 槽，但这不是 Forge 的原始位置

限制：

- 面板不能包裹组件。
- 模块及其包内 `.js` / `.css` / `.json` 导入必须在上限内：单文件 256 KB、单面板 1 MB、64 个文件。
- 静态扫描只能使用只读 shim 暴露的接口。
- 不满足条件时保留 stub，并在报告里给出 `PLUGIN_FORGE_PANEL_SCRIPT` 等未支持原因。
- 导入器不会执行面板代码。

## 6. 脚本

- 只处理 `kits/<id>.js`（或记录 `kit` 指向的文件）；id 必须是包内记录，或 `overrides` 声明的官方 id。
- 脚本会被解析并改写成 `sp:sdk@1` 导入，生成 `kits-<id>` 脚本插件；不会在导入时执行。
- 脚本插件要求内容插件精确版本，登记记录的新 `charId`；需要 `SP_PLUGIN_SCRIPTS`，且房间选中后才运行。
- `--no-scripts` 不生成脚本插件，报告会逐文件说明。
- 其他 `.js` 技能脚本不会被运行或转换。
- 脚本插件需要有效的 `plugin.lock.json`；sandbox 模式也需要 lock 校验，trusted 模式还需要 owner pin。
- 声明 DSL 的 Forge 脚本当前会跳过该脚本插件（`PLUGIN_DSL_UNAVAILABLE`）。

## 7. 导入报告怎么读

推荐先 dry run：

```bash
node tools/plugin.mjs import-forge <dir-or-zip> --dry-run --json
```

然后正式写：

```bash
node tools/plugin.mjs import-forge <dir-or-zip> --out plugins/<id>
```

报告中的状态：

- `supported`：已转换
- `partial`：部分转换，有字段或文件被丢弃
- `refused`：未转换，附原因和位置
- `skipped`：包内条目没有可用的导入目标
- `assumed`：导入器的假设，作者需要确认

建议把 `IMPORT-REPORT.md` 和 `--json` 报告一起归档；前者给人看，后者给脚本/运营台做统计。

## 8. 推荐流程

1. `--dry-run --json`，先看 refused / partial / assumed。
2. 检查 `content` 插件是否生成了预期干员和棋子。
3. 用 `node tools/plugin.mjs check <id> --strict`。
4. `node tools/plugin.mjs pack <id>`，生成 lock。
5. 在测试服务器上让房间选中 content 插件，确认自定义干员出现在自选/商店。
6. 需要脚本时，另开 `SP_PLUGIN_SCRIPTS=sandbox`，确认脚本插件被自动加入且 lock 有效。
7. 最后再进 `/admin` 的只读诊断页核对兼容性和 skipped/warnings。

## 9. 当前测试覆盖

- `test/plugins/forgeImport.test.js`：目录/ZIP、路径穿越、符号链接、记录映射、脚本映射、面板、报告和失败回滚。
- `test/plugins/forgeRecords.test.js`：记录级映射和字段丢弃。
- `test/plugins/forgeKits.test.js`：`kits/<id>.js` 的解析与 SDK 改写。
- 真实浏览器 E2E：`test/ui/plugins-content-script.e2e.test.js` 覆盖 content 插件和 sandbox 脚本依赖链路。

## 10. 不承诺的能力

- Forge 服务端逻辑的自动等价转换。
- 任意 Forge 脚本/原生代码的直接执行。
- 引擎资源容器、动画表单、特效行为的自动移植。
- Forge 全部 UI 挂载位置的 1:1 对应。
- Forge 数据中所有未知字段的猜测性写入。

这些需要按我们的插件模型逐个设计，而不是靠导入器“猜”。
