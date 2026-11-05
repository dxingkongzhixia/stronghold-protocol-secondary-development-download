# 文档系统 / Documentation System

> **状态**：维护中的文档总入口（2026-11-05 按**读者**与**核心能力**重排；旧的分层表改为 §3 的图例）。
> 新增或移动文档时，按 §7.3 的清单登记：**本页 §2 → [`QUERY-INDEX.md`](QUERY-INDEX.md) → [`../AGENTS.md`](../AGENTS.md)
> → [`AI-AGENT.md`](AI-AGENT.md) §7 → [`HANDOVER.md`](HANDOVER.md) 参考表**。

本页回答三个问题：

1. **我是谁，该按什么顺序读**（§1）；
2. **某个能力（规则 / 引擎 / 插件 / 测试 / 上线…）的权威文档是哪份**（§2、§4）；
3. **改了代码，文档要同步改哪里**（§7）。

找不到东西时不要翻目录，直接按问题查 [`QUERY-INDEX.md`](QUERY-INDEX.md)。

---

## 1. 两条读者路径

### 1.1 真人开发者（Human）

| 你是谁 / 要做什么 | 先读 | 再读 | 深入 |
|---|---|---|---|
| **第一次接手项目** | [`DEVELOPER.md`](DEVELOPER.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) | [`DEVELOPMENT.md`](DEVELOPMENT.md) · [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) · [`HANDOVER.md`](HANDOVER.md) |
| **改规则 / 数值** | [`RULES.md`](RULES.md) | [`DESIGN.md`](DESIGN.md) → [`design/`](design/) | [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) · [`history/`](history/) |
| **改引擎 / 对局流程** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | [`SIM.md`](SIM.md) / [`META.md`](META.md) | [`DATA.md`](DATA.md) · [`BALANCE.md`](BALANCE.md) |
| **做内容（干员 / 盟约 / 敌人）** | [`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | [`NEW-OPERATOR.md`](NEW-OPERATOR.md) | [`DATA.md`](DATA.md) · [`PLAYING.md`](PLAYING.md) |
| **做插件（不写代码）** | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | [`keel/FEATURES.md`](keel/FEATURES.md) | [`PLUGINS.md`](PLUGINS.md)（v2 兼容参考） |
| **做插件（写代码 / Keel）** | [`keel/QUICKSTART.md`](keel/QUICKSTART.md) | [`keel/FEATURES.md`](keel/FEATURES.md) → [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) | [`keel/MODULES.md`](keel/MODULES.md) → [`keel/CONTRACTS.md`](keel/CONTRACTS.md) → [`keel/RUNTIME.md`](keel/RUNTIME.md) |
| **改前端 / 手机端** | [`MOBILE-UI.md`](MOBILE-UI.md) | [`UI-HUB.md`](UI-HUB.md) | `public/css/devices.css` · [`SPECIAL-UI.md`](SPECIAL-UI.md) |
| **测试 / 修红灯** | [`TESTING.md`](TESTING.md) | [`AI-AGENT.md`](AI-AGENT.md) §6（速查） | `.github/workflows/ci.yml` · `tools/golden.mjs` |
| **发布 / 上线 / 回滚** | [`AI-WORKFLOW.md`](AI-WORKFLOW.md)（部署顺序唯一出处） | [`DEPLOY.md`](DEPLOY.md) → [`PROJECT-STATE.md`](PROJECT-STATE.md) | [`RELAY.md`](RELAY.md) · [`WINDOWS.md`](WINDOWS.md) · [`TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) |
| **只想玩 / 查规则** | [`PLAYING.md`](PLAYING.md) | [`RULES.md`](RULES.md) | [`DESIGN.md`](DESIGN.md) |

### 1.2 AI Agent 开发者

| 阶段 | 读什么 | 说明 |
|---|---|---|
| **入口（自动加载）** | [`../AGENTS.md`](../AGENTS.md) | 硬规则、双树布局、命令、护栏；**先按它判断自己在哪棵树** |
| **展开手册** | [`AI-AGENT.md`](AI-AGENT.md) | 工作循环 §5、测试矩阵 §6、**文档同步矩阵 §7**、收尾清单 §10 |
| **找文件 / 找话题** | [`QUERY-INDEX.md`](QUERY-INDEX.md) | 「问题 → 文档 → 代码文件」 |
| **动手前的规则** | [`RULES.md`](RULES.md) → [`DESIGN.md`](DESIGN.md) | 规范优先于历史文档 |
| **测试与门禁** | [`TESTING.md`](TESTING.md) | golden 归因、CI 三个 job、已知不稳定项 |
| **不能丢 / 不能并** | [`OUR-FEATURES.md`](OUR-FEATURES.md) · [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 | fork 独有机制 + 永不合并清单 |
| **合并上游** | [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) → [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | 先看台账与 §9 清单，再逐条自研；永不整支合并 |
| **发布 / 上线** | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) §(d) | 通知 → 备份 → 上传 → 重启 → 验证；须 owner 点头 |
| **当前线上是什么** | [`PROJECT-STATE.md`](PROJECT-STATE.md) | build / 开关 / 备份 / 已知问题 |

> 代理的默认阅读顺序：`AGENTS` → `AI-AGENT` → `QUERY-INDEX` → 本页 §2 对应能力 → 领域文档。
> 不要用历史文档覆盖代码行为；冲突时按 §5 的权威顺序。

---

## 2. 核心能力地图

> 每节三列：**权威**（行为定义）/ **实现**（解释代码）/ **状态 · 历史 · 计划**。
> 同一话题有多份时，§4 直接给"以谁为准"。

### 2.1 游戏规则与设计

| 权威 | 实现 | 状态 / 历史 |
|---|---|---|
| [`DESIGN.md`](DESIGN.md) → [`design/`](design/)（现行规则章节） | [`SIM.md`](SIM.md)（战斗）· [`META.md`](META.md)（对局/匹配） | [`history/`](history/)（各版本修订） |
| [`RULES.md`](RULES.md)（规则入口 + 权威顺序 + 改规则流程） | [`DATA.md`](DATA.md)（字段与生成） | [`MATCHMAKING.md`](MATCHMAKING.md)（决策记录 §0–§49） |
| [`PLAYING.md`](PLAYING.md)（玩家可读规则） | — | [`BOND-BOLIVAR.md`](BOND-BOLIVAR.md)（草案，未上线） |

### 2.2 引擎、代码与平衡

| 内容 | 文档 |
|---|---|
| 代码地图 / 协议 / 数据流 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 仓库地图 / 数据·素材流水线 / 测试运行 | [`DEVELOPMENT.md`](DEVELOPMENT.md) · [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md)（中文长文） |
| 战斗引擎（单位 / buff / 伤害 / 技能 / 职业） | [`SIM.md`](SIM.md) |
| 对局与匹配引擎（回合 / 联防 / 视图） | [`META.md`](META.md) |
| 数据生成与字段 | [`DATA.md`](DATA.md) |
| 难度模型与测量 | [`BALANCE.md`](BALANCE.md) + `data/tuning.json` |

### 2.3 插件系统

| 主题 | 权威 | 实现 / 教程 | 状态 · 运维 |
|---|---|---|---|
| **当前规范（Keel / manifest 3）** | [`keel/FEATURES.md`](keel/FEATURES.md) · [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) · [`keel/CONTRACTS.md`](keel/CONTRACTS.md) · [`keel/RUNTIME.md`](keel/RUNTIME.md) | [`keel/ARCHITECTURE.md`](keel/ARCHITECTURE.md) · [`keel/MODULES.md`](keel/MODULES.md) | [`keel/NEXT.md`](keel/NEXT.md) · [`keel/REMAINING.md`](keel/REMAINING.md) · [`keel/HISTORY.md`](keel/HISTORY.md) |
| **v2 兼容参考** | [`PLUGINS.md`](PLUGINS.md) · [`PLUGIN-API.md`](PLUGIN-API.md) · [`PLUGIN-DSL.md`](PLUGIN-DSL.md) | — | [`keel/COMPAT-V2.md`](keel/COMPAT-V2.md) |
| **上手** | — | [`docs/keel/README.md`](keel/README.md) · [`keel/QUICKSTART.md`](keel/QUICKSTART.md) · [`keel/WORKFLOW.md`](keel/WORKFLOW.md) | [`keel/DEBUGGING.md`](keel/DEBUGGING.md) |
| **教程（人）** | — | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md)（不写代码） · [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md)（写代码） | — |
| **内容集构建（性能 / 缓存 / 子进程）** | [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md)（**唯一归属**） | [`PLUGINS.md`](PLUGINS.md) §11 | [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) |
| **兼容 / 包格式** | [`PACKS.md`](PACKS.md) · [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | — |
| **运营 / 审核 / 风险** | — | — | [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) · [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) · [`PLUGIN-RISKS.md`](PLUGIN-RISKS.md) · [`PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) |
| **fork 专属：PRTS「源代码」** | [`PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) | — | [`PRTS-SOURCE-CODE-REMAINING.md`](PRTS-SOURCE-CODE-REMAINING.md) |
| **平台改造草案** | — | — | [`PLUGIN-PLATFORM-PLAN.md`](PLUGIN-PLATFORM-PLAN.md)（未实施） |

> 本地未提交的 `PLUGIN-OPTIMIZATION-*.md` 属于个人草案，**不在**这条链上；提交后才按 §7.3 登记。

### 2.4 测试系统

| 内容 | 文档 / 入口 |
|---|---|
| **唯一入口：目录、命令、golden 规则、CI、已知不稳定** | [`TESTING.md`](TESTING.md) |
| 速查表（层级 / 命令 / 何时必须） | [`AI-AGENT.md`](AI-AGENT.md) §6 |
| CI（`test` / `tooling` / `mobile-audit`） | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| golden 语料与重算 | `test/golden/*.json` · `tools/golden.mjs` |
| 手机矩阵 | [`MOBILE-UI.md`](MOBILE-UI.md) §7 · `npm run check:mobile` |

### 2.5 上线、发布与运维

| 内容 | 文档 | 地位 |
|---|---|---|
| **部署顺序与硬规则**（通知 → 备份 → 上传 → 重启 → 验证；须 owner 点头） | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) §(d) | **唯一出处** |
| 防火墙 / 自启 / 反代 / Docker / 环境变量表 | [`DEPLOY.md`](DEPLOY.md) | 参考 |
| 当前线上 build / 开关 / 备份 / 已知问题 | [`PROJECT-STATE.md`](PROJECT-STATE.md) | 当前状态 |
| 美术中继（推即部署） | [`RELAY.md`](RELAY.md) · [`ASSETS.md`](ASSETS.md)（The relay） | 参考 |
| Windows 便携包 | [`WINDOWS.md`](WINDOWS.md) | 参考 |
| trusted 插件的生产隔离 | [`TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) | 部署参考 |
| 发布记录 | [`../CHANGELOG.md`](../CHANGELOG.md) | 历史 |

### 2.6 AI 座位 / 外部 AI

| 内容 | 文档 |
|---|---|
| 策略注册表、内置策略、每座位覆盖、重放 | [`BOT-STRATEGIES.md`](BOT-STRATEGIES.md) |
| 外部 AI（`sp-ai/1`）、LLM 适配器、安全边界 | [`EXTERNAL-AI.md`](EXTERNAL-AI.md) |
| 示例顾问的打法 / 经济基准（不改规则） | [`AI-STRATEGY.md`](AI-STRATEGY.md) |
| 机器人训练 / 布局先验 | [`DEPLOY.md`](DEPLOY.md)（Bot rehearsal / training）· `server/match/botPrior.js` |

### 2.7 手机端与界面

| 内容 | 文档 |
|---|---|
| 手机端（横屏 ≥640×360）现状、缺口、P0–P2 清单与验收 | [`MOBILE-UI.md`](MOBILE-UI.md) |
| 主界面（经典大厅 / Hub）与 `?ui=` 预览 | [`UI-HUB.md`](UI-HUB.md) |
| 特殊 UI 快照（PRTS 终端） | [`SPECIAL-UI.md`](SPECIAL-UI.md) |

### 2.8 素材、皮肤、文案、内容包

| 内容 | 文档 |
|---|---|
| 素材来源 / manifest / 特效 / 授权 / 中继 | [`ASSETS.md`](ASSETS.md) |
| 皮肤目录、选择器、本地提取、渲染回退 | [`SKINS.md`](SKINS.md) |
| UI / 游戏文本 / 服务器消息 / 新语言 | [`I18N.md`](I18N.md) |
| 内容包 / 语言包格式 | [`PACKS.md`](PACKS.md) |

### 2.9 协作、上游与路线图

| 内容 | 文档 |
|---|---|
| fork 独有机制（合并时不得丢） | [`OUR-FEATURES.md`](OUR-FEATURES.md) |
| 主线合并日志 + **永不合并清单 §0** | [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) |
| 主线未并入台账（发布线 + dev §9 清单） | [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) |
| 决策记录 §0–§49 | [`MATCHMAKING.md`](MATCHMAKING.md) |
| 评估过但暂不实现 | [`FUTURE-FEATURES.md`](FUTURE-FEATURES.md) |

---

## 3. 分层与状态标签

文档按**层**归档；同一层的文档共享一种"可信度"。

| 层 | 例子 | 含义 |
|---|---|---|
| **规范层** | `DESIGN` / `design/`、`SIM`、`META`、`DATA`、`ASSETS`、`keel/*` | 代码必须符合 |
| **实现层** | `ARCHITECTURE`、`DEVELOPMENT`、`UI-HUB`、`SKINS`、`BOT-STRATEGIES`、`EXTERNAL-AI` | 解释代码，允许代码先行后补 |
| **指南 / 配方层** | `CONTENT-AUTHORING`、`NEW-OPERATOR`、`PLUGIN-GUIDE`、`keel/QUICKSTART`、`AI-STRATEGY` | 操作步骤，不定义行为 |
| **状态 / 计划层** | `PROJECT-STATE`、`TESTING`、`PLUGIN-BUILD`、`PLUGIN-BACKLOG`、`MOBILE-UI`、`keel/NEXT` | 描述「现在」或「将要做什么」 |
| **历史 / 决策层** | `MATCHMAKING`、`UPSTREAM-MERGES`、`UPSTREAM-DEV-TRIAGE`、`history/`、`CHANGELOG` | 记录「为什么」，不保证仍是当前行为 |
| **草案层** | `PLUGIN-PLATFORM-PLAN`、`BOND-BOLIVAR`、`FUTURE-FEATURES` | 未批准，不能当承诺 |

**状态标签**（写在每篇文档头部或表格里）：见 §7.2。

---

## 4. 同题多文档：以谁为准

| 话题 | 权威 | 解释 / 补充 | 历史 / 草案 |
|---|---|---|---|
| **规则是什么 / 为什么这样** | [`DESIGN.md`](DESIGN.md) + [`design/`](design/) | [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) | [`history/`](history/) · [`MATCHMAKING.md`](MATCHMAKING.md) |
| **某个代码在哪个文件** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | [`DEVELOPMENT.md`](DEVELOPMENT.md) / [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | — |
| **新插件怎么写** | [`keel/FEATURES.md`](keel/FEATURES.md) · [`keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) · [`keel/CONTRACTS.md`](keel/CONTRACTS.md) | [`PLUGINS.md`](PLUGINS.md) / [`PLUGIN-API.md`](PLUGIN-API.md) / [`PLUGIN-DSL.md`](PLUGIN-DSL.md)（v2 兼容）· 教程 | — |
| **房间插件为什么慢 / 构建怎么工作** | [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | [`PLUGINS.md`](PLUGINS.md) §11 · [`DEPLOY.md`](DEPLOY.md) 环境变量表 | [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) |
| **测试怎么跑 / golden 怎么动** | [`TESTING.md`](TESTING.md) | [`AI-AGENT.md`](AI-AGENT.md) §6 | — |
| **上线顺序 / 回滚** | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) §(d) | [`DEPLOY.md`](DEPLOY.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) 的部署记录 |
| **现在线上是什么** | [`PROJECT-STATE.md`](PROJECT-STATE.md) | [`DEPLOY.md`](DEPLOY.md)（怎么做） | [`../CHANGELOG.md`](../CHANGELOG.md) |
| **哪些东西合并时不能丢** | [`OUR-FEATURES.md`](OUR-FEATURES.md) | [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 | — |
| **主线还有哪些没并** | [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) | [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)（已并日志） | — |
| **素材 / 皮肤 / 语言 / 内容包** | [`ASSETS.md`](ASSETS.md) | [`SKINS.md`](SKINS.md) · [`I18N.md`](I18N.md) · [`PACKS.md`](PACKS.md) | — |
| **AI 怎么打** | [`BOT-STRATEGIES.md`](BOT-STRATEGIES.md)（实现） | [`AI-STRATEGY.md`](AI-STRATEGY.md)（示例打法）· [`EXTERNAL-AI.md`](EXTERNAL-AI.md)（外部 LLM） | [`MATCHMAKING.md`](MATCHMAKING.md) |
| **手机 / 触屏 / 安全区怎么改** | [`MOBILE-UI.md`](MOBILE-UI.md)（清单与验收） | `devices.css`、`js/ui/device.js`、`test/mobile/*` | — |
| **难度数值** | [`BALANCE.md`](BALANCE.md) + `data/tuning.json` | — | — |
| **文档系统本身怎么改** | 本页 | [`QUERY-INDEX.md`](QUERY-INDEX.md)（查话题） | — |

---

## 5. 权威顺序

发生冲突时按以下顺序判断，不要用旧文档覆盖代码行为：

1. **代码 + 自动化测试**（最终事实；测试规则见 [`TESTING.md`](TESTING.md)）；
2. **规范层**：`keel/*`、`DESIGN` / `design/`、`SIM`、`META`、`DATA`、`ASSETS`、`PLUGINS` / `PLUGIN-API` / `PLUGIN-DSL`、`shared/protocol.js`；
3. **当前状态层**：`PROJECT-STATE`、`PLUGIN-BUILD`、`PLUGIN-BACKLOG`、`keel/NEXT`、`keel/REMAINING`、`MOBILE-UI`；
4. **历史 / 决策层**：`MATCHMAKING`、`UPSTREAM-MERGES`、`UPSTREAM-DEV-TRIAGE`、`history/`、`CHANGELOG`；
5. **草案 / 路线图层**：`PLUGIN-PLATFORM-PLAN`、`BOND-BOLIVAR`、`FUTURE-FEATURES`。

`history/` 记录的是**发布时的事实**，不是当前实现；当前行为请回到第 2 条与代码。

---

## 6. 目录与命名约定

| 路径 | 是什么 |
|---|---|
| `docs/*.md` | 顶层文档（§2 的表就是清单） |
| [`docs/design/`](design/) | `DESIGN.md` 的章节正文（当前规则） |
| [`docs/history/`](history/) | 各版本的规则修订（历史事实） |
| [`docs/keel/`](keel/) | Keel 插件系统：功能、契约、运行时、manifest 3、兼容、流程、状态 |
| [`docs/research/`](research/) | 官方数据研究（可读 + 机器可读 JSON） |
| [`docs/special-ui/`](special-ui/) | 特殊 UI 的静态快照 |
| `docs/img/`、`docs/examples/` | 文档配图与示例（不进文档索引） |
| `plugins/README.md`、`plugins/AGENTS.md` | 在 `plugins/` 内制作插件的规则 |

**机器专属或易变的东西不进 `docs/`**：`.cache`、`var/`、`logs/` 由 `.gitignore` 管；部署事实放 `PROJECT-STATE.md`。

---

## 7. 文档维护规则

### 7.1 修改代码时

1. 更新**拥有该主题的规范文档**（§2 的"权威"列）；
2. 改当前状态时，更新 [`PROJECT-STATE.md`](PROJECT-STATE.md) 和/或 [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md)；
3. 插件内容集 / 构建链路的改动：**必须**同步 [`PLUGIN-BUILD.md`](PLUGIN-BUILD.md)；
4. 新增能力时，更新 [`QUERY-INDEX.md`](QUERY-INDEX.md) 与本页 §2；
5. 改变用户可见行为、部署方式或测试门禁时，更新 `CHANGELOG.md` / `AI-WORKFLOW.md` / [`TESTING.md`](TESTING.md)；
6. 合并上游后，更新 [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) 与 [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md)；
7. 改手机端 / 响应式时，勾 [`MOBILE-UI.md`](MOBILE-UI.md) §7 的清单。

### 7.2 状态标签

- **当前** — 现在就该按它做；
- **规范** — 字段 / 行为的权威定义；
- **参考** — 解释实现，允许代码先行后补；
- **指南** — 操作步骤（配方），不是行为定义；
- **计划** — 已批准、按清单推进的工作（有验收标准，但描述的是「将要做什么」）；
- **历史** — 发布时记录，不保证仍是当前行为；
- **草案 / 路线图** — 未批准，不能当作承诺；
- **当前状态** — 有意保持短、可更新，允许频繁变化。

### 7.3 新增 / 移动文档的登记清单

1. 本页 §2（放到正确的**能力**分组）与 §4（如果它取代或补充了某个话题）；
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
