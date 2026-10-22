# 普通插件开发指南

本文写给**写插件的人**：从插件目录、manifest、各插件类别，到本地调试、测试、打包和发布。它不替代完整规范；字段和错误码的权威来源是：

- [`PLUGINS.md`](PLUGINS.md)：manifest、权限、文件、各插件类、Forge 导入、工作室与工具
- [`PLUGIN-API.md`](PLUGIN-API.md)：脚本 SDK 的稳定/实验 API
- [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md)：插件体系架构、安全边界和运营台
- [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md)：Forge 包开发与导入
- [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md)：Forge 兼容矩阵和不支持清单

面向玩家、用工作台点鼠标做插件的说明见 [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md)。

## 0. 文档地图：先看哪一篇

| 你要做的事 | 先看 | 需要查字段 / 细节时 |
|---|---|---|
| 不写代码，换立绘 / 模型 / 语音 / 主题 | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | [`PLUGINS.md`](PLUGINS.md) §9 |
| 第一次写一个可加载的插件 | 本文 §1–§4 | `schemas/plugin.schema.json` |
| 做数值、新干员、新棋子、新羁绊、波次 / Boss | 本文 §5，[`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | [`PLUGINS.md`](PLUGINS.md) §10、`records.schema.json` |
| 给新干员写技能 / 天赋 | 本文 §5.2–§5.3，[`PLUGIN-DSL.md`](PLUGIN-DSL.md) | [`PLUGIN-API.md`](PLUGIN-API.md)（脚本时才需要） |
| 写沙箱脚本、SDK kit、prep 钩子 | 本文 §7 | [`PLUGIN-API.md`](PLUGIN-API.md) |
| 做对局内界面 | 本文 §6 | [`PLUGINS.md`](PLUGINS.md) §14、`schemas/ui.schema.json` |
| 导入 Forge 工坊包 | [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) |
| 做插件特效（FX / 粒子 / FollowMountPoint / atlas） | 本文 §4.4 | [`PLUGINS.md`](PLUGINS.md) §10（FX）、[`design/vfx-format.md`](design/vfx-format.md) |
| 上架、签名、运营台 | [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md)、[`PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) |
| 让 AI 代理做插件 | [`plugins/AGENTS.md`](../plugins/AGENTS.md) | 本文和 `PLUGINS.md` 的对应章节 |

**最短路线：**

1. **外观插件**：`new art` → 放图片 / 模型 → `check` → `pack --zip` → 游戏里开启。
2. **内容 / 干员插件**：`new operator`（或从内容模板开始）→ 写记录 / DSL → `check --strict` → 工作室或测试服试一场 → `pack`。
3. **脚本 / UI 插件**：从 `new script` / `new ui` 开始 → `check` → `test`（脚本）→ 打包；脚本还需要服务器运行模式、锁文件和房间选择。

**三条原则：** 原版默认；插件不直接改 `data/*.json`；不要放入官方游戏素材。内容插件影响房间 `cs`，外观插件影响 `vs`，二者不要混在同一个插件里。

## 1. 开发前准备

```bash
npm install
npm run setup      # 素材（可中断续传）
npm start          # http://localhost:3000
```

插件放在服务器的 `plugins/<id>/`，文件夹名就是插件 id：

- `^[a-z0-9][a-z0-9-]{1,31}$`
- 一个文件夹一个插件
- 不要把官方游戏素材放进插件；需要时用 `{ "ref": "<official key>" }` 借用本安装已有的条目

推荐从模板开始，不要从空文件开始：

```bash
node tools/plugin.mjs new            # 列出模板
node tools/plugin.mjs new art my-texas --target 德克萨斯 --name "我的德克萨斯" --author 你的名字
node tools/plugin.mjs new operator my-operator --target 德克萨斯
node tools/plugin.mjs new dsl my-income
node tools/plugin.mjs new script my-script
node tools/plugin.mjs new ui my-ui
```

`plugins/<id>/plugin.json` 开头的 `"$schema": "../../schemas/plugin.schema.json"` 能让 VS Code 自动补全和标错。

## 2. Manifest 最小结构

```json
{
  "$schema": "../../schemas/plugin.schema.json",
  "manifest": 2,
  "id": "my-plugin",
  "name": { "zh": "我的插件", "en": "My plugin" },
  "version": "1.0.0",
  "app": ">=0.3.0 <0.5.0",
  "api": 1,
  "class": "cosmetic",
  "scope": ["room", "personal"],
  "sourceLang": "zh",
  "authors": ["你的名字"],
  "license": "CC-BY-4.0",
  "permissions": ["assets.override"],
  "assets": { "chars": { "char_102_texas": { "avatar": "art/texas/avatar.png" } } }
}
```

要点：

- `manifest` 固定为 `2`
- `app` 是游戏版本范围；本分支版本是 `0.4.0`
- `api` 当前支持 `1` 和 `2`（`2` 才有 offers 等新能力）
- `class` 决定插件能做什么
- `scope` 决定谁能开关：`room` 房主给整个房间开，`personal` 玩家只给自己开
- `permissions` 必须与实际使用的能力一致；声明了没用会报 `PLUGIN_PERMISSION_UNUSED`
- 路径必须是插件文件夹内的相对路径：不能 `..`、不能以 `/` 开头、不能是 URL 或隐藏路径

## 3. 类别怎么选

| 类别 | 用途 | 典型权限 / 字段 | 会影响对局吗 |
|---|---|---|---|
| `cosmetic` | 头像、立绘、模型、图标、语音、音效、音乐、主题、皮肤 | `assets.override` / `assets.add` / `theme` | 不影响数值，但房间 `vs` 会变 |
| `content` | 数据补丁、新干员、新棋子、新羁绊、DSL、规则开关 | `data.patch` / `data.add` / `dsl` | 会，房间 `cs` 变 |
| `ui` | 对局内界面插槽 | `ui` | 不影响对局 |
| `script` | 沙箱脚本、SDK kit、meta/prep 钩子 | `sim.code` / `meta.code` | 会，需要 `SP_PLUGIN_SCRIPTS` |
| `trusted` | 原生信任代码 | 由 owner 审查和 pin | 会，风险最高 |
| `lang` | 语言包 | 语言文件 | 不影响对局 |

一个插件只选一个类别。一个作品想同时带外观和玩法时，拆成多个插件，用 `requires` 组合，不要混类别。

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

- 图片：`.png` / `.jpg` / `.webp`，不支持 SVG
- 音频：`.mp3` / `.ogg`
- 新条目用 `assets.add`，改已有条目用 `assets.override`
- 借用安装里已有的图：`{ "ref": "char_102_texas" }` 这类引用，不复制文件

### 4.2 Spine

Spine 必须导出 **3.8 二进制 `.skel`**，`.skel`、`.atlas` 和贴图放在同一目录：

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

不要手写 `animations` / `events` / `hits` / `bounds`；`pack` 会从模型里读。改模型后必须重新 `pack`。

### 4.3 主题 / 公告 / 皮肤

- 主题：`permissions: ["theme"]` + `theme.vars`，只允许本安装定义过的颜色、时间和缓动 token
- 公告：`notices`，纯文本；与房间是否选中无关，所有已加载插件公告都会显示
- 皮肤：`skins`，具体字段见 `docs/SKINS.md`

### 4.4 特效（FX）

插件特效放在 `assets.fx`（外观插件，或内容插件自己的 `assets`）。两种常见做法：

1. **Flipbook**（序列帧）：`assets.fx.flipbooks` + `assets.fx.bind`，适合不需要官方粒子系统的简单技能 / 命中特效。
2. **编译特效**：`"index": "fx/index.json"`，格式是官方提取格式的受控子集；支持粒子、billboard / stretch 渲染、`FollowMountPoint` 跟随骨骼、`atlas: true` 纹理图集，以及 Lite 档半尺寸纹理。

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

绑定位置：`skillStart` / `skillLoop` / `skillEnd` / `attack` / `hit` / `projectile`。效果 id 必须在同一个插件的 FX bundle 里；单位必须是本插件或声明依赖的单位，不能覆盖官方单位。Lite 档会自动使用半尺寸纹理和一半粒子量，不需要作者另做一套。

`FollowMountPoint` 让武器光效 / 粒子跟随单位骨骼；`atlas: true` 只在能装进 2048×2048 时生效。完整字段、限制和校验规则见 [`PLUGINS.md`](PLUGINS.md) §10 的 FX 部分与 [`design/vfx-format.md`](design/vfx-format.md)；改完一定重新 `check --strict` 和 `pack`。

## 5. 内容插件

内容插件通过声明式数据进入 `cs`，不要直接改 `data/*.json`。

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

支持的数据文件以 `PLUGINS.md` 的补丁表为准。数值会做官方边界检查；超界、未知 id、跨插件命名空间写入会被拒绝。

### 5.2 新干员

```bash
node tools/plugin.mjs new operator my-operator --target 德克萨斯
```

模板会生成 `operators/*.json`，常见字段：

- `charId`：`char_x_<namespace>_<name>` 这类插件命名空间 id
- `profession` / `subProfessionId` / `position` / `rarity`
- `as`：`"chess"`、`"diy"` 或 `"both"`
- `forms.normal` / `forms.elite`：`stats`、`rangeGrid`
- `skills`：`skillId`、`duration`、`spCost`、`initSp`、`bb`
- `kit`：`generic`、`{ "ref": "<official kit>" }` 或 `{ "dsl": ... }`
- `art`：`{ "ref": "<official art key>" }` 借用安装里的美术

6★ 且声明在 `operators` 里的单位按自选处理；低星按商店棋子处理。具体规则和字段保留表见 `PLUGINS.md`。

### 5.3 DSL

DSL 用于不写 JavaScript 的技能/天赋：

```json
{
  "permissions": ["dsl"],
  "dsl": ["dsl/income.json"],
  "operators": ["operators/guard.json"]
}
```

干员记录里用 `"kit": { "dsl": true }` 或模板生成的结构。DSL 必须通过 `validateDsl` 和内容集构建；不要在失败时偷偷换成 generic kit。

### 5.4 Boss、波次和移动逻辑

- Boss / 波次 / 敌人分别写 `bosses`、`waves`、`enemies` 记录；字段和引用检查见 `PLUGINS.md` §10。
- **移动、阻挡、技能状态机是模拟引擎行为，不是普通数据字段。** 例如黑蛇的“可被阻挡但仍移动”是引擎 kit 里的 `profile.moveWhileBlocked`，不是插件 JSON 能声明的字段；平民的不可阻挡也是独立规则。
- 需要新机制时：优先用现有字段；其次写 `script` 插件（SDK 限定的钩子）；最后才是在 fork 引擎中加通用能力。不要在 `content` 插件里塞服务端逻辑。
- 新 Boss 必须实际跑一场：路线、共享 Boss 血量、波次、阻挡、召唤物、BGM / FX 都要看；Boss 轮和普通轮的事件不同。

## 6. UI 插件

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

- iframe 页面必须在 `<html>` 上写 `color-scheme: dark`
- 页面只能通过只读 postMessage 接口读状态；不能直接发对局意图
- 同一个槽位有多个插件时，对局里用标签切换
- 支持的位置和 API 见 `PLUGINS.md` §32.8 / `PLUGIN-API.md`

## 7. 脚本插件

脚本插件是沙箱代码，不是普通数据插件。

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

- 服务器设置 `SP_PLUGIN_SCRIPTS=sandbox`（或 trusted 模式）
- 房间选中该插件，或内容插件通过 `requires` 带入
- 房间面板现在会直接列出已加载的 `script` / `trusted` 插件；选中 `script` 显示「沙箱脚本」，选中 `trusted` 会先触发风险同意
- 锁文件 `plugin.lock.json` 有效
- `sandbox` 不需要 owner pin 或玩家 consent；`trusted` 需要 owner pin 和每个玩家的 consent

注意：

- 入口只能 import `sp:sdk@1`
- 状态必须按 battle 保存，使用 seeded RNG 和确定性数学
- 回调预算不能中断无限循环；服务器和 Worker 有 watchdog，但不要依赖它
- 不要手改 `plugin.lock.json`
- 脚本不会被 `check` 或 `import-forge` 执行

## 8. 语言包

语言包是独立类别的个人插件，通常由 `tools/build-i18n` / 语言包流程生成。普通插件需要自己的文案时优先用 `i18n` 字段，不要为每个插件造一个语言包。

## 9. 兼容性

本分支版本是 `0.4.0`。

- `lang` / `cosmetic` / `ui`：`app` 范围匹配 `0.3.2` 也算兼容
- `content` / `script` / `trusted`：默认严格要求 `0.4.0`
- owner 可在 `plugins/config.json` 设 `"allowIncompatible": true`，或用插件 id 列表（如 `["old-content"]`）显式放行已审查的旧内容/脚本；仍走数据校验和脚本权限
- 房间内容插件会产生 `cs`；外观插件只产生 `vs`，不改变对局
- 插件文件改动后，房间需要“重新应用”才生效

## 10. 调试与测试

```bash
node tools/plugin.mjs list
node tools/plugin.mjs check my-plugin
node tools/plugin.mjs check my-plugin --strict --json
node tools/plugin.mjs test my-script
node tools/plugin.mjs pack my-plugin --zip
```

服务端：

- `/admin` →「插件与内容」：只读兼容性、skipped、warnings、房间 `cs` / `vs`
- `/studio/`：浏览器工作台，可预览、试跑、打包
- `SP_TEST_MODE=1`：测试控制台，测试对局默认不计入统计

测试建议：

- 数据/DSL：`test/plugins/` 下的内容集、规则、DSL 测试
- UI：`test/ui/*.e2e.test.js`
- 脚本：`test/plugins/script*.test.js` + `tools/plugin.mjs test`
- 真实浏览器：`SP_E2E=1` + `test/ui/plugins.e2e.test.js`、`ui-plugins.e2e.test.js`、`plugins-content-script.e2e.test.js`

## 11. 打包与发布

```bash
node tools/plugin.mjs check my-plugin --strict
node tools/plugin.mjs pack my-plugin --zip
```

生成：

- `plugins/my-plugin/plugin.lock.json`
- `plugins/_dist/my-plugin-1.0.0.zip`

发布前确认：

- 版本号已递增
- 作者、许可证、素材来源已填
- 没有官方游戏素材
- `check --strict` 干净
- 脚本插件已重新 pack
- 在测试服务器上实际开一局

## 12. 常见问题

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `PLUGIN_CLASS` | `class` 缺失或拼错 | 只用允许的类别 |
| `PLUGIN_PERMISSION_UNUSED` | 声明了没用的权限 | 删掉权限或补上对应内容 |
| `PLUGIN_FILE_OUTSIDE` | 路径 `..` / 绝对路径 / URL | 改成插件内相对路径 |
| `PLUGIN_ASSET_*` | 图片/音频/Spine 类型或路径不对 | 对照模板和 `PLUGINS.md` |
| `PLUGIN_SCRIPT_*` | 脚本未启用、锁无效、SDK import 不合法 | 看错误码 + `PLUGIN-API.md` |
| 房间看不到内容插件 | 类/scope/权限/兼容性不对 | 看 `/admin` 的 skipped 和 warnings |
| 改了文件房间没变 | 房间持有旧内容集 | 房主点“重新应用” |
| 内容集构建失败 | 数据补丁/干员/DSL 有问题 | 先 `check`，再看 contentSet 错误 |

## 13. 不要做

- 不要把 `data/*.json` 当插件输入直接改
- 不要把官方游戏素材打进插件
- 不要手写锁文件
- 不要用 `trusted` 绕过数据校验
- 不要在 `content` 插件里塞任意服务端逻辑；需要逻辑就用 DSL，或明确写 `script` 并接受沙箱/信任审查
- 不要让一个插件同时承担外观和玩法；拆开用 `requires` 组合
