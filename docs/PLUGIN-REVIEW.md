# 插件系统评审（2026-10-19）

本文是对当前合并后的插件 / Forge 体系的工程评审：架构、能力边界、安全模型、测试质量、已知风险和后续建议。
它不是规范；规范仍是 [`PLUGINS.md`](PLUGINS.md)、[`PLUGIN-API.md`](PLUGIN-API.md) 和 [`PLUGIN-DSL.md`](PLUGIN-DSL.md)。

## 1. 结论摘要

- 插件体系已经**架构完整、边界清楚、测试扎实**，达到可验证状态。
- 普通 `cosmetic` / `content` / `ui` 插件的风险可控。
- 最大风险集中在 **`script` / `trusted` 插件**：它们是执行第三方代码，不是普通数据扩展。
- 当前自动化测试已经覆盖绝大多数服务端 / 客户端路径；**真实浏览器 E2E 与真实客户端资源抽取仍是验证盲区**。

## 2. 架构

核心模型是“**一个 manifest + 多种 class + 两种身份**”：

| class | 能做什么 | 作用域 |
|---|---|---|
| `lang` | UI / 游戏文本语言包 | 本机 |
| `cosmetic` | 立绘、Spine、主题变量、音频、皮肤 | 房间或本机 |
| `content` | 新干员、敌人、波次、关卡、模式、数据补丁 | 房间内容集 |
| `script` | 战斗 / 对局逻辑，SDK + SES 沙箱 | 房间 |
| `ui` | iframe 沙箱界面组件 | 本机 |
| `trusted` | 原生页面 / 服务端代码 | 房间，owner 严格授权 |

两种身份：

- **`cs`（content set）**：content / script 插件的数据身份。房间内所有玩家必须使用同一份内容集，客户端先校验哈希再运行。
- **`vs`（visual set）**：cosmetic 插件的外观身份。它只改变外观，不进入 `cs`，不影响战斗确定性。

## 3. 数据流

### content / script

```text
插件目录
  -> registry 扫描 / manifest 校验
  -> host 在房间中启用
  -> buildContentSet 组合数据 + 校验 + 计算 cs
  -> /cs/<cs16>/... 提供给客户端
  -> 客户端下载 / 校验 / setContent
  -> runner 只接受当局 cs
  -> Match 使用该房间的数据
```

### cosmetic

```text
插件 overlay
  -> /vs/<vs16>/overlay.json
  -> 客户端 cosmetics.apply
  -> data/assets 视图
  -> 渲染器按 skin / theme / audio 读取
```

### ui

```text
插件页面
  -> /p/<id>/<hash8>/<entry>
  -> iframe sandbox="allow-scripts"（无 allow-same-origin）
  -> postMessage 只读 / 有配额 / 不能发对局意图
```

### script / trusted

```text
plugin.json + entry.sim/meta
  -> 权限检查 / 文件哈希 / owner gate
  -> script: SDK + SES Compartment + 预算 + 超时
  -> trusted: 原生代码，完全信任
```

## 4. 安全模型

### 已做的防护

- manifest 路径限制在插件目录内，拒绝 traversal / 外部链接。
- 文件类型、大小、数量限制。
- `script` 使用独立 SDK，不能直接 `fetch` / `process` / `globalThis` / `Date` / `Math.random`。
- 词法扫描 + SES Compartment + 每次 setup 的权限隔离。
- 每个插件独立的动作预算（默认 8000），超预算只停该插件。
- 脚本探测 5 秒超时，超时 SIGKILL。
- `trusted` 需要 owner 显式开关、SHA-256 pin、公网监听拒绝。
- 房间级脚本 / 信任插件需要玩家 consent。
- UI iframe `sandbox="allow-scripts"`，无 `allow-same-origin`，不能读站点 storage。
- UI postMessage 有来源、消息 shape、频率、存储配额限制。
- 客户端先校验 content set 的 SHA-256 再解码。
- `cs` 固定后，runner 不接受另一套内容成为当局权威。

### 仍需正视的风险

- **`trusted` 不是沙箱**：原生代码可以阻塞页面、读允许目录、访问网络。
- **SES / V8 本身可能有漏洞**，不是绝对安全边界。
- **故意 desync**：插件可以尝试让客户端和服务端结果不一致；现有校验能挡一部分，但不是形式化证明。
- **资源耗尽**：Worker / 浏览器内存、CPU 仍可能被打满。
- **Worker 逃逸后的同源 IndexedDB** 是残余风险。
- **Firefox / Safari 没有专门沙箱验证**，目前主要覆盖 Chrome。
- **公网部署脚本插件风险最高**，建议容器 / 低权限账号 / 出站网络限制。

结论：

- `cosmetic` / `ui`：风险低。
- `content`：风险中等，主要是内容集一致性与数据校验。
- `script`：需要信任管理和真实 E2E。
- `trusted`：应按“运行第三方原生代码”对待。

## 5. 测试质量

当前插件相关测试覆盖：

- manifest / registry / identity / visual / contentSet / rules / offers
- content set 的哈希、下载、校验、runner 拒绝另一套 `cs`
- UI iframe 的 CSP、来源、配额、槽位
- 脚本 SDK 的冻结 API、预算、超时、拒绝路径
- Forge 导入：皮肤、数值、混合包、脚本、ZIP、符号链接、路径穿越
- setup / 本地官方美术提取
- 全量 CI：**8191 tests / 8155 pass / 0 fail**

已验证：
- **浏览器 E2E**：`SP_E2E=1` + 真实 Chrome 跑了 9 个插件用例，全部通过：`plugins.e2e.test.js` 的 3 个 cosmetic（房间插件、个人插件、局内切换）、`ui-plugins.e2e.test.js` 的 UI 插槽，以及 `plugins-content-script.e2e.test.js` 的 content 内容集、sandbox script 依赖、独立 script 直接选择、真实 Forge 包导入和 trusted consent 链路。
- **E2E 发现并修复**：房间内容集的 `kittedExtra` 之前没有从 `resolveContent` 带到 `room.state.content`，导致内容插件新增的 自选 干员在页面上拿不到；`server/lobby.js` 已补上并加了单元测试。
- **真实客户端抽取**：用 `D:\明日方舟\Hypergryph Launcher` 的 CN 客户端跑了 `extract.py --only mesh/trap_110`，成功写出 6 个文件并合并 manifest；完整的 `--plugin-art` 抽取仍需一次长跑验证。

## 6. 产品风险

1. **同 charId 双角色**
   - 官方 `op-*` 自选和自造商店干员现在是两套角色，功能正确，但玩家可能困惑“为什么同名干员有两个入口、技能不同”。
   - 需要在 UI 上明确区分“商店形态 / 官方自选形态”。

2. **插件管理复杂度**
   - 房间插件、个人插件、UI 插件、脚本插件、信任插件混在一个设置体系里。
   - 普通玩家很难判断“这个插件会不会影响对局公平性”。
   - 建议在面板上固定标注：外观 / 改变玩法 / 脚本沙箱 / 原生信任。

3. **Forge 导入不是全量转换**
   - 只转换能映射的部分；脚本、服务端逻辑、召唤、部分记录类型会拒绝。
   - 需要在导入报告里更突出“哪些没导入、为什么”，避免玩家以为完整兼容；完整矩阵见 [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md)。

4. **本地官方美术是可选能力**
   - setup 已经能发现并提取，但依赖本机客户端和 Python / UnityPy。
   - 缺资源时是 fallback，不会坏，但体验不一致。

## 7. 主线 0.3.x 兼容层（2026-10-19）

主线 0.3.1 的插件模板通常写 `"app": ">=0.3.0 <0.4.0"`，而本分支是 0.4.0。为兼容主线插件，manifest 兼容检查增加了一层**按 class 限定**的兼容：

- `PLUGIN_COMPAT_APP = '0.3.2'`
- `PLUGIN_COMPAT_CLASSES = { lang, cosmetic, ui }`
- 对这三个 class：`app` 范围匹配 0.4.0 **或** 0.3.2 都算兼容
- `content` / `script` / `trusted`：仍然严格要求匹配 0.4.0，避免 0.3.x 的数据或执行代码未经审查直接进入对局

实际效果：

| 主线插件 | 结果 |
|---|---|
| `lang` / `cosmetic` / `ui`，`app <0.4.0` | 加载，并使用 0.3.x 兼容判断；仍会走自己的 manifest / 文件校验 |
| `content` / `script` / `trusted`，`app <0.4.0` | 默认标记 `compatible: false`，内容集不会接受；owner 可在 `plugins/config.json` 设 `allowIncompatible: true` 或插件 id 列表显式放行已审查的内容/脚本，并在房间 warning 中记录；trusted 仍需原有 owner / consent 门 |
| API level 1 / 2 | 都支持（`min: 1`, `current: 2`） |

`allowIncompatible`（全局布尔或按插件 id 列表）只改变内容集的兼容性准入，不跳过数据校验、脚本权限、trusted pin 或 consent；未显式开启时行为与之前一致。

插件目录的 `entryStatus` 也使用同一规则，因此主线 0.3.x 的 cosmetic/ui/lang 不会在安装目录里被误标为 incompatible。

测试：`test/plugins/manifest.test.js` 的 `0.3.x app compatibility` 与 `mainline 0.3.x templates` 用例；`test/plugins/contentSet.test.js` 的 `allowIncompatible` 用例。

## 8. 运营台整合（Phase 1，已实现）

运营台 `/admin` 已加入只读的「插件与内容」页：

- 已安装插件：id / 名称 / class / 版本 / 兼容 / app / api / 状态 / scope / 内容 / 脚本或原生信任 / 大小
- 服务器策略：`rooms`、`allow`、`default`、`classes`、`maxSets`、`allowIncompatible`
- 房间内容：`cs`、`vs`、`modeId`、插件列表、脚本 / 信任状态、trusted consent
- 「兼容性与诊断」区：列出 skipped 插件和 warnings，兼容列直接显示 `compatible`，悬停可看 `app` 范围
- 「Forge 导入」区：来源包、产品、skipped / assumed 数量、是否部分导入、导入时间（只读）
- 通知页新增只读「插件公告」区，与服务器通知分开标记

后端 `buildSnapshot` 现在携带 `plugins` 只读快照；`/admin/api/state` 的 `rooms[]` 增加 `content` 字段。
写操作、trusted pin 和插件文件仍只允许 owner 在本机处理，运营台不提供远程代码执行入口。

## 9. 建议的下一步

优先级从高到低：

1. **扩大 content / script 覆盖**：content、sandbox script、trusted consent 和真实 Forge 导入包都已通过真实浏览器用例；下一步增加多插件冲突、失败恢复和重连。
2. **跑完整的 `--plugin-art` 抽取**：确认官方干员美术、VFX 和插件引用在真实客户端上能一次合并完成。
3. **写一份面向玩家的插件风险说明**：外观 / 玩法 / 脚本 / 信任四级。
4. **trusted 插件生产策略**：默认关闭，公网禁用，容器化运行。

> 持续跟踪的插件问题、状态和排期见 [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md)。
