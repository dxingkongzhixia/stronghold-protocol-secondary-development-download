# 测试系统（TESTING）

<!-- doc: role=ops status=current -->

> **唯一入口**。测试的分层、命令、门禁、golden 规则、浏览器约定、CI 与不稳定项都在这里；其它文档只做指针
> （`AI-AGENT.md` 是速查，`README.md` 是索引）。
>
> 一句话：**代码 + 测试是最终事实**。文档只描述系统，不写死数量——文件/用例的清单一律由
> [`TEST-INVENTORY.md`](TEST-INVENTORY.md)（自动生成）给出。

## 0. 更新策略（代码变，测试必须跟着变）

测试不是一次性的快照，而是**代码的契约**。一次改动包含三件事：改代码、改/加测试、必要时改文档——**同一个提交**，
不允许“先红着，回头再说”。

| 情形 | 必须怎么做 |
|---|---|
| 行为 / 数值 / 规则变了 | 先写一个**会失败**的回归（红），再改代码到绿；断言写清期望与实际 |
| 只改实现、行为不变 | 测试**不许动**；动了就是行为变了，回到上一行 |
| 数据/文案/UI 结构变了 | 同一次改动更新对应断言；**不要**为了变绿而放宽断言或跳过 |
| 功能删除 | 同一提交删除它的测试；不允许留下永久 skip |
| 临时跳过 | `{ skip: '<原因>（issue #N）' }`——原因与工单号必须写出来，且要有恢复条件 |
| 移动 golden | 先归因（§6），代码与 golden 分两个提交 |
| 新增/拆分/改名测试文件 | 跑 `npm run test:inventory` 重新生成清单（否则 `npm test` 会红） |
| 函数变大 | 单函数**自有逻辑行**（扣除嵌套函数、注释和空行）超过 **300** 视为超预算：不得新增、不得变大；`npm run complexity:check` 对照 `tools/complexity-budget.json`，存量大函数只许缩小 |
| 改了文档 | 跑 `npm run docs:check`；涉及命令/路径的，守卫测试会核对 |
| 浏览器 UI 改动 | 同步 `data-testid` / 角色 / aria 的契约（§5），并跑 smoke；深水区跑 `test:e2e:assets` |

**选择器契约**：浏览器用例只依赖 `data-testid`、ARIA 角色/`aria-label`、以及**用户可见文案**。不要拿布局类名
（`.gm__gear`、`.x.y`）当契约——它们会随着样式重排改变，这正是过去一批 e2e 失效的原因。产品侧改名/删除
`data-testid` 时，同一次改动更新用例；新增交互入口时优先给它一个 testid。

**动态来源**：`docs/INDEX.md`（文档 front-matter）与 `docs/TEST-INVENTORY.md`（测试清单）都是生成的；
`docs:check` / `npm test` 会拒绝过期版本。命令、工具路径、版本号由 `test/docs-facts.test.js` 对照真实文件校验。

## 1. 分层

| 层 | 入口 | 跑什么 | 何时必须 |
|---|---|---|---|
| **单元 / 集成** | `npm test` | 引擎单步、整局虚拟时间、假 PIXI、插件/工坊纯函数 | 每次改动 |
| **快速档** | `npm run test:fast` | `test/fast.list`：文档、i18n、经济、版本数据、golden fast 子集（≤2 分钟） | 本地循环 |
| **golden 语料** | `npm run test:golden` | 固定场景的确定性摘要（默认 + 规程；CI 跑完整语料） | 碰玩法/数值/kit/bot |
| **浏览器 smoke** | `npm run test:browser:smoke` | mock 页面：协议启动、快捷键、设置入口、异形屏适配、标题/安装、一局交互 | 碰 `public/**` / `server/http` |
| **素材 e2e** | `npm run test:e2e:assets` | 真服务器 + 素材：standin / spectator / teammate-loadout / leftovers / watch-bonds | 碰联机/观战/配装 |
| **native room** | `SP_NATIVE_E2E=1 npm run test:e2e:assets -- --native` | 多浏览器原生房间（3–8 分钟/文件） | 碰 native 房间 / 委托 |
| **文档守卫** | `node --test test/docs-*.test.js` + `npm run docs:check` | 链接、编码、路径、措辞、front-matter、索引、测试清单 | 碰任意 `docs/` |

CI 只守前三层 + smoke（§8）；素材与 native 是本地/夜间通道，不阻塞发布。

## 2. 改了什么 → 必跑什么

| 改动 | 最小集合 |
|---|---|
| `server/sim/**`、`shared/**`、规则/数值/kit | `npm run test:fast` → 相关 `test/sim|content` → `npm run test:golden`（移动则归因） |
| `server/match/**`、bot、经济 | `test:fast` + `test/match/*` + golden（对局族） |
| `public/js/**`、`public/css/**`、`public/dev/**` | `test:fast` + `npm run test:browser:smoke`；深水区 `test:e2e:assets` |
| `server/http/**`、CSP、静态资源 | `test:fast` + `npm run test:browser:smoke` + 相关 `test/plugins/csp.test.js` |
| `docs/**` | `npm run docs:check` + `node --test test/docs-*.test.js` |
| CI / 工具 / 打包 | `node --test test/ci.test.js test/package*.test.js` + `npm run test:inventory` |
| 任意提交前 | `npm test`（本地 6 seeds；发布前 `MATCH_SEEDS=20 npm test`） |

## 3. 命令

| 目的 | 命令 |
|---|---|
| 全量 | `npm test`（**不含 golden 语料**；`--test-timeout=600000` 兜底挂起；本地 full-match **6 seeds**） |
| 发布前全量 | `MATCH_SEEDS=20 npm test` |
| 快速档 | `npm run test:fast`（≤2 分钟） |
| 单个 CI 分片 | `npm run test:shard -- 2`（1..4，与 `ci-shards.json` 同一张权重表） |
| 单文件 / 单条 | `node --test test/match/bot.test.js` · `node --test --test-name-pattern="bench shed" test/match/bot-smarter.test.js` |
| golden | `npm run test:golden` · `npm run golden` · `node tools/golden.mjs --update`（先归因） |
| golden 归因 | `npm run golden:attrib -- --paths server/sim` |
| 浏览器 smoke | `npm run test:browser:smoke`（6 组 mock，约 1.5–2.5 分钟，**不需要素材**） |
| 素材 e2e | `npm run test:e2e:assets`（需 `public/assets` + Chrome；`-- --native` 加三条 native） |
| 挂起监视 | `npm run test:guard -- -- node --test --test-force-exit <file>`（整轮超时硬停 + 进程表，exit 3） |
| 文档守卫 | `node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js test/docs-facts.test.js` |
| 生成型文档 | `npm run docs:index`（`INDEX` + `TEST-INVENTORY`）；`npm run docs:check` 校验 |
| 手机矩阵 | `npm run check:mobile` |
| Lint / 类型 / 导入 | `npm run lint`（0 error，warning 预算 **203**，只降不升）· `npm run typecheck` · `npm run check:imports` |
| 复杂度预算 | `npm run complexity`（报告）· `npm run complexity:check`（超过 300 逻辑行的新函数/变大 → 红；存量见 `tools/complexity-budget.json`） |
| 数据重建 | `node tools/build-data.mjs --offline`（必须零 diff） |
| 上游侦察 | `node tools/check-upstream.mjs` |

为什么 `--test-concurrency=4`：默认按核数并行时，几十个 CPU 密集整局模拟互相抢核，lobby/心跳/限流会超时。
本地想更稳可用 `--test-concurrency=1`；浏览器套件**默认顺序跑**（多页面 headless 会互相抢）。

## 4. 写测试的约定

- `node:test` + `node:assert/strict`；一个文件一个主题；文件头注释写**为什么**（问题/报告号）。
- 用现成夹具，不要自己搭局：
  - `test/match/harness.js` → `makeMatch()`（整局、虚拟时间、`h.run()` / `h.toPrep()`）
  - `test/helpers/battleHarness.js` → `makeBattle()`
  - `test/render/fakepixi.js` → `installFakePixi()` / `fakeViewCtx()`
  - `test/mobile/matrix.mjs` → `VIEWPORTS` / `MIN_VIEWPORT` / `SAFE_AREA`
  - `test/studio/` → 工坊纯函数（gate / key / PNG 校验 / 目标索引）
- **确定性**：随机只从 `m.rng*` / 固定 seed；不 `sleep`、不读系统时间、不依赖文件 mtime。
- **外部资源缺失自己 skip**：素材、Chrome、`var/` 缺失用 `skip`（带原因），不是失败。
- **断言可诊断**：写清期望与实际（`round ${r}: ${x} fights as its pick`）。
- **静态计数不进断言**：数量类结论由生成清单或运行时读取，不写死在测试/文档里。

## 5. 浏览器 e2e 约定

- 页面 URL 带 `?e2e=1`（`public/js/e2eMode.js` 关掉**入口动画**与首个**美术资源**弹窗）；开局用
  `test/helpers/appBoot.mjs`（`openApp` / `createRoom` / `openSettings`），端口用
  `test/helpers/browserServer.mjs` 的 `startBrowserServer()`（Chrome 禁用端口会重试）。
- **场地视图异步挂载**：拖拽 / `piecePoint` / 画布点击前先 `waitForSelector('.gm canvas, .gm .ff-piece')`。
- **渲染模式**：CI 无 GPU 用 SwiftShader；本机默认硬件（`CI=1` 或 `SP_GL=swiftshader` 才强制软件渲染）。
  观战复制体可能是 **DOM fallback**（没有 canvas）：画布点单位的断言按渲染模式跳过并记录，不要假装绿。
- **配装视图**：产品默认 `deck`；测试在 `localStorage['sp.pref.loadout.view'] = 'list'` 下使用列表选择器
  （`Client` / `appBoot` 已默认写入）。
- **名字带“博士”前缀**：`pub.players[].name` 是 `博士凯尔希`；断言用后缀匹配，不要写死短名。
- 素材 e2e 用 `npm run test:e2e:assets`（每文件 600s 单测超时 + 25 分钟硬停）；`native-room` 用 `SP_NATIVE_E2E=1`。

## 6. golden 规则（硬约束）

1. 任何移动 `test/golden/*.json` 的改动必须**归因**：只回退该项 → 零差异。
2. 归因成立后，**代码与 golden 分两个提交**；golden 提交信息写清原因与受影响的族。
3. 禁止手改 golden 输出；禁止为了变绿放宽断言或跳过用例。
4. 纯显示层的事件计数也算移动，同样归因。
5. 自动归因：`npm run golden:attrib -- --paths <你的改动>`（保存 diff → 只回退你的路径 → 基线必须匹配 →
   恢复 → 必须失配）。

## 7. 不稳定项（先按环境排查，别误判成回归）

| 现象 | 原因 | 处置 |
|---|---|---|
| `visualSet` 的压缩缓存 ctime | Windows 时间戳粒度 | 复跑 |
| `robustness` 偶发超时 | 性能基线受负载影响 | 单跑确认 |
| `fetch` 撞 “bad port” | `port: 0` 落到 undici 禁用端口 | 用 `test/helpers/localFetch.js` |
| 浏览器套件 skipped | 无 Chrome / 无素材 | 设 `RENDER_E2E=1` 并准备素材；smoke 是常开子集 |
| 多个 headless 页面互相抢 | 并发渲染/CPU | 浏览器套件 `--test-concurrency=1` |
| `ERR_UNSAFE_PORT` | `port: 0` 落到 Chrome 黑名单（5060/5061/6000…） | 用 `startBrowserServer()` |
| 一个 Chrome 70%+ CPU | 曾强制 SwiftShader（软件 WebGL，约 5 核） | 本机走硬件；仅 CI/`SP_GL=swiftshader` 用软件 |
| 点击落在遮罩上 | 入口动画 / 美术资源弹窗 | `?e2e=1` + `appBoot` |
| 测试“还在跑”其实挂起 | 单测死循环 / 泄漏的 server/browser | `--test-timeout=600000`；整轮用 `test:guard`（exit 3 需人工看） |
| CI 上 `test/**` 大面积 skip | CI 显式 `SP_E2E=0` / `RENDER_E2E=0` | 预期行为，见 §8 |

## 8. CI（`.github/workflows/ci.yml`）

| job | 跑什么 | 说明 |
|---|---|---|
| `test`（ubuntu + windows） | `node tools/ci-shards.mjs --run <n>`（4 片，不含 golden 语料）+ 服务器冒烟 | `CI=1`、`SP_E2E=0`、`RENDER_E2E=0`、`MATCH_SEEDS=20` |
| `golden` | `npm run test:golden` + `npm run golden` + 规程语料 | 完整语料；漏重算在这里红 |
| `tooling` | `npm run lint`（预算 203）+ `npm run complexity:check`（函数 300 行预算）+ `check:imports` + `typecheck` | 不跑游戏 |
| `node 24 (guards)` | CI 布线 + 文档/打包门禁 | 轻量通道 |
| `mobile-audit` | `npm run check:mobile` | 截图作 artifact |
| `browser-smoke` | `npm run test:browser:smoke` | 6 组 mock，无素材；缺 Chrome 直接报错 |

## 9. 新增测试放在哪

| 改了什么 | 放哪 | 参考 |
|---|---|---|
| 规则 / 数值 / kit / 敌人 | `test/content/` 或 `test/sim/` | `test/content/kits_alt_t5.test.js` |
| 对局 / 经济 / bot | `test/match/` | `test/match/bot.test.js`、`test/match/harness.js` |
| 渲染 / HUD / 插值 | `test/render/`（纯逻辑）或 `*.browser.test.js` | `test/render/attack-rate.test.js` |
| 插件 / Keel / 内容集 | `test/plugins/`、`test/keel/` | `test/plugins/manifest.test.js` |
| 工坊后端 | `test/studio/` | `test/studio/gate.test.js` |
| 手机 / 响应式 | `test/mobile/` + `public/dev/mobile-audit.html` | `docs/MOBILE-UI.md` §7 |
| 文档 | `test/docs-*.test.js`（一般只改内容） | `docs/README.md` §7 |

新增/拆分文件后：`npm run test:inventory`，再按 §2 跑最小集合。
