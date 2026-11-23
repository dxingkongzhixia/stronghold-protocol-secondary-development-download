# 文档索引（自动生成）

> `node tools/docs-index.mjs` 生成；**不要手改**。每篇维护中的文档在标题下带 `<!-- doc: role=… status=… -->`，
> 由 `test/docs-facts.test.js` 检查（缺失/失效/过期都会红）。`design/`、`history/`、`research/` 不在此表
> （设计版本与调研各自有索引）。

| 文档 | 标题 | role | status |
|---|---|---|---|
| [`AGENTS.md`](../AGENTS.md) | AGENTS.md — entry point for an AI agent working in this repository | entry | current |
| [`CHANGELOG.md`](../CHANGELOG.md) | 更新记录 | history | history |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 参与贡献 | guide | current |
| [`NOTICE.md`](../NOTICE.md) | 版权与使用声明（NOTICE） | reference | reference |
| [`README.md`](../README.md) | 卫戍协议：盟约 · Stronghold Protocol: Alliance | entry | current |
| [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) | Third-party notices（第三方组件声明） | reference | reference |
| [`docs/AGENT-SEATS.md`](AGENT-SEATS.md) | Agent 席位（内部接入：AI 通过房间接管 bot） | reference | current |
| [`docs/AI-AGENT.md`](AI-AGENT.md) | AI Agent 项目开发手册 | guide | current |
| [`docs/AI-STRATEGY.md`](AI-STRATEGY.md) | AI 打法与顾问策略（AI-STRATEGY） | reference | current |
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | AI workflow — how we change, merge, commit and deploy this fork | ops | current |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | ARCHITECTURE.md — a map of the code | reference | current |
| [`docs/ASSETS.md`](ASSETS.md) | Assets: sources, layout, manifest, credits | reference | current |
| [`docs/BALANCE.md`](BALANCE.md) | BALANCE.md — difficulty model and measurement (official numbers, no custom tuning) | reference | current |
| [`docs/BOND-BOLIVAR.md`](BOND-BOLIVAR.md) | 玻利瓦尔国家盟约（v0.3 / Keel N 系列） | reference | current |
| [`docs/BOT-STRATEGIES.md`](BOT-STRATEGIES.md) | Bot 策略（注册表、内置策略、每座位覆盖） | reference | current |
| [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | 内容制作手册：盟约 / 策略 / 悬赏敌人 / 干员 | reference | current |
| [`docs/DATA.md`](DATA.md) | DATA.md — generated game data (`data/*.json`) | reference | current |
| [`docs/DEPLOY.md`](DEPLOY.md) | 部署指南 | reference | current |
| [`docs/DEPLOYS.md`](DEPLOYS.md) | 部署日志（倒序） | history | history |
| [`docs/DESIGN.md`](DESIGN.md) | 卫戍协议：盟约 — Web Remake · Architecture & Contracts (DESIGN.md) | rules | current |
| [`docs/DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | 卫戍协议：盟约 · 二次开发指南（中文） | reference | current |
| [`docs/DEV-SANDBOX.md`](DEV-SANDBOX.md) | 沙盒（管理员）— 单场景战术演练 | reference | current |
| [`docs/DEVELOPER.md`](DEVELOPER.md) | 开发者手册 | guide | current |
| [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) | Development guide (detailed code map) | reference | current |
| [`docs/EXTERNAL-AI.md`](EXTERNAL-AI.md) | 外部 AI 顾问（sp-ai/1）与 LLM 适配器 | reference | current |
| [`docs/FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | Forge 兼容矩阵与不支持清单 | reference | current |
| [`docs/FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | Forge 导入包开发指南 | reference | current |
| [`docs/FUTURE-FEATURES.md`](FUTURE-FEATURES.md) | 后续功能 / Future features | plan | plan |
| [`docs/HANDOFF-2026-11-16.md`](HANDOFF-2026-11-16.md) | 交接：规程（act3autochess）可选版本并入（2026-11-16） | reference | current |
| [`docs/HANDOFF-2026-11-18.md`](HANDOFF-2026-11-18.md) | 规程（act3autochess）地图与装备：问题交接（2026-11-18） | archive | archive |
| [`docs/HANDOFF-2026-11-19.md`](HANDOFF-2026-11-19.md) | 规程（act3autochess）/ 主题包 交接（2026-11-20 整理） | archive | archive |
| [`docs/HANDOVER-2026-10.md`](HANDOVER-2026-10.md) | HANDOVER — detailed handover & operations reference | archive | archive |
| [`docs/HANDOVER.md`](HANDOVER.md) | HANDOVER — 已归档（archived） | archive | archive |
| [`docs/I18N.md`](I18N.md) | I18N.md — languages (中文, English, language packs) | reference | current |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) | 野排（搜寻队友）— 设计、实现与改动记录 | decision | current |
| [`docs/META.md`](META.md) | META.md — match & meta engine (server/match) | reference | current |
| [`docs/MOBILE-UI.md`](MOBILE-UI.md) | 手机端视觉优化（MOBILE-UI） | reference | current |
| [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) | 新增干员流程（自造干员） | reference | current |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | Our fork-only mechanisms (merge-critical) | decision | current |
| [`docs/PACKS.md`](PACKS.md) | PACKS.md — content packs | reference | current |
| [`docs/PERFORMANCE.md`](PERFORMANCE.md) | 性能与加载（PERFORMANCE） | ops | current |
| [`docs/PLAYING.md`](PLAYING.md) | 玩法指南 | guide | current |
| [`docs/PLUGIN-API.md`](PLUGIN-API.md) | Plugin API v1–v2 | spec | current |
| [`docs/PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) | 插件问题与待办清单 | spec | current |
| [`docs/PLUGIN-BUILD.md`](PLUGIN-BUILD.md) | 内容集构建：机制、缓存与排障 / Content-set builds: mechanics, caches, diagnosis | spec | current |
| [`docs/PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | 插件开发指南 | spec | current |
| [`docs/PLUGIN-DSL.md`](PLUGIN-DSL.md) | 插件 DSL（P2） | spec | current |
| [`docs/PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) | 插件新手指南：从换立绘到玩法插件 | spec | current |
| [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) | 插件商城（Plugin Market） | spec | current |
| [`docs/PLUGIN-PLATFORM-PLAN.md`](PLUGIN-PLATFORM-PLAN.md) | 玩法插件平台改造方案（草案 v0.1） | spec | current |
| [`docs/PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) | 插件系统评审（2026-10-19） | spec | current |
| [`docs/PLUGIN-RISKS.md`](PLUGIN-RISKS.md) | 插件风险说明（玩家版） | spec | current |
| [`docs/PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) | 插件安装与更新供应链 | spec | current |
| [`docs/PLUGINS.md`](PLUGINS.md) | PLUGINS.md — plugins (插件) | spec | current |
| [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) | 项目现状一览（PROJECT-STATE） | ops | current |
| [`docs/PRTS-SOURCE-CODE-REMAINING.md`](PRTS-SOURCE-CODE-REMAINING.md) | PRTS「源代码」B–E 开发计划 | reference | current |
| [`docs/PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) | PRTS「源代码」玩法插件 — 开发文档（评审稿） | reference | current |
| [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) | QUERY-INDEX — where to find what | entry | current |
| [`docs/README.md`](README.md) | 文档系统 / Documentation System | entry | current |
| [`docs/RELAY.md`](RELAY.md) | 坚守协议中转站（STRONGHOLD RELAY）接入说明 | reference | current |
| [`docs/RULES.md`](RULES.md) | 游戏规则文档 / Rules | rules | current |
| [`docs/SIM.md`](SIM.md) | SIM.md — battle simulation engine reference (server/sim) | reference | current |
| [`docs/SKINS.md`](SKINS.md) | 干员皮肤 (Operator skins) | reference | current |
| [`docs/SPECIAL-UI.md`](SPECIAL-UI.md) | 特殊 UI 版本（参考） | reference | current |
| [`docs/TEST-INVENTORY.md`](TEST-INVENTORY.md) | 测试清单（自动生成） | reference | reference |
| [`docs/TESTING-PLAN.md`](TESTING-PLAN.md) | 测试系统优化方案（TESTING-PLAN） | plan | plan |
| [`docs/TESTING.md`](TESTING.md) | 测试系统（TESTING） | ops | current |
| [`docs/TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) | Trusted 插件生产部署基线 | reference | current |
| [`docs/UI-HUB.md`](UI-HUB.md) | 主界面：经典大厅与 Hub / Main interface: classic lobby and Hub | reference | current |
| [`docs/UPSTREAM-BANDS.md`](UPSTREAM-BANDS.md) | 规程 band 实现计划（act3autochess） | plan | plan |
| [`docs/UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) | 主线未并入清单（Upstream backlog） | history | history |
| [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | Upstream merge log (`UPSTREAM-MERGES`) | history | history |
| [`docs/UPSTREAM-REGULATION.md`](UPSTREAM-REGULATION.md) | 规程（卫戍协议·规程 序列Ⅰ）还原清单 / Regulation port plan | decision | current |
| [`docs/WINDOWS.md`](WINDOWS.md) | Windows 便携包（零安装方案） | reference | current |
| [`docs/examples/theme-pack/README.md`](examples/theme-pack/README.md) | 界面主题包（spTheme/1） | reference | current |
| [`docs/keel/ARCHITECTURE.md`](keel/ARCHITECTURE.md) | Keel 架构与实现 | spec | current |
| [`docs/keel/COMPAT-V2.md`](keel/COMPAT-V2.md) | manifest 2 → Keel 兼容 | spec | current |
| [`docs/keel/CONTRACTS.md`](keel/CONTRACTS.md) | Keel 扩展点契约 | spec | current |
| [`docs/keel/DEBUGGING.md`](keel/DEBUGGING.md) | Keel 调试、错误与指标 | spec | current |
| [`docs/keel/FEATURES.md`](keel/FEATURES.md) | Keel（龙骨）功能总览 | spec | current |
| [`docs/keel/HISTORY.md`](keel/HISTORY.md) | Keel 历史与决策 | spec | current |
| [`docs/keel/MANIFEST-V3.md`](keel/MANIFEST-V3.md) | Keel manifest 3 | spec | current |
| [`docs/keel/MODULES.md`](keel/MODULES.md) | Keel 模块 / 权限参考矩阵 | spec | current |
| [`docs/keel/NEXT.md`](keel/NEXT.md) | Keel 当前检查点 | spec | current |
| [`docs/keel/QUICKSTART.md`](keel/QUICKSTART.md) | Keel 15 分钟快速上手 | spec | current |
| [`docs/keel/README.md`](keel/README.md) | Keel（龙骨）插件系统 | spec | current |
| [`docs/keel/REMAINING.md`](keel/REMAINING.md) | Keel 剩余项与边界 | spec | current |
| [`docs/keel/RUNTIME.md`](keel/RUNTIME.md) | Keel 运行时 | spec | current |
| [`docs/keel/WORKFLOW.md`](keel/WORKFLOW.md) | Keel 开发、兼容与测试流程 | spec | current |
| [`docs/special-ui/ark-proto-gate/README.md`](special-ui/ark-proto-gate/README.md) | ark-proto 特殊 UI 快照（PRTS 访问终端） | reference | current |
