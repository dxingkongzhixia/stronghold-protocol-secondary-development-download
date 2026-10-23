# 文档系统 / Documentation System

> **状态：** 维护中的文档总入口（2026-10-23 梳理）。
> 新增或移动文档时，先更新本页，再检查 [`QUERY-INDEX.md`](QUERY-INDEX.md)、[`../AGENTS.md`](../AGENTS.md)、
> [`../README.md`](../README.md) 和 [`HANDOVER.md`](HANDOVER.md) 的链接。

本页回答三个问题：

1. **不同角色应该先读什么；**
2. **哪一份文档是权威来源，哪一份只是历史或草案；**
3. **修改代码后，文档应该同步改哪里。**

---

## 1. 按角色选择阅读顺序

| 角色 | 先读 | 再读 |
|---|---|---|
| 第一次接手项目的维护者 | [`../README.md`](../README.md) → [`HANDOVER.md`](HANDOVER.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) → [`QUERY-INDEX.md`](QUERY-INDEX.md) → [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| AI agent | [`../AGENTS.md`](../AGENTS.md) | 本页 → [`QUERY-INDEX.md`](QUERY-INDEX.md) → [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| 核心开发 / 引擎 | [`DEVELOPMENT.md`](DEVELOPMENT.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) | [`SIM.md`](SIM.md) / [`META.md`](META.md) / [`DATA.md`](DATA.md) |
| 内容作者（盟约 / 干员 / 策略） | [`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | [`NEW-OPERATOR.md`](NEW-OPERATOR.md) → [`DATA.md`](DATA.md) |
| 插件作者（不写代码） | [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | [`PLUGINS.md`](PLUGINS.md) 的相关章节 |
| 插件开发者（写 JSON / DSL / 脚本 / UI） | [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | [`PLUGINS.md`](PLUGINS.md) → [`PLUGIN-API.md`](PLUGIN-API.md) / [`PLUGIN-DSL.md`](PLUGIN-DSL.md) |
| Forge 包作者 | [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) |
| 运维 / 发布 | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) → [`DEPLOY.md`](DEPLOY.md) | [`PROJECT-STATE.md`](PROJECT-STATE.md) → [`RELAY.md`](RELAY.md) |
| 玩家 / 规则查阅 | [`PLAYING.md`](PLAYING.md) | [`DESIGN.md`](DESIGN.md) → [`design/`](design/) |

---

## 2. 权威顺序

发生冲突时按以下顺序判断，不要用旧文档覆盖代码行为：

1. **代码 + 自动化测试**（最终事实）；
2. **规范文档**：`PLUGINS.md`、`PLUGIN-API.md`、`PLUGIN-DSL.md`、`DESIGN.md` / `design/`、`SIM.md`、`META.md`、`DATA.md`；
3. **当前状态**：`PROJECT-STATE.md`、`PLUGIN-BACKLOG.md`；
4. **历史记录**：`UPSTREAM-MERGES.md`、`UPSTREAM-DEV-TRIAGE.md`、`history/`、`CHANGELOG.md`；
5. **草案 / 路线图**：`PLUGIN-PLATFORM-PLAN.md`、未提交的 `PLUGIN-OPTIMIZATION-*`。

`history/` 记录的是**发布时的事实**，不是当前实现；当前行为请回到 `DESIGN` / `SIM` / `META` / `DATA` 和代码。

---

## 3. 项目主体文档

| 文档 | 用途 | 状态 |
|---|---|---|
| [`../README.md`](../README.md) | 玩家 / 部署者入口：是什么、怎么跑、功能概览 | 当前 |
| [`../AGENTS.md`](../AGENTS.md) | AI agent 入口：工作规则、查询表、护栏 | 当前 |
| [`HANDOVER.md`](HANDOVER.md) | 接手入口：仓库地图、运行、构建、合并、发布、坑 | 当前 |
| [`PROJECT-STATE.md`](PROJECT-STATE.md) | 当前部署、开关、备份、已知问题 | **当前状态** |
| [`QUERY-INDEX.md`](QUERY-INDEX.md) | 问题 → 文档 / 代码文件查询表 | 当前 |
| [`AI-WORKFLOW.md`](AI-WORKFLOW.md) | 研究 → 修改 → 测试 → 合并 → 发布 → 部署的操作契约 | 当前 |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | 仓库地图、数据 / 素材流水线、测试 | 参考 |
| [`DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | 中文开发手册与配方 | 参考 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 代码地图、协议、数据流、安全网 | 参考 |
| [`DESIGN.md`](DESIGN.md) → [`design/`](design/) | 现行游戏规则 | **规范** |
| [`history/`](history/) | 各版本规则修订 | 历史 |
| [`SIM.md`](SIM.md) | 战斗引擎（单位、buff、伤害、技能、职业） | **规范** |
| [`META.md`](META.md) | 对局 / 匹配 / 回合 / 联防 / 视图 | **规范** |
| [`DATA.md`](DATA.md) | `data/*.json` 字段与生成方式 | **规范** |
| [`ASSETS.md`](ASSETS.md) | 素材来源、布局、manifest、FX、授权 | **规范** |
| [`BALANCE.md`](BALANCE.md) | 难度模型与测量 | 参考 |
| [`I18N.md`](I18N.md) | UI / 游戏文本 / 服务器消息 / 新语言 | 参考 |
| [`PLAYING.md`](PLAYING.md) | 玩家规则指南 | 当前 |
| [`NEW-OPERATOR.md`](NEW-OPERATOR.md) | 新自造干员端到端配方 | 指南 |
| [`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | 盟约 / 策略 / 悬赏 / CODEX / 3D 主题 | 指南 |
| [`SKINS.md`](SKINS.md) | 皮肤覆盖层、选择器、本地时装提取 | 参考 |
| [`DEPLOY.md`](DEPLOY.md) | 防火墙、自启、反代、Docker | 参考 |
| [`WINDOWS.md`](WINDOWS.md) | Windows 便携包 | 参考 |
| [`RELAY.md`](RELAY.md) | 外部服务器目录站（非部署链路） | 参考 |
| [`OUR-FEATURES.md`](OUR-FEATURES.md) | 仅本 fork 的机制（合并时不得丢失） | **关键** |
| [`MATCHMAKING.md`](MATCHMAKING.md) | 账号 / 匹配 / 自造干员 / 社区 / 决策记录 | 历史 + 决策 |
| [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | 主线合并日志 + 永不合并清单 §0 | 历史 |
| [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) | 上游 dev 待办的当前归属与已移植状态 | 状态 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 发布记录 | 历史 |

---

## 4. 插件文档

插件文档分成四层，不要混用：

### 4.1 教程 / 工作流

| 文档 | 面向 | 说明 |
|---|---|---|
| [`PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | 不写代码的作者 | 工作台、模板、换图 / 模型 / 语音、试一场、打包 |
| [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | 写插件的开发者 | manifest、类别、目录、调试、测试、打包、发布的最小工作流 |
| [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | Forge 包作者 | `pack.json`、导入流程、导入报告 |
| [`../plugins/AGENTS.md`](../plugins/AGENTS.md) | AI agent | 在 `plugins/` 内制作插件时的规则 |

### 4.2 规范 / 接口

| 文档 | 内容 | 状态 |
|---|---|---|
| [`PLUGINS.md`](PLUGINS.md) | 完整规范：manifest、权限、六类插件、content set、studio、Forge、安装、目录 | **权威规范** |
| [`PLUGIN-API.md`](PLUGIN-API.md) | 脚本插件 SDK 的稳定 / 实验 API | **接口规范** |
| [`PLUGIN-DSL.md`](PLUGIN-DSL.md) | 数据插件的 DSL 字段与行为 | **DSL 规范** |
| [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | Forge 兼容矩阵、拒绝项、限制 | **兼容规范** |
| [`PACKS.md`](PACKS.md) | 旧 content pack / 语言包格式 | 兼容参考 |

### 4.3 运营 / 安全 / 状态

| 文档 | 内容 | 状态 |
|---|---|---|
| [`PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | 插件商城、上传、审核、签名、镜像 | 运营参考 |
| [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) | 插件体系架构、边界、安全与测试评审 | 评审（非规范） |
| [`PLUGIN-RISKS.md`](PLUGIN-RISKS.md) | 玩家版风险说明 | 玩家文案 |
| [`PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) | 安装、更新、签名、哈希、供应链边界 | 运营参考 |
| [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) | 仍未解决的插件问题、风险、排期 | **当前状态** |
| [`PLUGIN-PLATFORM-PLAN.md`](PLUGIN-PLATFORM-PLAN.md) | 插件平台改造草案 | **草案 / 路线图** |
| [`TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) | trusted 插件生产隔离方案 | 部署参考 |

> `PLUGIN-BACKLOG.md` 和 `PROJECT-STATE.md` 是状态文档，可能落后于代码；发现过期时直接更新，不要把历史状态当成当前事实。
>
> `docs/PLUGIN-OPTIMIZATION-PLAN-DRAFT.md` / `PLUGIN-OPTIMIZATION-TASKS.md` 目前是本地未提交草案，只有提交后才会进入正式文档链。

### 4.4 插件相关代码入口

| 需要找 | 入口 |
|---|---|
| manifest / 权限 / 校验 | `shared/plugins/manifest.js`, `shared/plugins/validate.js`, `schemas/plugin.schema.json` |
| 插件发现 / 安装 / 内容集 | `server/plugins/registry.js`, `contentSet.js`, `install.js` |
| 工作台 / 模板 / 预览 | `server/studio/`, `public/studio/` |
| 脚本 SDK / 沙箱 | `shared/plugins/script*`, `server/plugins/script*`, `plugins/AGENTS.md` |
| 插件特效 | `public/js/render/vfx/plugin*`, `docs/design/vfx-format.md` |
| 界面插件 | `public/js/ui/pluginFrame.js`, `shared/plugins/ui.js` |
| Forge 导入 | `server/plugins/forgeImport.js`, `FORGE-COMPATIBILITY.md` |
| 商城 / 签名 / 管理 | `server/market.js`, `public/market/`, `PLUGIN-MARKET.md` |

---

## 5. 历史、研究与发布

| 内容 | 文档 |
|---|---|
| 决策记录 §0–§49 | [`MATCHMAKING.md`](MATCHMAKING.md) |
| 主线合并日志与跳过原因 | [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) |
| 上游 dev 的逐提交 triage | [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) |
| 官方数据研究（可读 + JSON） | [`research/00-INDEX.md`](research/00-INDEX.md) |
| 游戏规则历史 | [`history/`](history/) |
| 版本记录 | [`../CHANGELOG.md`](../CHANGELOG.md) |
| 3D / FX 格式设计 | [`design/`](design/) |

---

## 6. 文档维护规则

### 修改代码时

1. 更新**拥有该主题的规范文档**（`PLUGINS` / `PLUGIN-API` / `DESIGN` / `SIM` / `META` / `DATA` 等）；
2. 改当前状态时，更新 [`PROJECT-STATE.md`](PROJECT-STATE.md) 和/或 [`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md)；
3. 新增能力时，更新 [`QUERY-INDEX.md`](QUERY-INDEX.md) 和本页的表格；
4. 如果改变了用户可见行为、部署方式或测试门禁，更新 `CHANGELOG.md` / `AI-WORKFLOW.md`；
5. 合并上游后，更新 [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) 和 [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md)。

### 状态标签

- **当前** — 现在就该按它做；
- **规范** — 字段 / 行为的权威定义；
- **参考** — 解释实现，允许代码先行后补；
- **历史** — 发布时记录，不保证仍是当前行为；
- **草案 / 路线图** — 未批准，不能当作承诺；
- **当前状态** — 有意保持短、可更新，允许频繁变化。

### 文档门禁

```bash
node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-mojibake.test.js
```

链接、措辞一致性和编码都必须通过。不要用 PowerShell 的 `Set-Content -Encoding utf8` 写中文 JSON / Markdown：它会加 BOM 或改变编码；用 UTF-8 无 BOM 写入。
