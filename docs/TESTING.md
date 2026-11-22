# 测试系统（TESTING）

<!-- doc: role=ops status=current -->

> **唯一入口**。测试的目录、命令、门禁、golden 规则、CI 与常见不稳定项都在这里；
> 其它文档只做指针（`AI-AGENT.md` §6 是速查，`README.md` §2.4 是索引）。
>
> 一句话：**代码 + 测试是最终事实**。规则/引擎改动必须有能失败的回归；
> 移动 `test/golden/*.json` 必须先归因、再单独提交。

## 1. 测试分五层

| 层 | 目录 / 文件 | 跑什么 | 何时必须 |
|---|---|---|---|
| **单元 / 集成** | `test/{sim,match,content,plugins,keel,render,ui,mobile}/**/*.test.js` | 纯函数、引擎单步、整局模拟（虚拟时间）、假 PIXI 渲染 | 每次改动 |
| **golden 语料** | `test/golden/*.json`（roster / bonds / fields / matches / standins / diy） | 固定场景的确定性摘要（数值、事件计数、棋盘哈希） | 碰玩法 / 数值 / kit / bot |
| **文档守卫** | `test/docs-*.test.js` | 链接存在、编码、路径、规范措辞与代码一致 | 碰任意 `docs/` |
| **浏览器 E2E（opt-in）** | `test/render/*.browser.test.js`、`test/e2e/*` | 真 Chrome：渲染、拖拽、相机、手机视口 | 碰渲染 / UI / 手机端 |
| **CI** | `.github/workflows/ci.yml` | 上面三层的自动化（见 §6） | 推送 / PR |

测试文件按 **13 个目录**组织：`content` `dev` `e2e` `fixtures` `golden` `helpers` `keel` `match` `mobile` `plugins` `render` `sim` `ui`（具体文件数不写死，`node tools/ci-shards.mjs --list` 是准数）。

## 2. 命令

| 目的 | 命令 |
|---|---|
| 全量（推荐；并发固定 4） | `npm test`（**不含 golden 语料检查**；它们由 `npm run test:golden` 与 CI 的 golden job 负责；五个 full-match 套件本地默认 **6 seeds**，CI / 发布前用 `MATCH_SEEDS=20 npm test` 跑满 20） |
| golden 套件检查（本地） | `npm run test:golden`（default + 规程语料重算、六文件完整性） |
| **快速档（本地循环，≤2 分钟）** | `npm run test:fast`（`tools/test-fast.mjs` + `test/fast.list`：文档、i18n、经济、版本数据、golden fast 子集） |
| **单个 CI 分片（本地复现）** | `npm run test:shard -- 2`（1..4，与 CI 同一张权重表 `ci-shards.json`） |
| 某个套件 | `node --test test/match/bot.test.js` |
| 某个领域 | `node --test --test-concurrency=2 test/plugins/*.test.js` |
| 单条用例 | `node --test --test-name-pattern="bench shed" test/match/bot-smarter.test.js` |
| golden 校验 / 重算 | `node tools/golden.mjs` / `node tools/golden.mjs --update`（先归因，见 §4） |
| golden 归因 | `npm run golden:attrib -- --paths server/sim`（自动：存下重算 diff → 只回退你的改动 → 基线必须匹配 → 恢复 → 必须失配） |
| 文档守卫 | `node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js test/docs-facts.test.js`；front-matter / 索引：`npm run docs:check`（重建 `docs/INDEX.md`：`npm run docs:index`） |
| 手机矩阵 | `npm run check:mobile`（`tools/mobile-audit.mjs`；需 Chrome，`CHROME_PATH` 可配） |
| 浏览器 smoke | `npm run test:browser:smoke`（`tools/browser-smoke.mjs`：协议启动 + 快捷键/设置入口 + 异形屏适配 + 标题页/安装 + 一局 mock 交互；约 2.5 分钟；**不需要素材**，Chrome 自动找/`CHROME_PATH`） |
| 浏览器用例开局 | `?e2e=1`（关掉入口动画与首个美术弹窗）+ `test/helpers/appBoot.mjs`（`openApp` / `createRoom` / `openSettings`）；端口用 `test/helpers/browserServer.mjs` 的 `startBrowserServer()` |
| 挂起监视 | `npm run test:guard -- -- node --test --test-force-exit <file>`（10 分钟硬停；打印 CPU 进程表与最后输出，exit 3 需人工看） |
| 浏览器渲染 | `RENDER_E2E=1 node --test test/render/*.browser.test.js`（需 Chrome + `public/assets`） |
| 联机 E2E | `SP_E2E=1 node --test "test/e2e/**"`（需浏览器与素材） |
| Agent 席位 E2E | `SP_AGENT_E2E=1 node --test test/e2e/agent-seat.e2e.mjs`（真实 Match，无需浏览器；见 [`AGENT-SEATS.md`](AGENT-SEATS.md) §6.1） |
| Agent LLM 客户端 | `node --test test/agent-llm.test.js`（OpenAI / Anthropic wire format、规则索引/精确检索、角色 briefing、聊天表情、动作白名单；不需要真 key） |
| Lint / 类型 / 导入 | `npm run lint`（**0 error，warning 预算 200，只降不升**）、`npm run typecheck`、`npm run check:imports` |
| kit 覆盖 | `node tools/kit-coverage.mjs --missing` |
| i18n | `node tools/i18n.mjs check en --strict` |
| 数据重建（必须零 diff） | `node tools/build-data.mjs --offline` |
| 上游侦察 | `node tools/check-upstream.mjs`（`--upstream upstream/dev` 看开发线） |

为什么固定 `--test-concurrency=4`：默认按核数并行，16 核机器上几十个 CPU 密集的整局模拟互相抢核，
lobby / 心跳 / 限流类用例会超时（整轮反而更慢）。单跑想更稳可再加 `--test-concurrency=1`。

## 3. 写测试的约定

- `node:test` + `node:assert/strict`；一个文件一个主题，文件头注释写**为什么**（对应的问题/报告号）。
- 用现成夹具，不要自己搭局：
  - `test/match/harness.js` → `makeMatch()`（整局、虚拟时间、`h.run()` / `h.toPrep()`）
  - `test/helpers/battleHarness.js` → `makeBattle()`（单场战斗、`h.unit()` / `h.step()` / `h.events`）
  - `test/render/fakepixi.js` → `installFakePixi()` / `fakeViewCtx()`（无 GPU 渲染）
  - `test/mobile/matrix.mjs` → `VIEWPORTS` / `MIN_VIEWPORT` / `SAFE_AREA`（手机矩阵唯一来源）
- **确定性**：只从 `m.rng*` / 固定 seed 取随机；不 `sleep`、不读系统时间、不依赖文件 mtime。
  测试日志重放（`replayTestMatch`）按记录步数切片，不按墙钟。
- **依赖外部资源的用例自己 skip**：素材（`public/assets`）、Chrome、`var/` 缺失时用 `skip` 而不是失败。
- **断言失败要可诊断**：断言消息写清期望与实际（例如 `round ${r}: ${x} fights as its pick`）。
- 修 bug 时先写会失败的用例，再改代码（本次 #902 / #903 / #906 / 俄耳甫斯治疗都是这样做的）。

## 4. golden 规则（硬约束）

1. 任何移动 `test/golden/*.json` 的改动必须**归因**：只回退该项 → 零差异。
2. 归因成立后，**代码与 golden 分两个提交**；golden 提交信息写清"为什么移动、动了哪些族"。
3. 禁止手改 golden 输出；禁止为了让套件变绿而放宽断言或跳过用例。
4. 纯显示层的事件计数（例如 `#729` 的 `events.rate`）也算移动，同样要归因。
5. 上游/历史语料在 `test/golden/<version>/`（版本系统），我们只有默认一套。
6. 归因可以自动做：`npm run golden:attrib -- --paths server/sim`（重算后运行；它保存 golden diff → 只回退你的路径 → 基线必须匹配 → 恢复 → 必须失配）。

## 5. 已知不稳定（不要误判为回归）

| 现象 | 原因 | 处置 |
|---|---|---|
| `test/plugins/visualSet.test.js` 的「压缩缓存 ctime」 | Windows 文件时间戳粒度 | 复跑；与代码无关 |
| `test/sim/robustness.test.js` 偶发超时 | 性能基线受机器负载影响 | 单跑确认（35/35） |
| 「bad port」的 `fetch` 失败（曾见 `test/i18n-packs.test.js`） | 临时端口撞上 undici 禁用端口（`port: 0` 随机分配） | 新用例用 `test/helpers/localFetch.js`（`node:http`，无端口黑名单）；旧用例出现即迁移 |
| 浏览器套件 skipped | 无 Chrome / 无 `public/assets` | 设 `RENDER_E2E=1` 并准备素材；`npm run test:browser:smoke` 是常开的无素材子集（缺 Chrome 会报错） |
| 浏览器用例并发抢 Chrome | 多个 headless 页面同时跑（`turn-popup` / `resultbox` 在 `--test-concurrency=4` 下会红，单跑绿） | 浏览器套件用 `--test-concurrency=1`，或按文件顺序跑；smoke job 就是顺序跑 |
| 首个 美术资源 弹窗遮住页面 | 新 profile 没有 `sp.pref.assetMode`，`AssetModePrompt`（`ui/assetMode.js`）挡在标题/大厅上 | 浏览器用例 `evaluateOnNewDocument` 写入 `localStorage.setItem('sp.pref.assetMode', JSON.stringify('stream'))` |
| Chrome 拒绝端口（`ERR_UNSAFE_PORT`） | `startServer({ port: 0 })` 偶尔分配到 5060/5061、6000、6665–6669 等 Chrome 黑名单端口，页面根本不加载 | 浏览器用例用 `test/helpers/browserServer.mjs` 的 `startBrowserServer()`（撞上就换一个端口） |
| 测试机器 CPU 很高（一个 Chrome 70%+） | e2e 曾强制 `--use-angle=swiftshader`（软件 WebGL）：实测 51 CPU 秒/10 秒，硬件 D3D11 只有 11 | `test/e2e/client.mjs` 现在只在 `CI=1` 或 `SP_GL=swiftshader` 时用 SwiftShader；本机走硬件。内存无泄漏（JS heap 60 秒稳定在 ~110–140 MB，节点数不变） |
| 浏览器用例被全屏层挡点击 | 入口动画（`ui/entryFilm.js`）和首个 `美术资源` 弹窗（`ui/assetMode.js`）盖住整页，点击落在遮罩上 | 页面 URL 加 `?e2e=1`（`public/js/e2eMode.js` 关掉这两层）；开局用 `test/helpers/appBoot.mjs` 的 `openApp` / `createRoom` / `openSettings`，不要再逐文件写 seed |
| 测试“还在跑”其实已挂起 | 单测死循环，或测试跑完后泄漏的 server/browser 让进程不退（实测一次 55 分钟、Chrome 烧 66 分钟 CPU） | `npm test` 带 `--test-timeout=600000`（>10 分钟的单测直接红并报名字）；浏览器 smoke/脚本另带 `--test-force-exit`（**注意**：它会把未完成的 Promise 记为失败，`test/ui/morph-bonds.test.js` 就是因此报错，所以全量套件不用它）；整轮仍卡死：`npm run test:guard -- -- node --test …`（10 分钟硬停 + 进程表 + 最后输出，exit 3） |
| 房间里配装打开的是卡组视图 | 0.2.x 起 `loadout.view` 默认 `deck`（`.lo--deck`），旧用例找列表 `.lo-card` | 测试 seed `localStorage['sp.pref.loadout.view'] = 'list'`（`Client`/`appBoot` 已默认写入） |
| CI 上 `test/**` 大面积 skip | CI 明确 `SP_E2E=0` / `RENDER_E2E=0` | 预期行为，见 §6 |

## 6. CI（`.github/workflows/ci.yml`）

| job | 跑什么 | 说明 |
|---|---|---|
| `test`（ubuntu + windows × node 22 / 24） | `node tools/ci-shards.mjs --run ${{ matrix.shard }}`（按 `ci-shards.json` 分 4 片；**不含 golden 语料**）+ 服务器冒烟（boot / `/healthz` / 首页 / doctor） | 显式 `CI=1`、`SP_E2E=0`、`RENDER_E2E=0`、**`MATCH_SEEDS=20`**（本地默认 6）；golden 语料检查在 `golden` job |
| `golden` | `npm run test:golden` + `npm run golden` + `node tools/golden.mjs --version act3autochess@V3_1` | **完整语料**（默认 + 规程）+ 套件的 golden 检查（默认/规程重算、完整性）；漏重算会在这里红 |
| `tooling` | `eslint`（warning 预算 200）+ `check:imports` + `typecheck` | 不跑游戏 |
| `node 24 (guards)` | CI 布线守卫 + 文档/打包门禁 | node 24 的轻量通道 |
| `mobile-audit` | `npm run check:mobile`（640×360 … 1024×768） | 截图作 artifact；破坏布局会红 |
| `browser-smoke` | `npm run test:browser:smoke`（协议启动 + 快捷键/设置入口 + 异形屏适配 + 标题页/安装 + 一局 mock 交互；约 2.5 分钟） | 只用 mock 页面，**不需要 `public/assets`**；`setup-chrome` 提供 Chrome，漏 Chrome 直接报错而不是静默 skip |

推送 / PR 都触发；`concurrency` 按 ref 取消旧任务。

## 7. 新增一个测试放在哪

| 改了什么 | 放哪 | 参考 |
|---|---|---|
| 规则 / 数值 / kit / 敌人 | `test/content/`（干员/敌人）或 `test/sim/`（引擎） | `test/content/kits_alt_t5.test.js` |
| 对局流程 / 经济 / bot | `test/match/` | `test/match/bot.test.js`、`fixtures` 在 `test/match/harness.js` |
| 渲染 / HUD / 插值 | `test/render/`（纯逻辑）或 `*.browser.test.js`（真 Chrome） | `test/render/attack-rate.test.js` |
| 插件 / Keel / 内容集 | `test/plugins/`、`test/keel/` | `test/plugins/manifest.test.js` |
| 工坊（studio）后端：访问门、key、上传校验、目标索引 | `test/studio/`（纯函数 / 临时目录，不需要服务器与 Chrome） | `test/studio/gate.test.js` |
| 手机 / 响应式 | `test/mobile/` + `public/dev/mobile-audit.html` | `docs/MOBILE-UI.md` §7 |
| 文档 | `test/docs-*.test.js`（通常不用加，改内容即可） | `docs/README.md` §7.4 |

## 8. 失败怎么排

1. 单跑该文件：`node --test <file>`；仍红 → `--test-concurrency=1` 排除资源竞争。
2. 看是否 golden 移动：`node tools/golden.mjs` 会列出场景与字段差异。
3. 若是 `match` 类整局用例，先确认 seed / `timerScale` / `botSliceMs` 没被改动。
4. 判断"是不是我改的"：`git stash` 后复跑一次（本仓库的惯例，见 `PROJECT-STATE.md` §9 的已知项）。
5. 确认是真回归再改代码，**不要改断言**。
