# 测试系统（TESTING）

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

测试文件 **939 个**，12 个目录：`content` `e2e` `fixtures` `golden` `helpers` `keel` `match` `mobile` `plugins` `render` `sim` `ui`。

## 2. 命令

| 目的 | 命令 |
|---|---|
| 全量（推荐；并发固定 4） | `npm test` |
| 某个套件 | `node --test test/match/bot.test.js` |
| 某个领域 | `node --test --test-concurrency=2 test/plugins/*.test.js` |
| 单条用例 | `node --test --test-name-pattern="bench shed" test/match/bot-smarter.test.js` |
| golden 校验 / 重算 | `node tools/golden.mjs` / `node tools/golden.mjs --update`（先归因，见 §4） |
| 文档守卫 | `node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js` |
| 手机矩阵 | `npm run check:mobile`（`tools/mobile-audit.mjs`；需 Chrome，`CHROME_PATH` 可配） |
| 浏览器渲染 | `RENDER_E2E=1 node --test test/render/*.browser.test.js`（需 Chrome + `public/assets`） |
| 联机 E2E | `SP_E2E=1 node --test "test/e2e/**"`（需浏览器与素材） |
| Lint / 类型 / 导入 | `npx eslint .`、`npm run typecheck`、`npm run check:imports` |
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

## 5. 已知不稳定（不要误判为回归）

| 现象 | 原因 | 处置 |
|---|---|---|
| `test/plugins/visualSet.test.js` 的「压缩缓存 ctime」 | Windows 文件时间戳粒度 | 复跑；与代码无关 |
| `test/sim/robustness.test.js` 偶发超时 | 性能基线受机器负载影响 | 单跑确认（35/35） |
| 浏览器套件 skipped | 无 Chrome / 无 `public/assets` | 设 `RENDER_E2E=1` 并准备素材 |
| CI 上 `test/**` 大面积 skip | CI 明确 `SP_E2E=0` / `RENDER_E2E=0` | 预期行为，见 §6 |

## 6. CI（`.github/workflows/ci.yml`）

| job | 跑什么 | 说明 |
|---|---|---|
| `test`（ubuntu + windows × node 22 / 24） | `node --test --test-concurrency=4 "test/**/*.test.js" "test/e2e/coop.e2e.mjs" "plugins/_template/**/*.test.js"` + 服务器冒烟（boot / `/healthz` / 首页 / doctor） | 显式 `CI=1`、`SP_E2E=0`、`RENDER_E2E=0`（无 Chrome / 无素材） |
| `tooling` | `eslint` + `check:imports` + `typecheck` | 不跑游戏 |
| `mobile-audit` | `npm run check:mobile`（640×360 … 1024×768） | 截图作 artifact；破坏布局会红 |

推送 / PR 都触发；`concurrency` 按 ref 取消旧任务。

## 7. 新增一个测试放在哪

| 改了什么 | 放哪 | 参考 |
|---|---|---|
| 规则 / 数值 / kit / 敌人 | `test/content/`（干员/敌人）或 `test/sim/`（引擎） | `test/content/kits_alt_t5.test.js` |
| 对局流程 / 经济 / bot | `test/match/` | `test/match/bot.test.js`、`fixtures` 在 `test/match/harness.js` |
| 渲染 / HUD / 插值 | `test/render/`（纯逻辑）或 `*.browser.test.js`（真 Chrome） | `test/render/attack-rate.test.js` |
| 插件 / Keel / 内容集 | `test/plugins/`、`test/keel/` | `test/plugins/upstream-compat.test.js` |
| 手机 / 响应式 | `test/mobile/` + `public/dev/mobile-audit.html` | `docs/MOBILE-UI.md` §7 |
| 文档 | `test/docs-*.test.js`（通常不用加，改内容即可） | `docs/README.md` §7.4 |

## 8. 失败怎么排

1. 单跑该文件：`node --test <file>`；仍红 → `--test-concurrency=1` 排除资源竞争。
2. 看是否 golden 移动：`node tools/golden.mjs` 会列出场景与字段差异。
3. 若是 `match` 类整局用例，先确认 seed / `timerScale` / `botSliceMs` 没被改动。
4. 判断"是不是我改的"：`git stash` 后复跑一次（本仓库的惯例，见 `PROJECT-STATE.md` §9 的已知项）。
5. 确认是真回归再改代码，**不要改断言**。
