# 文档系统 / Documentation System

> **状态**：维护中的文档总入口（2026-11-02 整体重新梳理）。
> 新增或移动文档时，按 §7.3 的清单登记：**本页 → [`QUERY-INDEX.md`](QUERY-INDEX.md) → [`../AGENTS.md`](../AGENTS.md)
> → [`AI-AGENT.md`](AI-AGENT.md) §7 → [`HANDOVER.md`](HANDOVER.md) 参考表**。

本页回答三个问题：

1. **不同角色应该先读什么；**
2. **哪一份文档是权威来源，哪一份只是解释、历史或草案**（同一话题有多份时，§4 直接给结论）；
3. **修改代码后，文档应该同步改哪里。**

找不到东西时不要翻目录，直接按问题查 [`QUERY-INDEX.md`](QUERY-INDEX.md)（14 个分区的「问题 → 文档 / 代码文件」表）。

---

## 1. 入口层

| 入口 | 面向 | 内容 |
|---|---|---|
| [`../AGENTS.md`](../AGENTS.md) | **AI 代理**（自动加载） | 硬规则、布局判定、命令、护栏 |
| [`AI-AGENT.md`](AI-AGENT.md) | **AI 代理**（展开版） | 工作循环、代码地图、任务配方、测试矩阵、**文档同步矩阵 §7** |
| [`DEVELOPER.md`](DEVELOPER.md) | **人类开发者** | 启动、架构、开发流程、调试、发布、文档地图 |
| [`RULES.md`](RULES.md) | **规则查阅 / 改规则** | 权威顺序、规则总览、规范文档地图、改规则流程 |
| [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | **插件开发者** | 选模板、manifest、类别、测试、打包、发布 |
| [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | **维护 / 运维（房间插件）** | 内容集构建流程、四层缓存的键、环境变量、排障步骤、2026-11 踩坑记录 |

> 不写代码、只想换图 / 模型 / 语音的读者看 [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md)；Forge 包作者看
> [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md)。

> **目录角色先说清楚：** `D:\DOTK\Stronghold-Protocol` 是**项目本体 / 运行目录**；`D:\DOTK\_merge-scratch` 是
> **单独的 git store**（提交历史 + 跟踪文件镜像），不是临时目录。桌面双树的同步方向是
> **store → remotes → 项目本体**；`D:\DOTK\.git` 是空的父级仓库，不要在项目本体里直接提交。

---

## 2. 按角色选择阅读顺序

| 角色 | 先读 | 再读 |
|---|---|---|
| 第一次接手项目的维护者 | [`DEVELOPER.md`](DEVELOPER.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) → [`QUERY-INDEX.md`](QUERY-INDEX.md) → [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| AI 代理 | [`../AGENTS.md`](../AGENTS.md) | [`AI-AGENT.md`](AI-AGENT.md) → [`QUERY-INDEX.md`](QUERY-INDEX.md) |
| 核心开发 / 引擎 | [`DEVELOPER.md`](DEVELOPER.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) | [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) |
| 规则查阅 / 改规则 | [`RULES.md`](RULES.md) → [`DESIGN.md`](DESIGN.md) | [`design/`](design/) → [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) |
| 内容作者（盟约 / 干员 / 策略） | [`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | [`NEW-OPERATOR.md`](NEW-OPERATOR.md) → [`DATA.md`](DATA.md) |
| 插件作者（不写代码） | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | [`keel/FEATURES.md`](keel/FEATURES.md) → [`PLUGINS.md`](PLUGINS.md) 相关章节 |
| 插件开发者（manifest / DSL / 脚本 / UI） | [`keel/FEATURES.md`](keel/FEATURES.md) → [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) | [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) → [`PLUGIN-API.md`](PLUGIN-API.md) / [`PLUGIN-DSL.md`](PLUGIN-DSL.md)（v2 兼容参考） |
| 插件运维 / 排查（房间变慢、构建失败、插件不加载） | [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) → [`PROJECT-STATE.md`](PROJECT-STATE.md) |
| Forge 包作者 | [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) |
| 运维 / 发布 | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) → [`DEPLOY.md`](DEPLOY.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) → [`RELAY.md`](RELAY.md) → [`WINDOWS.md`](WINDOWS.md) |
| 玩家 / 规则查阅 | [`PLAYING.md`](PLAYING.md) | [`RULES.md`](RULES.md) → [`DESIGN.md`](DESIGN.md) |

---

## 3. 分层：每类文档的归属

状态标签见 §7.2。**同一话题出现多份时，先看 §4 再看表。**

### 3.1 规范层（权威定义，代码必须符合）

| 文档 | 定义什么 | 状态 |
|---|---|---|
| [`DESIGN.md`](DESIGN.md) → [`design/`](design/) | 现行游戏规则（章节索引 + 当前规则） | 规范 |
| [`SIM.md`](SIM.md) | 战斗引擎：单位、buff、伤害、技能、职业 | 规范 |
| [`META.md`](META.md) | 对局 / 匹配 / 回合 / 联防 / 视图 | 规范 |
| [`DATA.md`](DATA.md) | `data/*.json` 字段与生成方式 | 规范 |
| [`ASSETS.md`](ASSETS.md) | 素材来源、布局、manifest、特效、授权、中继 | 规范 |
| [`keel/FEATURES.md`](keel/FEATURES.md) · [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) · [`keel/CONTRACTS.md`](keel/CONTRACTS.md) · [`keel/RUNTIME.md`](keel/RUNTIME.md) · [`keel/COMPAT-V2.md`](keel/COMPAT-V2.md) | **当前插件规范**（Keel / manifest 3）与 v2 兼容 | 规范 |
| [`PLUGINS.md`](PLUGINS.md) · [`PLUGIN-API.md`](PLUGIN-API.md) · [`PLUGIN-DSL.md`](PLUGIN-DSL.md) | v2 兼容参考：六类插件、content set、脚本 SDK、DSL | 兼容规范 |

### 3.2 实现层（解释代码，允许代码先行后补）

| 文档 | 用途 | 状态 |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 代码地图、协议、数据流、安全网（**先看这页找文件**） | 参考 |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | 仓库地图、数据 / 素材流水线、测试的详细参考 | 参考 |
| [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | 中文开发手册与配方（长文） | 参考 |
| [`HANDOVER.md`](HANDOVER.md) | 详细接手 / 运维手册（入口仍以 `DEVELOPER.md` 为准） | 参考 |
| [`UI-HUB.md`](UI-HUB.md) | 主界面：经典大厅 / Hub、后台开关、`?ui=` 预览 | 当前 |
| [`SPECIAL-UI.md`](SPECIAL-UI.md) | 特殊 UI 版本（ark-proto PRTS 终端）的静态快照 | 参考 |
| [`I18N.md`](I18N.md) | UI / 游戏文本 / 服务器消息 / 新语言 | 参考 |
| [`SKINS.md`](SKINS.md) | 皮肤目录、选择器、本地时装提取、渲染回退 | 当前 |
| [`PACKS.md`](PACKS.md) | 内容包 / 语言包格式 | 兼容参考 |
| [`WINDOWS.md`](WINDOWS.md) | Windows 便携包 | 参考 |
| [`RELAY.md`](RELAY.md) | 外部服务器目录站（第三方站点，**不是**我们的美术中继；中继见 `ASSETS.md`） | 参考 |

### 3.3 指南 / 配方层

| 文档 | 用途 | 状态 |
|---|---|---|
| [`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | 盟约 / 策略 / 悬赏敌人 / CODEX / 3D 主题 | 指南 |
| [`NEW-OPERATOR.md`](NEW-OPERATOR.md) | 新增自造干员端到端配方 | 指南 |
| [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | 不写代码的插件作者：工作台、模板、换图、试玩、打包 | 指南（v2 教程） |
| [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | 写插件的开发者：结构、测试、发布 | 指南（v2 教程） |
| [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) · [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | Forge 包作者与兼容矩阵 | 指南 / 兼容 |
| [`BOT-STRATEGIES.md`](BOT-STRATEGIES.md) | AI 策略注册表、内置策略、每座位覆盖与重放 | 当前 |
| [`AI-STRATEGY.md`](AI-STRATEGY.md) | 示例顾问的打法、经济基准、证据分层（不改规则） | 参考 |
| [`EXTERNAL-AI.md`](EXTERNAL-AI.md) | 外部 AI（sp-ai/1）与 LLM 适配器：配置、模式、安全边界 | 当前 |
| [`BALANCE.md`](BALANCE.md) | 难度模型与测量（官方数值） | 参考 |

### 3.4 运维 / 状态层（描述「现在」，不覆盖规范）

| 文档 | 用途 | 状态 |
|---|---|---|
| [`DEPLOY.md`](DEPLOY.md) | 防火墙、自启、反代、Docker、**环境变量表** | 参考 |
| [`AI-WORKFLOW.md`](AI-WORKFLOW.md) | 研究 → 修改 → 测试 → 合并 → 发布 → 部署的操作契约 | 当前 |
| [`PROJECT-STATE.md`](PROJECT-STATE.md) | 现在部署的 build、开关、备份、已知问题、部署日志 | 当前状态 |
| [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | 内容集构建：机制、四层缓存、环境变量、排障、踩坑 | 当前状态 |
| [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) | 仍未解决的插件问题、风险、排期 | 当前状态 |
| [`keel/NEXT.md`](keel/NEXT.md) · [`keel/REMAINING.md`](keel/REMAINING.md) | Keel 的检查点、剩余项与边界 | 当前状态 |
| [`TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) | trusted 类插件的生产隔离方案 | 部署参考 |

### 3.5 历史 / 决策层（记录「为什么」，不保证仍是当前行为）

| 文档 | 用途 | 状态 |
|---|---|---|
| [`MATCHMAKING.md`](MATCHMAKING.md) | 决策记录 §0–§49（账号、野排、自造干员、社区、§22 黑名单） | 历史 + 决策 |
| [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | 主线合并日志 + **永不合并清单 §0** | 历史 |
| [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) | 主线未并入清单（0.3.2 / 0.3.3）与建议顺序 | 状态 |
| [`history/`](history/) | 各版本规则修订（发布时的事实） | 历史 |
| [`keel/HISTORY.md`](keel/HISTORY.md) | Keel 的历史与决策 | 历史 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 发布记录 | 历史 |

### 3.6 草案 / 规划层（未批准，不能当承诺）

| 文档 | 用途 |
|---|---|
| [`PLUGIN-PLATFORM-PLAN.md`](PLUGIN-PLATFORM-PLAN.md) | 玩法插件平台改造草案 v0.1（未实施） |
| [`FUTURE-FEATURES.md`](FUTURE-FEATURES.md) | 评估过但暂不实现的较大功能 |
| [`BOND-BOLIVAR.md`](BOND-BOLIVAR.md) | 玻利瓦尔国家盟约初设（已实现原型，**未上线**） |
| **未提交**的 `PLUGIN-OPTIMIZATION-*.md` | 本地草案，只有提交后才进入文档链 |

### 3.7 插件专题（旁支：评审 / 运营 / 供应链）

| 文档 | 用途 | 状态 |
|---|---|---|
| [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | 商城、上传、审核、签名、镜像 | 运营参考 |
| [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) | 插件体系架构、边界、安全与测试评审 | 评审（非规范） |
| [`PLUGIN-RISKS.md`](PLUGIN-RISKS.md) | 玩家版风险说明 | 玩家文案 |
| [`PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) | 安装、更新、签名、哈希、供应链边界 | 运营参考 |
| [`PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) · [`PRTS-SOURCE-CODE-REMAINING.md`](PRTS-SOURCE-CODE-REMAINING.md) | 「PRTS 源代码」玩法插件的开发文档与 B–E 计划 | 实现记录 |

---

## 4. 同题多文档：以谁为准

| 话题 | 权威 | 解释 / 补充 | 历史 / 草案 |
|---|---|---|---|
| 新插件怎么写 | [`keel/FEATURES.md`](keel/FEATURES.md) · [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) · [`keel/CONTRACTS.md`](keel/CONTRACTS.md) | [`PLUGINS.md`](PLUGINS.md) / [`PLUGIN-API.md`](PLUGIN-API.md) / [`PLUGIN-DSL.md`](PLUGIN-DSL.md)（**v2 兼容参考**）· [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) / [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md)（教程） | — |
| 房间插件为什么慢 / 构建怎么工作 | [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | [`PLUGINS.md`](PLUGINS.md) §11、[`DEPLOY.md`](DEPLOY.md) 环境变量表 | [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) |
| 代码在哪个文件 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（地图） | [`DEVELOPMENT.md`](DEVELOPMENT.md) / [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md)（长文） | — |
| 现在线上是什么 | [`PROJECT-STATE.md`](PROJECT-STATE.md) | `DEPLOY.md`（怎么做） | [`../CHANGELOG.md`](../CHANGELOG.md)（发布历史） |
| 规则是什么 / 为什么这样 | [`DESIGN.md`](DESIGN.md) + [`design/`](design/) | [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) | [`history/`](history/) · [`MATCHMAKING.md`](MATCHMAKING.md)（决策记录） |
| 哪些东西合并时不能丢 | [`OUR-FEATURES.md`](OUR-FEATURES.md) | [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0（永不合并清单） | — |
| 素材 / 皮肤 / 语言 / 内容包 | [`ASSETS.md`](ASSETS.md) | [`SKINS.md`](SKINS.md) · [`I18N.md`](I18N.md) · [`PACKS.md`](PACKS.md) | — |
| AI 怎么打 | [`BOT-STRATEGIES.md`](BOT-STRATEGIES.md)（实现） | [`AI-STRATEGY.md`](AI-STRATEGY.md)（示例打法）· [`EXTERNAL-AI.md`](EXTERNAL-AI.md)（外部 LLM） | [`MATCHMAKING.md`](MATCHMAKING.md) |
| 难度数值 | [`BALANCE.md`](BALANCE.md) + `data/tuning.json`（`OUR-FEATURES.md` §11） | — | — |

---

## 5. 权威顺序

发生冲突时按以下顺序判断，不要用旧文档覆盖代码行为：

1. **代码 + 自动化测试**（最终事实）；
2. **规范层**（§3.1）：Keel 规范、`DESIGN` / `design/`、`SIM`、`META`、`DATA`、`ASSETS`、`PLUGINS` / `PLUGIN-API` / `PLUGIN-DSL`、`shared/protocol.js`；
3. **当前状态层**（§3.4）：`PROJECT-STATE`、`PLUGIN-BUILD`、`PLUGIN-BACKLOG`、`keel/NEXT`、`keel/REMAINING`；
4. **历史 / 决策层**（§3.5）：`MATCHMAKING`、`UPSTREAM-MERGES`、`UPSTREAM-DEV-TRIAGE`、`history/`、`CHANGELOG`；
5. **草案 / 路线图层**（§3.6）。

`history/` 记录的是**发布时的事实**，不是当前实现；当前行为请回到 §3.1 和代码。

---

## 6. 目录与命名约定

| 路径 | 是什么 |
|---|---|
| `docs/*.md` | 顶层文档（本页的表就是清单） |
| [`docs/design/`](design/) | `DESIGN.md` 的章节正文（当前规则） |
| [`docs/history/`](history/) | 各版本的规则修订（历史事实） |
| [`docs/keel/`](keel/) | Keel 插件系统：功能、架构、契约、运行时、manifest 3、兼容、流程、状态 |
| [`docs/research/`](research/) | 官方数据研究（可读 + 机器可读 JSON） |
| [`docs/special-ui/`](special-ui/) | 特殊 UI 的静态快照 |
| `docs/img/`、`docs/examples/` | 文档配图与示例（不进文档索引） |
| `plugins/README.md`、`plugins/AGENTS.md` | 在 `plugins/` 内制作插件的规则 |

**机器专属或易变的东西不进 `docs/`**：`AGENTS.md` 里写明 `.cache`、`var/`、`logs/` 等由 `.gitignore` 管；部署事实放 `PROJECT-STATE.md`（它本来就会频繁变）。

---

## 7. 文档维护规则

### 7.1 修改代码时

1. 更新**拥有该主题的规范文档**（§3.1）；
2. 改当前状态时，更新 [`PROJECT-STATE.md`](PROJECT-STATE.md) 和/或 [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md)；
3. 插件内容集 / 构建链路的改动：**必须**同步 [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md)（它是这一主题的唯一归属，见 `AI-AGENT.md` §7）；
4. 新增能力时，更新 [`QUERY-INDEX.md`](QUERY-INDEX.md) 与本页表格；
5. 改变用户可见行为、部署方式或测试门禁时，更新 `CHANGELOG.md` / `AI-WORKFLOW.md`；
6. 合并上游后，更新 [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) 与 [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md)。

### 7.2 状态标签

- **当前** — 现在就该按它做；
- **规范** — 字段 / 行为的权威定义；
- **参考** — 解释实现，允许代码先行后补；
- **指南** — 操作步骤（配方），不是行为定义；
- **历史** — 发布时记录，不保证仍是当前行为；
- **草案 / 路线图** — 未批准，不能当作承诺；
- **当前状态** — 有意保持短、可更新，允许频繁变化。

### 7.3 新增 / 移动文档的登记清单

1. 本页 §3（放到正确的层）与 §4（如果它取代或补充了某个话题）；
2. [`QUERY-INDEX.md`](QUERY-INDEX.md)（至少一条「问题 → 文件」）；
3. [`../AGENTS.md`](../AGENTS.md) §3 的速查表（如果是代理需要主动找到的）；
4. [`AI-AGENT.md`](AI-AGENT.md) §7 的同步矩阵（如果它成为某类改动的必改项）；
5. [`HANDOVER.md`](HANDOVER.md) 的参考表（长期文档）；
6. 运行 `node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js`。

### 7.4 文档门禁

| 测试 | 管什么 |
|---|---|
| `test/docs-links.test.js` | 每个 `.md` 的每个相对链接都必须存在 |
| `test/docs-consistency.test.js` | 钉住的文档（`DESIGN` / `design/` / `history/` / `SIM` / `META` / `DATA` / 根 `README` / `DEPLOY` / `PLAYING`）的措辞与代码一致 |
| `test/docs-paths.test.js` | `ARCHITECTURE.md` / `CONTRIBUTING.md` 里的路径 |
| `test/docs-mojibake.test.js` | 每个 `.md` 的编码 |

```bash
node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js
```

不要用 PowerShell 的 `Set-Content -Encoding utf8` 写中文 JSON / Markdown：它会加 BOM 或改变编码；用 UTF-8 无 BOM 写入。

---

## 8. 管理后台查看

部署并启用管理账号后，打开：

```text
/admin/docs
```

登录 `/admin` 后使用左侧「文档链」入口即可；它读取的是：

```text
/admin/api/docs          文档索引（标题、路径、分组、大小）
/admin/api/docs/file     选中文档的原始 Markdown
/admin/api/docs/asset    docs/ 内的图片
```

页面只读、需要 `/admin` 的同一个管理令牌；不会暴露 `server/`、`data/` 或 `public/` 里的代码文件。根目录只开放 `README.md`、`AGENTS.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`NOTICE.md`，另加 `plugins/README.md` 和 `plugins/AGENTS.md`，以及 `docs/` 下的 Markdown。
