# 开发者手册

> **适用对象**：人类开发者、新接手的维护者。AI 代理请先读根目录 [`../AGENTS.md`](../AGENTS.md) 与 [`AI-AGENT.md`](AI-AGENT.md)。
> **最后核对**：2026-10-25。命令与路径以仓库当前状态为准；发现过期直接改本文件。

---

## 0. 先用五分钟了解

- 这是《明日方舟》「卫戍协议」的非官方网页复刻，**1–4 人合作**，Node 服务器 + 原生 ES Modules 客户端。
- 服务器负责大厅、账号、房间、回合、经济与校验；**战斗在各玩家浏览器里用同一份确定性模拟器运行**。
- 数据由官方数据表生成；`data/*.json` 不要手改。
- 我们是一个**基于主线开发的分支项目**，有自己的账号 / 野排 / 社区 / 插件 / 自造干员等机制。合并主线时不能丢 [`OUR-FEATURES.md`](OUR-FEATURES.md)。

---

## 1. 环境与启动

### 前置

- **Node.js 22 或 24**（`package.json` 要求 `>=22`）。
- 仓库已跟踪运行时素材，克隆后约 600 MB；首次安装还需要 `node_modules`。

### 启动

```bash
git clone https://github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download.git
cd stronghold-protocol-secondary-development-download

npm install            # postinstall 会把 pixi / preact / three 复制到 public/vendor
npm run setup          # 可选：下载/校验素材，可中断续传
node server/index.js   # http://localhost:3000
```

- 换端口 / 绑定：`PORT`（默认 `3000`）、`HOST`（默认 `::`）。
- 健康检查：`GET /healthz`。
- 管理页：`http://localhost:3000/admin?token=<var/admin-token.txt>`。
- 文档链：`http://localhost:3000/admin/docs`（同一管理令牌）。
- 开发模式：`npm run dev`（`node --watch`）。

### 桌面双树 vs 笔记本单树

> **项目本体是 `D:\DOTK\Stronghold-Protocol`** —— 启动、运行、看代码都在这里；它自己**没有 `.git`**。
> `D:\DOTK\_merge-scratch` 是**单独的 git store**（提交历史 + 被跟踪文件的镜像），不是临时目录，也不是运行目录。
> `D:\DOTK\.git` 是一个空的父级仓库，别在 `Stronghold-Protocol` 里直接 `git commit`（会走到它）。

| 布局 | 路径 | 说明 |
|---|---|---|
| 桌面双树 | **项目本体 / 运行树**：`D:\DOTK\Stronghold-Protocol`（无自己的 `.git`）<br>**git store**：`D:\DOTK\_merge-scratch`（有 `.git`，当前分支 `prts-plugin`） | 提交在 store；store 的跟踪文件镜像到项目本体；`:3000` 在项目本体里跑 |
| 笔记本单树 | 检出目录（`.git` 在根，分支 `master`） | 同一棵树既是 store 也是运行树 |

- 桌面方向：**store → remotes → 项目本体**。不要让项目本体覆盖 store。
- 提交并推送后，运行 `node tools/push-gitee.mjs` 会把 store 的跟踪文件镜像回项目本体；也可以手动 `Copy-Item`。
- 镜像校验（在 store 内执行，空输出 = 一致）：
  ```powershell
  git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
  ```

---

## 2. 第一次验证

```bash
node tools/doctor.mjs                 # 环境诊断
node tools/build-data.mjs --offline   # 应让 data/ 逐字节不变
npm test                              # 完整测试（首次可能较久）
```

浏览器 / E2E 默认关闭，按需开启：

```bash
SP_E2E=1        # mock 浏览器
SP_REAL_E2E=1   # 需要已下载素材
RENDER_E2E=1    # 需要本机 Chrome
SIM_E2E=1       # 模拟器端到端
```

> 在**无 `.git` 的运行树**里，`test/docs-paths.test.js` 与 `test/package.test.js` 会失败；这是布局问题，不是代码回归。

---

## 3. 仓库地图

| 路径 | 内容 |
|---|---|
| `server/` | HTTP / WebSocket / 大厅 / 对局引擎 / 战斗模拟 / 插件平台 |
| `server/match/` | 回合、经济、商店、盟约、策略、AI、结算 |
| `server/sim/` | 确定性战斗模拟、伤害、技能、buff、职业、内容 kit |
| `shared/` | 前后端共用：常量、线协议、插件契约、纯工具 |
| `public/` | 浏览器客户端：屏幕、UI、渲染、战斗执行、i18n、素材 |
| `data/` | **生成**的游戏数据（不要手改） |
| `tools/` | 数据构建、素材、golden、i18n、插件、部署工具 |
| `test/` | `node:test` 测试：content / sim / match / ui / render / e2e |
| `plugins/` | 插件目录（仓库只跟踪 README / AGENTS / 模板） |
| `docs/` | 文档：规则、开发、插件、部署、历史、研究 |

更细的代码地图：[`ARCHITECTURE.md`](ARCHITECTURE.md)、[`DEVELOPMENT.md`](DEVELOPMENT.md)（参考）。

---

## 4. 架构一页

```text
浏览器
  ├─ public/js/screens, ui, render     界面与渲染
  ├─ public/js/battle                  本地战斗执行 / 回放
  └─ WebSocket  ── shared/protocol.js ──┐
                                        │
服务器                                   ▼
  ├─ server/index.js  HTTP + 静态资源 + 管理页 + WS
  ├─ server/net.js    会话、限流、心跳、重连
  ├─ server/lobby.js  账号、房间、野排、插件选择、通知
  ├─ server/match/    回合 / 经济 / 商店 / 盟约 / 结算（权威）
  └─ server/sim/      确定性战斗模拟（服务器与浏览器共用）
```

关键原则：

1. **服务器权威**：大厅、经济、回合、内容集、结算在服务器；客户端不能自行改经济或结果。
2. **确定性模拟**：同一份 `server/sim/` 在浏览器运行；种子、时间步、随机流必须可复现。
3. **协议是契约**：`shared/protocol.js` 是线协议规范；改消息必须同时改校验、发送、接收和测试。
4. **数据是生成物**：`data/*.json` 来自 `tools/build-data.mjs`；插件通过补丁 / DSL 进入内容集，不直接改数据文件。
5. **内容集有身份**：房间的玩法插件产生 `cs`，外观插件产生 `vs`；两者不能混为一个插件。

---

## 5. 开发工作流

### 5.1 服务器 / 对局 / 账号

- 入口：`server/index.js`、`server/lobby.js`、`server/match/`。
- 先搜 [`MATCHMAKING.md`](MATCHMAKING.md) 是否已有决策记录（§0–§49）。
- 测试：`test/lobby.test.js`、`test/match/**`、`test/admin.test.js`。
- 协议改动：`shared/protocol.js` + `test/protocol` / 相关 match 测试。

### 5.2 战斗 / 技能 / 数值

- 入口：`server/sim/`（`Battle.js`、`battle/`、`damage.js`、`skills.js`、`content/`）。
- 规范：[`SIM.md`](SIM.md)、[`design/engine.md`](design/engine.md)。
- 新干员：[`NEW-OPERATOR.md`](NEW-OPERATOR.md)。
- 必跑：
  ```bash
  node tools/kit-coverage.mjs --missing
  node --test "test/sim/**/*.test.js" "test/content/**/*.test.js"
  node tools/golden.mjs
  ```

### 5.3 客户端 / UI / 渲染

- 入口：`public/js/screens/`、`public/js/ui/`、`public/js/render/`。
- 文案：`t('中文')` + `public/i18n/*.json` 五套语言。
- 主界面：`docs/UI-HUB.md`；皮肤：`docs/SKINS.md`；3D 棋盘：`docs/design/client.md`。
- 测试：`test/ui/**`；真实浏览器用 `SP_E2E=1` / `RENDER_E2E=1`。

### 5.4 数据 / 内容

```bash
# 只改 tools/build-data.mjs 或源表，然后：
node tools/build-data.mjs --offline
# 必须让 data/ 无 diff
```

- 绝不手改 `data/*.json`。
- 数据字段：[`DATA.md`](DATA.md)。
- 盟约 / 策略 / 悬赏 / CODEX：[`CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md)。

### 5.5 插件

从 [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) 开始；完整规范是 [`PLUGINS.md`](PLUGINS.md)。最短循环：

```bash
node tools/plugin.mjs new <template> <id> --target <官方名称>
node tools/plugin.mjs check <id> --strict --json
node tools/plugin.mjs test <id>
node tools/plugin.mjs pack <id> --zip
```

### 5.6 素材

- 素材来源、布局、manifest、FX：[`ASSETS.md`](ASSETS.md)。
- 本地客户端提取：`tools/local-extract/`；没有客户端时用替代样式，游戏仍可运行。
- 前端素材 URL / 清单：[`ASSETS.md`](ASSETS.md)、`data/assets.json`（生成）。

---

## 6. 测试与质量门禁

| 命令 | 用途 |
|---|---|
| `npm test` | 完整套件（必须用 `npm test`，不要裸 `node --test`） |
| `node --test test/xxx.test.js` | 单文件 |
| `node tools/build-data.mjs --offline` | 数据可重复构建 |
| `node tools/kit-coverage.mjs --missing` | 每个 chess / skill 有 kit |
| `node tools/golden.mjs` | 固定种子战斗 / 对局摘要 |
| `node tools/i18n.mjs check en --strict` | 英文 UI 完整 |
| `npx eslint .` | Lint |
| `npm run typecheck` | 类型检查 |
| `npm run check:imports` | 导入边界 |
| `node tools/doctor.mjs` | 环境诊断 |
| `node tools/check-upstream.mjs` | 上游新改动与冲突预测 |
| `node tools/check-delivery.mjs --live` | 线上素材链 |
| docs 四个测试 | 文档链接 / 一致性 / 路径 / 编码 |

### Golden 纪律

- 任何改变 `test/golden/*.json` 的改动，先证明“只回退自己的改动 → golden 零 diff”；
- 再单独提交重新生成；
- 不手改 golden，不放宽引擎守卫。

### 已知波动

- `test/sim/robustness.test.js` 性能用例偶发超时；
- `test/lobby-plugins` 偶发心跳超时。
两者单独跑通常通过；不要为了绿而改断言。

---

## 7. 调试

| 场景 | 工具 |
|---|---|
| 服务器状态 / 玩家 / 房间 | `/admin`（概览、在线、房间、通知、反馈、插件） |
| 文档 | `/admin/docs` |
| 3D 棋盘 / 模拟检查 | `/dev/` 下的页面（如 `/dev/render-demo.html?scene=prep&stage=act1autochess_m01&board=3d`） |
| 测试控制台 | `SP_TEST_MODE=1`，测试对局默认不计入统计 |
| 插件 | `/studio/`、`node tools/plugin.mjs check/test` |
| 构建版本 | `/healthz` 的 `build`；只上传不重启会停在旧值 |
| 线上素材链 | `node tools/check-delivery.mjs --live` |

### 常见问题

- **只改了 store，页面没变**：运行树还是旧文件，镜像过去再刷新。
- **改了 `server/**` 但行为没变**：需要重启进程。
- **`/healthz` build 不变**：进程内缓存，重启才会更新。
- **数据重建有 diff**：源表/脚本不确定，或手改了生成文件。
- **中文乱码**：用 UTF-8 无 BOM 写入。
- **文档测试失败**：链接指向不存在的文件，或 dev tree 缺 `.git`。

---

## 8. 发布与部署

### 发布（每次改动）

1. 资源中继（若改素材）：`node tools/push-assets-relay.mjs`
2. GitHub 主仓库
3. Gitee 镜像（fast-forward，不 forced）
4. 源码中继（如使用）
5. 把 store 的跟踪文件镜像到运行树

> 凭据不入库。GitHub 用 owner 的 credential helper / `GITHUB_TOKEN`；Gitee 用 `GITEE_USERNAME` / `GITEE_TOKEN`。

### 生产部署

**先得到 owner 明确同意。** 默认“先不上线”。获准后按 [`AI-WORKFLOW.md`](AI-WORKFLOW.md) (d)：

1. 发通知（普通通知即可；需要记入更新日志时选择「通知 + 写入更新日志」）；
2. 备份；
3. 上传 delta（含不入库的 `var/music/` 等）；
4. 只有 `server/**` / `shared/**` 变了才重启；
5. 验证 `/healthz`、素材链、账号 / 头像 / 音乐等接口。

生产地址与 SSH 细节见 [`AI-WORKFLOW.md`](AI-WORKFLOW.md)、[`DEPLOY.md`](DEPLOY.md)。**SSH 密码 / 私钥不在仓库里。**

---

## 9. 文档地图

### 入口

| 文档 | 面向 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | AI 代理硬规则（自动加载） |
| [`AI-AGENT.md`](AI-AGENT.md) | AI 代理展开手册 |
| **本文件** | 人类开发者 |
| [`RULES.md`](RULES.md) | 游戏规则入口 |
| [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | 插件开发入口 |

### 常用参考

| 主题 | 文档 |
|---|---|
| 文档系统 / 权威顺序 | [`README.md`](README.md) |
| 代码地图 | [`ARCHITECTURE.md`](ARCHITECTURE.md)、[`DEVELOPMENT.md`](DEVELOPMENT.md) |
| 当前部署 / 开关 / 备份 | [`PROJECT-STATE.md`](PROJECT-STATE.md) |
| 工作流程 / 部署契约 | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| 规则 | [`DESIGN.md`](DESIGN.md) → [`design/`](design/)、[`SIM.md`](SIM.md)、[`META.md`](META.md) |
| 玩家规则 | [`PLAYING.md`](PLAYING.md) |
| 数据字段 | [`DATA.md`](DATA.md) |
| 素材 | [`ASSETS.md`](ASSETS.md) |
| 插件 | [`PLUGINS.md`](PLUGINS.md)、[`PLUGIN-API.md`](PLUGIN-API.md)、[`PLUGIN-DSL.md`](PLUGIN-DSL.md) |
| fork 机制 / 合并保护 | [`OUR-FEATURES.md`](OUR-FEATURES.md)、[`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) |
| 主题查询 | [`QUERY-INDEX.md`](QUERY-INDEX.md) |

---

## 10. 约定

- 代码、注释、标识符用英文；玩家可见文案用简体中文（再经 i18n）。
- 版本号唯一来源：`package.json` / `shared/constants.js APP_VERSION` / `CHANGELOG.md`（由 `test/version.test.js` 校验）。
- 提交信息一行，说清改动；不加生成器尾注。
- 改动行为就改文档；新增文档就更新 [`README.md`](README.md) 与 [`QUERY-INDEX.md`](QUERY-INDEX.md)。
- 不确定是否该部署 / 重启 / 改环境时，**停下来问 owner**。
