# Forge 导入包开发指南

本文写给**做 Forge 工坊包、并希望它能干净导入本分支的人**。它讲怎样组织 `pack.json`、哪些 Forge 写法能转换、哪些会拒绝、怎样读导入报告、导入后怎样验证。

完整字段级兼容矩阵在 [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md)。普通插件开发见 [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md)，完整规范见 [`PLUGINS.md`](PLUGINS.md) §16。

## 1. 先理解导入模型

Forge 包不是本分支的运行时插件。`import-forge` 只做一件事：

```text
Forge 包（目录或 zip）
        ↓ 只读、静态解析、不执行
本分支 manifest 2 插件（content / cosmetic / ui / lang / kits-<id> 脚本）
```

因此：

- 导入器不会运行 Forge 的 JavaScript、服务端逻辑或面板代码
- 导入器会尽量把声明式字段映射成我们的数据/素材
- 无法安全映射的字段会写进 `IMPORT-REPORT.md`
- 导入成功不等于玩法等价；要按报告逐项确认
- 脚本插件即使导入，也只有在 `SP_PLUGIN_SCRIPTS` 开启且房间选中后才运行

## 2. 包的基本结构

推荐的 Forge 包布局：

```text
my-forge-pack/
├─ pack.json
├─ operators/
│  └─ guard.json
├─ chess/
│  └─ guard_a.json / guard_b.json
├─ art/
│  ├─ chars/...
│  ├─ enemies/...
│  └─ audio/...
├─ kits/
│  └─ guard.js
├─ ui/
│  └─ index.html
└─ i18n/
   └─ en.json
```

要求：

- 根目录必须有 `pack.json`
- 可以直接给目录，也可以给 zip；单层包装目录会被剥掉
- 路径不能逃出包根，不能有符号链接、硬链接、重复条目
- zip 不能加密、不能用 ZIP64、不能有 data descriptor
- 包总大小、文件数、JSON 大小都受插件上限约束

## 3. 快速工作流

先 dry run，不写文件：

```bash
node tools/plugin.mjs import-forge my-forge-pack --dry-run --json
```

看报告：

- `refused`：哪些顶层字段/记录完全不能导入
- `partial`：哪些字段被丢弃
- `assumed`：导入器做的假设，需要作者确认
- `skipped`：包里有、但没有可用导入目标的内容

确认后写插件：

```bash
node tools/plugin.mjs import-forge my-forge-pack --out plugins/my-forge-pack
```

常用选项：

```bash
--id <id>                 # 覆盖主产品 id
--no-scripts              # 不生成 kits-<id> 脚本插件
--offline                 # 禁止下载官方表
--asset-source=direct     # 或 mirror
--refresh-index           # 刷新官方表索引
```

成功导入后：

```bash
node tools/plugin.mjs list
node tools/plugin.mjs check my-forge-pack --strict
node tools/plugin.mjs pack my-forge-pack
```

## 4. 会生成哪些插件

一个 Forge 包可能拆成多个产品：

| 包内容 | 生成 |
|---|---|
| 干员、棋子、羁绊、物品、敌人、关卡、波次、token、boss、阵营、驻守、band、effect、choice、trait、overrides | `content` 插件 |
| 美术、Spine、音频、皮肤、主题 | `cosmetic` 插件 |
| `client.panels` 且能静态扫描 | `ui` 插件 |
| 扁平 `i18n` | `lang` 插件 |
| `kits/<id>.js` 且能映射到 `sp:sdk@1` | `kits-<id>` 脚本插件 |

多产品 id 规则：

- `content` 保留包 id / `--id`
- 外观通常是 `<id>-look`
- UI 是 `<id>-<slot>`
- 语言包是 `<id>-<lang>`
- 脚本是 `kits-<id>` 或 `forge-kits-<id>`

`--out` 决定主产品文件夹名；主产品 id 默认取文件夹 basename。

导入出的 manifest 使用：

```json
"app": ">=0.3.0 <0.5.0",
"api": 1
```

这保证在本分支 `0.4.0` 上兼容。

## 5. 数据怎么写才容易导入

### 5.1 干员 / 棋子

优先使用：

- `charId`、`name`、`profession`、`subProfessionId`、`position`、`rarity`
- `forms.normal` / `forms.elite` 的 `stats`、`rangeGrid`
- `skills` / `skill`
- `talents`（具名、纯数值）
- `trait`
- `chess.tier`、`bonds`、`garrisonIds`、`price`、`sellPrice`、`upgradeNum`
- `assets` 中本安装认识的槽位

避免或预期被丢弃：

- `modules`、`potentials`
- `statsBase`、`traitBase`、`talentsBase`
- `immunities`、`summons`
- 模块天赋
- 未知羁绊 / 驻守 / 棋子 id
- 超出 `±1e9` 的数值

建议：

- 6★ 自选记录明确放在 `operators` 里
- 商店棋子用完整的 `_a` / `_b` 对，或让单位记录直接生成
- 技能 id 如果能对应同一个官方干员，就保留官方技能 id，导入器会引用官方 kit；否则保留 `generic` 并在报告里确认
- 没有美术时用 `{ "ref": "<official key>" }`，不要复制官方素材

### 5.2 技能和天赋

保留：

- `name`
- `duration` / `spCost` / `initSp`
- `bb`
- `desc` / `descRaw` / `bbStr`
- `skillType` / `spType` / `durationType`
- `trigger`
- `rangeGrid`
- 具名、纯数值天赋

不要依赖：

- 模块天赋
- 复杂嵌套天赋的按索引合并
- 官方数据里没有的字段

### 5.3 顶层数据

可用：

- `operators`
- `chess`
- `art`
- `client`
- `i18n`
- `notices`
- `dependencies` / `conflicts`
- `overrides`

明确拒绝：

- `server` / `serverModules`
- `routes`
- `assets`（`.spresources` 引擎资源容器）
- `forms`
- `fx`（除有限的 `silentPhases` 处理）
- `variants`
- `behaviour`
- `playtest`
- `support`
- `combat`
- `layer`

拒绝会写进报告，不会静默跳过。

## 6. 美术与音频

### 6.1 图片 / Spine

- 图片：`.png` / `.jpg` / `.webp`
- Spine：3.8 二进制 `.skel` + 同名 `.atlas` + 贴图，放在同一目录
- 导入器会调用与 `pack` 相同的 skeleton 解析；解析失败只丢该模型并报告
- 骨骼、slot、skin、顶点数超上限会在解析前拒绝

### 6.2 音频

支持的写法：

- `voices` → `audio.voiceJp`（Forge 默认日配）
- `voiceLangs.cn` → `audio.voice`
- `audio.bgm.lobby|prep|combat|unite|boss`
- `bossBgm` → `{ loop }`
- `sfx.ui` / `sfx.battle` / `sfx.units.*`
- `skills` / `attacks` / `hits` 按索引

未知音频键会报告并丢弃。

### 6.3 皮肤 / 主题

- `skins[]` 中 id 是合法 skin key 的会变成该干员的 `skins` 变体
- 没有可用 id 的皮肤会折叠到该干员的一个 overlay，不生成选择行
- `client.theme.vars` 只保留本安装定义过的 token，最多 64 个
- 主题只影响个人外观，不改变玩法

## 7. UI 面板

支持：

- `screen.game.hud` → `hud.right`
- `screen.game.aside` → `hud.right`
- `screen.result.footer` → `result.tab`
- `root.guide` 且监听 `room.state` → `room.panel`
- 其他可静态扫描的映射到 suggestion 槽

条件：

- 面板不能包裹组件
- 模块及包内 `.js` / `.css` / `.json` 导入必须在 256 KB / 面板 1 MB / 64 文件以内
- 静态扫描只能使用只读 shim
- 导入器不执行面板代码

不满足时保留 stub，并报告 `PLUGIN_FORGE_PANEL_SCRIPT` 等原因。

## 8. 脚本

Forge 脚本只有一种进入方式：

- `kits/<id>.js`
- 或记录的 `kit` 指向的文件
- id 必须是包内记录，或 `overrides` 声明的官方 id

导入器会：

- 解析脚本
- 把 import 映射到 `sp:sdk@1`
- 生成 `kits-<id>` 脚本插件
- 要求对应 content 插件精确版本
- 为记录的新 `charId` 注册 kit
- 不执行脚本

运行条件：

- `SP_PLUGIN_SCRIPTS=sandbox`（或 trusted 模式）
- 房间选中 content 插件，脚本作为依赖自动加入
- `plugin.lock.json` 有效
- trusted 还需要 owner pin 和玩家 consent

`--no-scripts` 不生成脚本插件，报告里逐文件说明。

其他 `.js` 技能脚本、服务端脚本不会被运行或转换。

## 9. 翻译 / 公告

- 扁平 `{ "msgid": "text" }` → `lang` 插件
- `{ "version": 1, "files": ... }` → 只作为 content 插件自己的翻译，且每个叶子必须替换已有字符串
- `zh` 是源语言，不生成 `lang` 插件
- 同一语言 canonicalise 成两个条目会直接拒绝
- `notices` / `credits` → manifest notices，纯文本，有长度上限

## 10. 读导入报告

报告有两个形态：

- `IMPORT-REPORT.md`：给人看，中文 + English
- `--json`：给脚本/运营台看，键稳定排序

状态：

| 状态 | 含义 |
|---|---|
| `supported` | 已转换 |
| `partial` | 部分转换，有字段/文件被丢弃 |
| `refused` | 未转换，有原因和位置 |
| `skipped` | 包里有，但没有可用导入目标 |
| `assumed` | 导入器做的假设，作者要确认 |

建议每次导入都保留这两个文件，尤其是 `assumed` 和 `partial`。

## 11. 导入后验证

```bash
node tools/plugin.mjs check my-forge-pack --strict
node tools/plugin.mjs pack my-forge-pack
```

服务端：

```bash
SP_PLUGIN_SCRIPTS=sandbox npm start
```

验证顺序：

1. `/admin` 插件页看到 content / cosmetic / ui / script 产品，兼容列为“兼容”
2. 房间打开插件面板，选中 content 插件
3. 自定义干员进入自选/商店，`cs` 变为非原版
4. 对局能进入 `PREP`
5. 如果带脚本，脚本插件显示 `sandbox` 并被房间自动加入
6. 真实浏览器 E2E：

```bash
SP_E2E=1 CHROME_PATH=<chrome> SP_E2E_BOOT_MS=120000 \
  node --test test/ui/plugins-content-script.e2e.test.js
```

## 12. 常见失败

| 报告/现象 | 原因 | 处理 |
|---|---|---|
| `PLUGIN_FORGE_INPUT` | `pack.json` 缺失、JSON 不合法、重复语言 | 检查包根和 JSON |
| `PLUGIN_FORGE_ZIP` | 符号链接、硬链接、ZIP64、加密、路径穿越 | 重新打包 |
| `PLUGIN_FORGE_JSON` | 危险键、JSON 超限、未知结构 | 去掉 `__proto__` 等，拆分文件 |
| `PLUGIN_FORGE_SCRIPT` | 脚本 import 不能映射到 `sp:sdk@1` | 改成 SDK 支持的写法或 `--no-scripts` |
| `PLUGIN_FORGE_PANEL_SCRIPT` | 面板包裹组件、导入越界、使用未支持接口 | 改成静态只读面板 |
| `PLUGIN_DSL_UNAVAILABLE` | Forge 声明了 DSL | 当前版本跳过该脚本插件 |
| 干员没出现 | `as` / 6★ / `operators` 声明不符 | 检查记录和报告 |
| 技能不对 | 技能 id 不能唯一对应官方 kit | 保留官方 id 或接受 `generic` |
| 羁绊/驻守丢失 | id 不在本安装 | 用本安装已有 id，或自己在新插件里定义 |
| 脚本被禁用 | 没开 `SP_PLUGIN_SCRIPTS` 或锁无效 | 开 sandbox，重新 `pack` |

## 13. 发布前检查清单

- [ ] `--dry-run --json` 已看，`refused` / `assumed` 已处理
- [ ] `IMPORT-REPORT.md` 已归档
- [ ] `node tools/plugin.mjs check --strict` 干净
- [ ] `node tools/plugin.mjs pack` 已重新生成 lock
- [ ] content 插件在房间中能启用，`cs` 改变
- [ ] 自定义干员在自选/商店出现
- [ ] 对局能到 `PREP`
- [ ] 脚本插件（如有）lock 有效、sandbox 能加载
- [ ] UI 面板（如有）只读且不发送对局意图
- [ ] 没有官方游戏素材
- [ ] `/admin` 没有 skipped / warnings 异常

## 14. 不要做的事

- 不要把服务端逻辑塞进 `content` 期望它自动转换
- 不要依赖 `server` / `routes` / `assets` / `forms` / `fx` 的行为
- 不要复制官方游戏素材
- 不要手改 `plugin.lock.json`
- 不要让 Forge 脚本直接执行未审查的 Node 能力
- 不要因为导入成功就宣称玩法完全等价
