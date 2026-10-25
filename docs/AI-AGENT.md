# AI Agent 项目开发手册

> **适用对象**：在本仓库执行任务的 AI 代理。根目录 [`../AGENTS.md`](../AGENTS.md) 会被 OpenCode 自动加载，是**硬规则入口**；本文件是展开版的操作手册。
> **最后核对**：2026-10-25（以代码与测试为准；发现过期直接改本文件）。

---

## 0. 接到任务后的前三个动作

1. **确认布局**（桌面双树 / 笔记本单树）：

   ```powershell
   git rev-parse --abbrev-ref HEAD   # prts-plugin = 桌面 store；master = 笔记本单树
   ```

2. **确认唯一真相**：桌面是 `D:\DOTK\_merge-scratch`（store，有 `.git`）；`D:\DOTK\Stronghold-Protocol` 只是运行镜像。提交、合并、推送都在 store。
3. **找到归属文档与测试**：先用 [`QUERY-INDEX.md`](QUERY-INDEX.md)，再看 [`ARCHITECTURE.md`](ARCHITECTURE.md) 和对应模块的头部注释。**不要先读完整套 3 MB 文档**。

---

## 1. 不可违反的规则

| # | 规则 |
|---|---|
| 1 | **不部署、不重启生产、不改环境变量 / 管理令牌 / 防火墙**，除非 owner 明确同意。默认“先不上线”。 |
| 2 | 提交只在 store 里做；dev tree 没有 `.git`。方向永远 **store → remotes → dev tree**。 |
| 3 | **绝不手改 `data/*.json`**；改 `tools/build-data.mjs` 后离线重建。 |
| 4 | Golden 语料有变化时，先在**只回退自己改动**的情况下确认归因，再单独提交重新生成；不手改 golden，不放宽引擎守卫。 |
| 5 | 不删除、不回退 [`OUR-FEATURES.md`](OUR-FEATURES.md) 的 fork 机制；不重新加入 [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 的 never-merge 项。 |
| 6 | 只 `git add -- <自己的路径>`；store 可能是共享工作区，里面可能有别人的改动。 |
| 7 | commit message 一行，说清改了什么；不加 `Co-Authored-By` / `Generated with` 尾注。 |
| 8 | 文档是改动的一部分：行为、状态、命令变了就更新归属文档。 |
| 9 | 不把任何 token、密码、私钥写进仓库。 |
| 10 | 中文 Markdown / JSON 用 UTF-8 **无 BOM** 写入；不要用 PowerShell `Set-Content -Encoding utf8`。 |

---

## 2. 两种布局

### 2.1 桌面双树（`D:\DOTK`）

> **项目本体 / 运行树是 `D:\DOTK\Stronghold-Protocol`**；它自己**没有 `.git`**。`D:\DOTK\_merge-scratch` 是
> **独立的 git store**（提交历史 + 跟踪文件镜像），不是临时目录。`D:\DOTK\.git` 是空的父级仓库，别在项目本体里提交。

| 路径 | 角色 | `.git` |
|---|---|---|
| `D:\DOTK\Stronghold-Protocol` | **项目本体 / 运行树**：`node server/index.js` 在这里跑，看代码也在这里 | 无自己的 |
| `D:\DOTK\_merge-scratch` | **git store**：提交历史 + 跟踪文件镜像，当前分支 `prts-plugin` | 有 |
| `D:\DOTK` | 空父级仓库，不要使用 | 有（master 无提交） |

- store 里的 `.cache`、`public/assets`、`public/fonts`、`public/vendor` 是指向项目本体的 junction；**不要单独删项目本体**。
- 提交/推送后，`node tools/push-gitee.mjs` 会把 store 的跟踪文件镜像回项目本体；也可以手动 `Copy-Item`。
- 镜像校验（在 store 内执行，空输出 = 一致）：
  ```powershell
  git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
  ```
- 本地部署临时文件放 `%TEMP%`，完成后删除；远端暂存 `/root/sp-stage-*` 也删除，`/root/sp-backup-*` 保留。

### 2.2 笔记本单树

- 检出目录同时是 store 与运行树，`.git` 在根，分支 `master`。
- 文档里的 `D:\DOTK\...` 按“store ↔ 当前检出、dev tree ↔ 当前检出”换算。

---

## 3. 标准工作循环

```text
理解请求 / 复现
  → 找归属文档 + 代码 + 现有测试
  → 最小改动（先改代码，再改测试）
  → 针对性测试 → 相关套件 → 必要门禁
  → 更新文档 / 状态
  → store 里 stage + commit
  → push（relay → GitHub → Gitee）
  → 镜像到 dev tree
  → 汇报：改了什么、怎么验证、还有什么风险
```

### 3.1 找代码

| 要改的东西 | 入口 |
|---|---|
| 服务器 / HTTP / WebSocket / 会话 | `server/index.js`、`server/net.js`、`server/lobby.js`、`server/http/` |
| 对局、回合、经济、盟约 | `server/match/`（`Match.js` + `match/` + `player/` 方法模块） |
| 战斗模拟、伤害、buff、技能 | `server/sim/`（`Battle.js` + `battle/`、`skills.js`、`damage.js`、`content/kits/`） |
| 浏览器客户端 | `public/js/`（`screens/`、`ui/`、`render/`、`battle/`） |
| 协议 | `shared/protocol.js`（**规范**） |
| 生成数据 | `data/*.json` + `tools/build-data.mjs`（**不要手改**） |
| 插件平台 | `server/plugins/`、`shared/plugins/`、`plugins/_template/` |
| 资源 | `public/assets/`、`tools/assets/`、`docs/ASSETS.md` |

### 3.2 先写测试还是先改代码

- **规则 / 引擎改动**：优先加一个能失败的最小测试，再修到通过。
- **纯 UI / 文案**：先改，再用浏览器或现有 UI 测试确认。
- **数据 / 内容**：先确定数据来源与生成脚本，再重建并跑内容测试。
- **插件**：先 `check --strict`，再 `test`，最后 `pack`。

---

## 4. 命令速查

```powershell
# 运行
node server/index.js                 # http://localhost:3000
npm run dev                          # --watch
npm run start

# 健康 / 管理
# GET /healthz
# http://localhost:3000/admin?token=<var/admin-token.txt>
# http://localhost:3000/admin/docs

# 测试
npm test                             # 完整套件（必须用 npm test，不要裸 node --test）
node --test test/match/xxx.test.js   # 单文件
node --test --test-name-pattern="..." test/xxx.test.js

# 数据 / 内容
node tools/build-data.mjs --offline  # 必须让 data/ 逐字节不变
node tools/kit-coverage.mjs --missing
node tools/golden.mjs
node tools/golden.mjs --update       # 仅归因后，单独提交

# 质量门禁
npx eslint .
npm run check:imports
npm run typecheck
node tools/i18n.mjs check en --strict
node tools/doctor.mjs
node tools/check-upstream.mjs
node tools/check-delivery.mjs --live

# 插件
node tools/plugin.mjs list
node tools/plugin.mjs check <id> --strict --json
node tools/plugin.mjs test <id>
node tools/plugin.mjs pack <id> --zip

# 文档门禁
node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js
```

**浏览器 / E2E 默认关闭**：`SP_E2E=1`、`SP_REAL_E2E=1`、`RENDER_E2E=1`、`SIM_E2E=1`。dev tree 缺少 `.git` 时，`test/docs-paths.test.js` 与 `test/package.test.js` 会失败，这不是代码回归。

---

## 5. 任务配方

### 5.1 改一条游戏规则

1. 在 [`RULES.md`](RULES.md) 找主题对应的规范文件（`docs/design/*`、`SIM.md`、`META.md`、`DATA.md`）。
2. 在代码里找唯一实现点；不要同时改客户端和服务器两份规则。
3. 加/改测试；若影响固定种子对局，按 golden 纪律处理。
4. 更新规范文档（**当前规则**写进 `docs/design/`，历史只追加 `docs/history/`）。
5. 相关门禁：单测 → `npm test` → `node tools/build-data.mjs --offline`（若碰数据）→ golden。

### 5.2 改战斗 / 技能

- 归一化、伤害、buff、目标选择在 `server/sim/`；内容在 `server/sim/content/`。
- 技能 kit 的字段与官方数据在 `docs/SIM.md`、`docs/DATA.md`、`docs/design/engine.md`。
- 新干员端到端配方：[`NEW-OPERATOR.md`](NEW-OPERATOR.md)。
- 必跑：`node tools/kit-coverage.mjs --missing` + 对应 `test/sim/**` / `test/content/**` + golden。

### 5.3 改大厅 / 对局 / 账号 / 通知

- 平台层：`server/lobby.js`、`server/match/`、`server/admin.js`。
- 决策记录在 [`MATCHMAKING.md`](MATCHMAKING.md)（§0–§49），改动前先搜有没有既有决策。
- 前端：`public/js/screens/`、`public/js/ui/`。
- 必跑：`test/lobby.test.js`、`test/match/**`、`test/admin.test.js`，以及受影响的 UI 测试。

### 5.4 改 UI / 渲染

- 组件与屏幕：`public/js/ui/`、`public/js/screens/`；CSS 在 `public/css/`。
- 渲染：`public/js/render/`；3D 棋盘在 `public/js/render/board3d/`。
- 文案必须走 `t()`；中英日韩繁五套 `public/i18n/*.json` 保持完整：`node tools/i18n.mjs check en --strict`。
- 若改 Hub / 主界面，看 [`UI-HUB.md`](UI-HUB.md)。

### 5.5 加 / 改内容数据

- 只改 `tools/build-data.mjs` 与源表，然后 `node tools/build-data.mjs --offline`。
- 不手改 `data/chess.json` 等生成文件。
- 内容作者的完整配方：[`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md)、[`NEW-OPERATOR.md`](NEW-OPERATOR.md)。

### 5.6 插件

- 先读 [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md)；完整规范是 [`PLUGINS.md`](PLUGINS.md)。
- 在 `plugins/` 内工作时，同时遵守 [`../plugins/AGENTS.md`](../plugins/AGENTS.md)。
- 不提交服务器自己的 `plugins/*`（仓库只跟踪 README / AGENTS / 模板）。

### 5.7 只改文档

- 先看 [`README.md`](README.md)（文档系统）与本文件。
- 新增/移动文档时同步：`docs/README.md`、`docs/QUERY-INDEX.md`、根 `README.md`、`AGENTS.md`。
- 跑四个 docs 守卫。

---

## 6. 测试与门禁

| 层级 | 命令 | 何时必须 |
|---|---|---|
| 单测 | `node --test <file>` | 每次改动 |
| 相关套件 | `node --test "test/<area>/**/*.test.js"` | 改到该领域 |
| 全量 | `npm test` | 合并 / 发布前；大改后 |
| 数据重建 | `node tools/build-data.mjs --offline` | 碰 `tools/build-data.mjs` / 数据 |
| Kit 覆盖 | `node tools/kit-coverage.mjs --missing` | 碰 sim / 干员 |
| Golden | `node tools/golden.mjs` | 碰玩法 / 数值 |
| i18n | `node tools/i18n.mjs check en --strict` | 碰 UI 文案 |
| Lint / 类型 / 导入 | `npx eslint .`、`npm run typecheck`、`npm run check:imports` | 发布前 |
| 文档 | 四个 docs 测试 | 碰文档 |
| 上游 | `node tools/check-upstream.mjs` | 合并前 |

已知基线：`test/sim/robustness.test.js` 有性能波动；`test/lobby-plugins` 偶发心跳超时；两者单独跑通常通过。不要为了让套件变绿而放宽断言。

---

## 7. 文档同步矩阵

| 改动 | 必须同步 |
|---|---|
| 游戏规则 / 数值 / 机制 | `docs/design/*`（当前规则）、相关测试；必要时 `SIM.md` / `META.md` / `DATA.md` |
| 游玩方式 / 玩家可见行为 | `PLAYING.md`、`README.md`、`CHANGELOG.md` |
| 服务器 / 协议 / 数据流 | `ARCHITECTURE.md`、`docs/design/network.md`、`shared/protocol.js` 注释 |
| 数据字段 / 生成 | `DATA.md`、`tools/build-data.mjs` |
| 素材 / 提取 | `ASSETS.md` |
| 插件 | `PLUGIN-DEV-GUIDE.md` / `PLUGINS.md` / `PLUGIN-API.md` / `PLUGIN-DSL.md`（按改动层级） |
| 部署 / 环境变量 | `DEPLOY.md`、`PROJECT-STATE.md`、`AI-WORKFLOW.md` |
| 当前版本 / 部署状态 | `PROJECT-STATE.md`、`CHANGELOG.md` |
| 新文档 / 移动文档 | `docs/README.md`、`docs/QUERY-INDEX.md`、根 `README.md`、`AGENTS.md` |

**权威顺序**：代码 + 测试 > 规范文档（`PLUGINS` / `DESIGN` / `SIM` / `META` / `DATA` / `PROTOCOL`）> 当前状态 > 历史 > 草案。历史文档不能覆盖当前行为。

---

## 8. 提交、推送与部署

### 8.1 提交

```powershell
git add -- <only your paths>
git diff --cached --check
git commit -m "type(scope): what changed"
```

### 8.2 推送顺序

1. **资源中继**（若改了 `public/assets` 等）：`node tools/push-assets-relay.mjs`
2. **GitHub 主仓库**
3. **Gitee 镜像**
4. **源码中继**（如本次会话使用）
5. 把 store 的跟踪文件镜像到 dev tree（`tools/push-gitee.mjs` 会自动做；手工推送时确认镜像状态）

GitHub 直连偶尔超时；可用已解析 IP 的 `git -c http.curloptResolve=...` 方式重试，不要把 IP 写进配置。

### 8.3 生产部署

**先问 owner。** 未经明确同意，不部署、不重启、不改生产环境。获准后按 [`AI-WORKFLOW.md`](AI-WORKFLOW.md) (d) 的顺序：

1. 发一条签名 `d星空之下` 的通知（普通通知即可，除非本次更新需要进更新日志）；
2. 备份；
3. 上传 delta（含 `var/music/` 等不入库资源，如适用）；
4. 只有 `server/**` / `shared/**` 变了才重启；
5. 验证 `/healthz`、`/music/index.json`、`/avatar/<file>` 等。

---

## 9. 常见陷阱

| 陷阱 | 说明 |
|---|---|
| 在 dev tree 提交 | dev tree 没有 `.git`；提交会失败或写到错误位置 |
| 忘记镜像 | 只改 store，本地 `:3000` 仍是旧代码；改完复制或让 `push-gitee` 镜像 |
| 手改 `data/*.json` | 下次 `build-data` 会覆盖；必须改生成脚本 |
| 忽略了 build 缓存 | `/healthz` 的 `build` 在进程内缓存；只上传不重启会停留在旧值 |
| 裸跑 `node --test` | 会把 `test/fixtures/**/*.js` 当测试；用 `npm test` |
| 在 dev tree 跑 docs 测试 | 缺 `.git`，`docs-paths` / `package` 会假失败 |
| PowerShell 写中文 | `Set-Content -Encoding utf8` 会加 BOM；用 UTF-8 无 BOM |
| CRLF | 仓库以 LF 为准；编辑时保留原有行尾，提交前 `git diff --check` |
| 插件目录 | `plugins/*` 被 git 忽略（README / AGENTS / 模板除外）；不要提交服务器自己的插件 |
| 素材 junction | store 的 `public/assets` 指向 dev tree；不要单独删任一侧 |
| i18n | 新增中文文案必须同时补 `public/i18n/*.json`，否则门禁失败 |
| 测试波动 | 性能 / 心跳类用例偶发失败；单跑确认，不要放宽断言 |

---

## 10. 结束前检查清单

- [ ] 改动只碰必要文件，没有覆盖别人的未提交工作
- [ ] 加了能防回归的测试（规则 / 引擎改动必须有）
- [ ] 针对性测试 + 相关套件通过
- [ ] 数据没有手改；需要时 `build-data --offline` 无 diff
- [ ] 文档已同步（见 §7）
- [ ] `git diff --cached --check` 干净
- [ ] commit 一行、信息准确
- [ ] 推送 GitHub / Gitee（及中继），dev tree 镜像一致
- [ ] 汇报里写清：改了什么、怎么验证、剩余风险、是否部署
