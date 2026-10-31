# 插件开发指南

> **Keel 现状：** 新插件写 manifest 3；manifest 2 先 `node tools/keel.mjs import <id> --write` 迁移。功能总览见 [`keel/FEATURES.md`](keel/FEATURES.md)，manifest 3 规格见 [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md)。本文保留 v2 作者流程作为兼容参考。

> **这是插件开发的单一入口。** 写给**写插件的人**：从选模板、写 manifest、调试、测试到打包发布。
> 不写代码、只想换图 / 模型 / 语音的读者看 [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md)；完整字段规范看 [`PLUGINS.md`](PLUGINS.md)。
> **最后核对**：2026-10-25，游戏版本 `0.4.0`，插件 API `current: 2 / min: 1`。

---

## 0. 先选路径

| 你要做 | 从这里开始 | 规范 / 细节 |
|---|---|---|
| 换立绘、模型、语音、主题、UI 主题 | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md)（工作台，不写代码） | `PLUGINS.md` §9 |
| 做数值、新干员、新棋子、盟约、波次、Boss | 本文 §4–§5 | `PLUGINS.md` §10、`schemas/records.schema.json` |
| 给干员写技能 / 天赋 / 休整期效果，不写 JS | 本文 §6 | [`PLUGIN-DSL.md`](PLUGIN-DSL.md) |
| 写沙箱脚本 / SDK kit / prep 钩子 | 本文 §7 | [`PLUGIN-API.md`](PLUGIN-API.md) |
| 做对局内界面 | 本文 §8 | `PLUGINS.md` §14、`schemas/ui.schema.json` |
| 导入 Forge 工坊包 | [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) |
| 做插件特效（FX / 粒子 / 骨骼跟随 / atlas） | 本文 §4.4 | `PLUGINS.md` §10（FX）、[`design/vfx-format.md`](design/vfx-format.md) |
| 上架 / 签名 / 运营台 | [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | `PLUGIN-REVIEW.md`、`PLUGIN-SUPPLY-CHAIN.md` |
| 让 AI 代理做插件 | [`../plugins/AGENTS.md`](../plugins/AGENTS.md) | 本文 + `PLUGINS.md` 对应章节 |

**三条总原则：**

1. **原版默认**：不选插件就是原版；插件不能偷偷改变原版对局。
2. **插件不改 `data/*.json`**：内容通过声明式数据 / DSL / 脚本进入内容集。
3. **不把官方游戏素材打进插件**：需要时用 `{ "ref": "<official key>" }` 借用本安装已有的条目。

---

## 1. 十分钟跑通第一个插件

### 1.1 准备

```bash
npm install
npm run setup          # 可选：素材，可中断续传
npm start              # http://localhost:3000
```

插件放在服务器的 `plugins/<id>/`：

- 文件夹名就是插件 id：`^[a-z0-9][a-z0-9-]{1,31}$`
- 一个文件夹一个插件
- 仓库只跟踪 `plugins/README.md`、`plugins/AGENTS.md` 和 `plugins/_template/`；**服务器自己的插件不要提交**

### 1.2 从模板开始

```bash
node tools/plugin.mjs new                 # 列出全部模板
node tools/plugin.mjs new art my-texas --target 德克萨斯 --name "我的德克萨斯"
node tools/plugin.mjs new operator my-operator --target 德克萨斯
node tools/plugin.mjs new dsl my-income
node tools/plugin.mjs new script my-script
node tools/plugin.mjs new ui my-ui
```

模板会生成合法的 `plugin.json`、示例文件和 README。`plugin.json` 首行保留：

```json
"$schema": "../../schemas/plugin.schema.json"
```

这样 VS Code 能自动补全和标错。

### 1.3 最短循环

```bash
node tools/plugin.mjs check my-plugin --strict --json
node tools/plugin.mjs test my-plugin        # 脚本 / 作者测试
node tools/plugin.mjs pack my-plugin --zip  # 生成 lock + zip
```

在游戏里：

- 服务器启动后，房间的「插件」面板 / 主界面「插件预览」会列出已加载插件；
- 房主选内容插件（改变 `cs`），玩家选个人插件（外观 / UI / 语言）；
- 改动插件文件后，房间需要「重新应用」才生效。

---

## 2. Manifest 最小结构

```json
{
  "$schema": "../../schemas/plugin.schema.json",
  "manifest": 2,
  "id": "my-plugin",
  "name": { "zh": "我的插件", "en": "My plugin" },
  "version": "1.0.0",
  "app": ">=0.4.0 <0.5.0",
  "api": 2,
  "class": "cosmetic",
  "scope": ["room", "personal"],
  "sourceLang": "zh",
  "authors": ["你的名字"],
  "license": "CC-BY-4.0",
  "permissions": ["assets.override"],
  "assets": {
    "chars": {
      "char_102_texas": { "avatar": "art/texas/avatar.png" }
    }
  }
}
```

要点：

- `manifest` 固定为 `2`；`id` 必须与文件夹名一致（不一致至少是 warning，脚本 / trusted 会拒绝）。
- `app` 是游戏版本范围；本分支当前 `0.4.0`。
- `api` 当前支持 `1` 和 `2`；用到 `offers` 等 level 2 能力时必须写 `2`。
- `class` 决定插件能做什么；`scope` 决定谁能开关：`room`（房主给全房间开）/ `personal`（玩家给自己开）。
- `permissions` 必须与实际使用的能力对应；声明了没用会报 `PLUGIN_PERMISSION_UNUSED`。
- 路径必须是插件文件夹内的相对路径：不能 `..`、不能以 `/` 开头、不能是 URL 或隐藏路径。
- 一个插件只选一个 `class`；外观 + 玩法请拆成两个插件，用 `requires` 组合。

### 2.1 类别怎么选

| 类别 | 用途 | 典型权限 / 字段 | 影响对局 |
|---|---|---|---|
| `cosmetic` | 头像、立绘、模型、图标、语音、音效、音乐、主题、皮肤 | `assets.override` / `assets.add` / `theme` | 数值不变，但房间 `vs` 会变 |
| `content` | 数据补丁、新干员、新棋子、新盟约、DSL、规则开关 | `data.patch` / `data.add` / `dsl` / `offers` | 会，房间 `cs` 变 |
| `ui` | 对局内界面插槽 | `ui.frame` | 不影响对局 |
| `script` | 沙箱脚本、SDK kit、meta / prep 钩子 | `sim.code` / `meta.code` / `mode.code` | 会，需 `SP_PLUGIN_SCRIPTS` |
| `trusted` | 原生信任代码 | `trusted.page` / `trusted.server` | 会，风险最高 |
| `lang` | 语言包 | 语言文件 | 不影响对局 |

### 2.2 面板分类（只影响列表分组）

| `category` | 面板标题 | 放什么 |
|---|---|---|
| `appearance` | 外观音乐 | 画面、模型、头像、语音、音效、音乐、主题 |
| `faction` | 阵营加强 | 新干员、新棋子、盟约 / 自选池补充、数值与规则加强 |
| `strategy` | 新增策略 | 新策略卡（`bands`）、策略授予的干员 |
| `enemy` | 新增敌人 | 新 Boss、敌人、波次 |
| `gameplay` | 新增玩法 | 新模式、新阶段、脚本 / DSL 玩法 |

不写 `category` 时按 `class` 归组：`cosmetic` / `ui` / `lang` → 外观音乐；其余 → 新增玩法。一个作品同时带两类内容时拆成两个插件（例：PRTS 的凯尔希策略与 PRTS Boss 分开）。

---

## 3. 权限与文件

| 权限 | 允许的类别 | 用途 |
|---|---|---|
| `assets.override` / `assets.add` | cosmetic、content、script、trusted | 覆盖 / 新增素材条目 |
| `theme` | cosmetic、trusted | 主题变量 |
| `data.patch` / `data.add` | content、script、trusted | 数据补丁 / 新记录 |
| `dsl` | content、script、trusted | DSL 技能 / 天赋 |
| `offers` | content、script、trusted | 交互窗口（level 2） |
| `sim.code` / `meta.code` / `mode.code` | script、trusted | 脚本入口 |
| `ui.frame` | ui | iframe 界面 |
| `trusted.page` / `trusted.server` | trusted | 页面 / 服务器原生代码 |

文件类型：

- 图片 `.png` / `.jpg` / `.webp`（不支持 SVG）
- Spine `.skel` / `.atlas` / 贴图；导出 **3.8 二进制 `.skel`**
- 音频 `.mp3` / `.ogg`；字体 `.woff2`
- 数据 `.json`；脚本 `.js` 只在 `script` / `trusted`
- UI 页面 `.html` / `.js` / `.css` / `.png`，只在 `ui` 的入口目录
- 文档（`.md` / `.txt` / `README` / `LICENSE` / `NOTICE`）可以放在旁边，但永远不会被服务

不要放符号链接到插件目录里；不要放官方游戏素材。

---

## 4. 外观插件

### 4.1 静态图 / 音频

```text
plugins/my-texas/
├─ plugin.json
├─ art/texas/avatar.png
├─ art/texas/portrait.png
└─ audio/texas/voice.mp3
```

```json
{
  "class": "cosmetic",
  "scope": ["room", "personal"],
  "permissions": ["assets.override"],
  "assets": {
    "chars": {
      "char_102_texas": {
        "avatar": "art/texas/avatar.png",
        "portrait": "art/texas/portrait.png"
      }
    }
  }
}
```

- 改已有条目用 `assets.override`；新增条目用 `assets.add`。
- 借用已有素材：`{ "ref": "char_102_texas" }`。

### 4.2 Spine

```json
{
  "assets": {
    "chars": {
      "char_102_texas": {
        "spine": { "skel": "spine/texas/texas.skel" }
      }
    }
  }
}
```

- `.skel`、`.atlas` 和贴图放同一目录。
- **不要手写** `animations` / `events` / `hits` / `bounds`；`pack` 会从模型读取。
- 改过模型 / 皮肤后必须重新 `pack`。

### 4.3 主题 / 公告 / 皮肤

- 主题：`permissions: ["theme"]` + `theme.vars`；只能使用本安装定义过的颜色、时间和缓动 token。
- 公告：`notices`，纯文本；所有已加载插件的公告都会显示，与房间是否选中无关。
- 皮肤：`skins`，字段见 [`SKINS.md`](SKINS.md)。

### 4.4 特效（FX）

两种做法：

1. **Flipbook**：`assets.fx.flipbooks` + `assets.fx.bind`，适合简单的技能 / 命中特效。
2. **编译特效**：`"index": "fx/index.json"`，官方提取格式的受控子集，支持粒子、billboard / stretch、`FollowMountPoint` 骨骼跟随、`atlas: true` 和 Lite 半尺寸纹理。

```json
{
  "assets": {
    "fx": {
      "flipbooks": {
        "flash": {
          "image": "fx/sheet.png",
          "frames": 8,
          "cols": 4,
          "fps": 16,
          "anchor": [0.5, 0.5],
          "scale": 1,
          "blend": "add",
          "loop": false
        }
      },
      "bind": {
        "char_x_my_pack_guard": {
          "0": { "skillStart": "flash", "hit": "flash" }
        }
      }
    }
  }
}
```

- 绑定位置：`skillStart` / `skillLoop` / `skillEnd` / `attack` / `hit` / `projectile`。
- 效果 id 必须在同一个插件的 FX bundle 里；单位必须是本插件或声明依赖的单位，不能覆盖官方单位。
- 改完必须 `check --strict` 和 `pack`。完整字段见 `PLUGINS.md` §10 与 [`design/vfx-format.md`](design/vfx-format.md)。

---

## 5. 内容插件

内容插件通过声明式数据进入房间内容集（`cs`），**不要直接改 `data/*.json`**。

### 5.1 数据补丁

```json
{
  "class": "content",
  "scope": ["room"],
  "permissions": ["data.patch"],
  "data": ["data/patch.json"]
}
```

```json
{
  "patch": 1,
  "ops": [
    { "op": "set", "file": "bonds", "id": "deputShip", "path": ["bb", "base_def"], "value": 0.3 }
  ]
}
```

支持的文件、补丁操作与边界检查以 `PLUGINS.md` 的补丁表为准。超界、未知 id、跨插件命名空间写入会被拒绝。

### 5.2 新干员

```bash
node tools/plugin.mjs new operator my-operator --target 德克萨斯
```

模板生成 `operators/*.json`，常见字段：

- `charId`：`char_x_<namespace>_<name>` 这类插件命名空间 id
- `profession` / `subProfessionId` / `position` / `rarity`
- `as`：`"chess"`、`"diy"` 或 `"both"`
- `forms.normal` / `forms.elite`：`stats`、`rangeGrid`
- `skills`：`skillId`、`duration`、`spCost`、`initSp`、`bb`
- `kit`：`generic`、`{ "ref": "<official kit>" }` 或 `{ "dsl": ... }`
- `art`：`{ "ref": "<official art key>" }` 借用安装里的美术

6★ 且声明在 `operators` 里的单位按自选处理；低星按商店棋子处理。完整规则见 `PLUGINS.md` 与 [`NEW-OPERATOR.md`](NEW-OPERATOR.md)（自造干员端到端）。

### 5.3 DSL

DSL 用于不写 JavaScript 的技能 / 天赋：

```json
{
  "permissions": ["dsl"],
  "dsl": ["dsl/income.json"],
  "operators": ["operators/guard.json"]
}
```

干员记录里用 `"kit": { "dsl": true }` 或模板生成的结构。DSL 必须通过 `validateDsl` 和内容集构建；失败时**不要**偷偷换成 generic kit。字段见 [`PLUGIN-DSL.md`](PLUGIN-DSL.md)。

### 5.4 Boss / 波次 / 移动逻辑

- Boss / 波次 / 敌人分别写 `bosses`、`waves`、`enemies` 记录；字段和引用检查见 `PLUGINS.md` §10。
- **移动、阻挡、技能状态机是模拟引擎行为，不是普通数据字段。** 例如“可被阻挡但仍移动”属于引擎 kit 的 `profile.moveWhileBlocked`，不是插件 JSON 字段。
- 需要新机制时：优先用现有字段 → 其次写 `script` 插件 → 最后才是在 fork 引擎里加通用能力。
- 新 Boss 必须实际开一局：路线、共享 Boss 血量、波次、阻挡、召唤物、BGM / FX 都要看。

### 5.5 规则开关 / 新模式

- 规则开关、模式、阶段、波次等属于 content / DSL / script，不要在客户端硬编码。
- `offers`（交互窗口）需要 `"api": 2` 和 `permissions: ["offers"]`。
- 修改房间 `cs` 的内容插件必须在真实房间里验证，不只看工作室试跑。

---

## 6. DSL（不写 JS）

- 用途：技能、天赋、休整期效果、数值修正等声明式行为。
- 位置：`dsl/` 下的 JSON，manifest 的 `dsl` 列表。
- 校验：`validateDsl` + 内容集构建；`check --strict` 必须干净。
- 失败时不要用 generic kit 掩盖；修 DSL 或改用脚本。
- 字段、目标、取值和限制见 [`PLUGIN-DSL.md`](PLUGIN-DSL.md)。

---

## 7. 脚本插件

脚本是沙箱代码，不是普通数据。

```text
plugins/my-script/
├─ plugin.json
├─ sim/index.js
└─ test/guard.test.js
```

```json
{
  "class": "script",
  "scope": ["room"],
  "permissions": ["sim.code", "data.add"],
  "operators": ["guard.json"],
  "entry": { "sim": "sim/index.js" }
}
```

```js
import { kit } from 'sp:sdk@1';

export default function setup(sp) {
  sp.kits.register('char_x_my_script_guard', (bb) => ({
    skill: {
      kind: 'duration',
      duration: 10,
      spCost: 10,
      initSp: 10,
      trigger: 'SP_FULL',
      mods: { atkPct: kit.num(bb.atk, 0.5) },
    },
  }));
}
```

开发流程：

```bash
node tools/plugin.mjs check my-script --strict
node tools/plugin.mjs test my-script
node tools/plugin.mjs pack my-script
```

运行条件：

- 服务器设置 `SP_PLUGIN_SCRIPTS=sandbox`（或 trusted 模式）；
- 房间选中该插件，或内容插件通过 `requires` 带入；
- 锁文件 `plugin.lock.json` 有效；
- `sandbox` 不需要 owner pin / 玩家 consent；`trusted` 需要 owner pin 和每个玩家的 consent。

注意：

- 入口只能 import `sp:sdk@1`；
- 状态必须按 battle 保存，使用 seeded RNG 和确定性数学；
- 回调预算不能中断无限循环；服务器 / Worker 有 watchdog，但不要依赖它；
- 不要手改 `plugin.lock.json`；
- `check` / `import-forge` 不会执行脚本；
- API 见 [`PLUGIN-API.md`](PLUGIN-API.md)。

---

## 8. UI 插件

```text
plugins/my-ui/
├─ plugin.json
└─ ui/index.html
```

```json
{
  "class": "ui",
  "scope": ["personal"],
  "permissions": ["ui.frame"],
  "entry": { "client": "ui/index.html" },
  "slots": ["hud.right"]
}
```

- iframe 页面必须在 `<html>` 上写 `color-scheme: dark`；
- 只能通过只读 postMessage 接口读状态；不能直接发对局意图；
- 同一槽位多个插件在对局里用标签切换；
- 槽位和消息格式见 `PLUGINS.md` §14 / `schemas/ui.schema.json`。

---

## 9. 语言包与兼容性

### 9.1 语言包

- 语言包是 `class: "lang"` 的个人插件，manifest 2 或旧的 `pack.json` 均可；格式见 [`PACKS.md`](PACKS.md) 与 [`I18N.md`](I18N.md)。
- 普通插件需要自己的文案时，优先用 manifest 的 `i18n` 字段，不要为每个插件单独造语言包。
- UI 文案的通用 msgid 仍应进入 `public/i18n/*.json`；语言包只提供覆盖。

### 9.2 兼容性

本分支当前版本是 `0.4.0`：

- `lang` / `cosmetic` / `ui`：`app` 范围匹配 `0.3.2` 也算兼容（原样运行）；
- `content`：同样算兼容（**数据**会按本分支重新校验、构建内容集，但玩法以本分支为准，check 会给一条 `PLUGIN_APP_MISMATCH` 提醒审一遍）；
- `script` / `trusted`：默认严格要求 `0.4.0`（要执行代码，必须审过）；
- owner 可在 `plugins/config.json` 设 `"allowIncompatible": true`，或用插件 id 列表显式放行已审查的旧内容 / 脚本；仍走数据校验和脚本权限；
- 内容插件改变房间 `cs`；外观插件只改变 `vs`，不改变对局；
- 插件文件改动后，房间需要「重新应用」才生效。

---

## 10. 测试与调试

```bash
node tools/plugin.mjs list
node tools/plugin.mjs check my-plugin
node tools/plugin.mjs check my-plugin --strict --json
node tools/plugin.mjs test my-script
node tools/plugin.mjs pack my-plugin --zip
```

服务端 / 浏览器：

- `/admin` →「插件与内容」：兼容性、skipped、warnings、房间 `cs` / `vs`；
- `/studio/`：浏览器工作台，可预览、试跑、打包（本机 / 局域网）；
- `SP_TEST_MODE=1`：测试控制台，测试对局默认不计入统计。

测试建议：

- 数据 / DSL：`test/plugins/` 下的内容集、规则、DSL 测试；
- UI：`test/ui/*.e2e.test.js`；
- 脚本：`test/plugins/script*.test.js` + `node tools/plugin.mjs test`；
- 真实浏览器：`SP_E2E=1` + `test/ui/plugins.e2e.test.js`、`ui-plugins.e2e.test.js`、`plugins-content-script.e2e.test.js`。

**两遍同种子**：工作室试跑 / 脚本测试要比较相同 seed 的两次结果，确认确定性。

---

## 11. 打包与发布

```bash
node tools/plugin.mjs check my-plugin --strict
node tools/plugin.mjs pack my-plugin --zip
```

生成：

- `plugins/my-plugin/plugin.lock.json`
- `plugins/_dist/my-plugin-1.0.0.zip`

发布前确认：

- [ ] 版本号已递增
- [ ] 作者、许可证、素材来源已填
- [ ] 没有官方游戏素材
- [ ] `check --strict` 干净
- [ ] 脚本插件已重新 `pack`
- [ ] 在测试服务器上实际开一局
- [ ] 需要时更新 README / 公告 / 截图

安装 / 上架 / 签名 / 审核见 [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md)、[`PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md)、[`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md)。

---

## 12. 错误码与排查

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `PLUGIN_CLASS` | `class` 缺失或拼错 | 只用允许的类别 |
| `PLUGIN_PERMISSION_UNUSED` | 声明了没用的权限 | 删掉权限或补上对应内容 |
| `PLUGIN_FILE_OUTSIDE` | 路径 `..` / 绝对路径 / URL | 改成插件内相对路径 |
| `PLUGIN_ASSET_*` | 图片 / 音频 / Spine 类型或路径不对 | 对照模板和 `PLUGINS.md` |
| `PLUGIN_SCRIPT_*` | 脚本未启用、锁无效、SDK import 不合法 | 看错误码 + `PLUGIN-API.md` |
| 房间看不到内容插件 | 类别 / scope / 权限 / 兼容性不对 | 看 `/admin` 的 skipped 和 warnings |
| 改了文件房间没变 | 房间持有旧内容集 | 房主点「重新应用」 |
| 内容集构建失败 | 数据补丁 / 干员 / DSL 有问题 | 先 `check`，再看 contentSet 错误 |

完整错误目录：`shared/plugins/errors.js`，或 `node tools/plugin.mjs errors`。

---

## 13. 不要做

- 不要把 `data/*.json` 当插件输入直接改；
- 不要把官方游戏素材打进插件；
- 不要手写 `plugin.lock.json`；
- 不要用 `trusted` 绕过数据校验；
- 不要在 `content` 插件里塞任意服务端逻辑；需要逻辑就用 DSL，或明确写 `script` 并接受沙箱 / 信任审查；
- 不要让一个插件同时承担外观和玩法；拆开用 `requires` 组合；
- 不要在一个插件文件夹里放符号链接 / 隐藏路径 / 超大文件树。

---

## 14. 文档地图

| 文档 | 用途 |
|---|---|
| 本文 | 开发者工作流（单一入口） |
| [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | 不写代码的工作台指南 |
| [`PLUGINS.md`](PLUGINS.md) | 完整规范（manifest / 权限 / 各类插件 / content set / studio / Forge） |
| [`PLUGIN-API.md`](PLUGIN-API.md) | 脚本 SDK 稳定 / 实验 API |
| [`PLUGIN-DSL.md`](PLUGIN-DSL.md) | DSL 字段与行为 |
| [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | Forge 包开发 |
| [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | Forge 兼容矩阵 |
| [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | 商城 / 上架 |
| [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) | 当前未解决事项 |
| [`../plugins/AGENTS.md`](../plugins/AGENTS.md) | AI 代理在 `plugins/` 内的规则 |
