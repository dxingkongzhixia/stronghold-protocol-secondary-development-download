# 性能与加载（PERFORMANCE）

<!-- doc: role=ops status=current -->

> **唯一入口**：首屏/重复访问/运行时帧率/服务端 bot CPU/启动与内存的**基线、目标、方案与度量方法**都在这里。
> 代码行为、规则与 golden 不在本文范围；性能改动不得改变它们。
>
> 基线日期：**2026-11-22**。数字或方案变化时更新 §1 / §9；度量方法见 §7。

## 0. 规则

1. **先量再改**：同一台机器、同一命令、同一场景下对比；记录原始 JSON，不凭感觉。
2. **性能改动不改行为**：golden、数据产物、sim 结果、bot 胜率都不因优化而变；必须变的先单独讨论。
3. **每一阶段都过门禁**：`npm test` + `npm run test:browser:smoke`；渲染改动再加 `RENDER_E2E=1` 的截图/帧率对比。
4. **不做未授权的上线**：本文只描述方案；部署仍按 `AI-WORKFLOW.md`，需要 owner 明确点头。
5. **预算优先于“感觉快”**：新增性能回退测试后，超过预算要修代码或降级，不是改预算。

---

## 1. 基线（2026-11-22，本机实测）

### 1.1 方法与环境

| 项 | 值 |
|---|---|
| 客户端首屏 | 本地服务器 + headless Chrome + CDP 网络节流；清空缓存；1280×720 / DPR 1 |
| 网络场景 | LAN；以及 20 Mbps 下行 / 5 Mbps 上行 / 50 ms RTT（HTTP/1.1 模拟） |
| 生产协议 | 已确认 **ALPN h2**；文本响应 brotli 正常 |
| 静态依赖图 | acorn 递归解析 `public/js/main.js` 的静态 import（不含动态 import） |
| 运行时 | `node tools/perfbench.mjs`（headless Chrome，CPU 1×/4×/6×） |
| 服务端 | `node tools/botbench.mjs`；真实启动计时到 `/healthz` 200 |

### 1.2 首屏

| 指标 | 值 |
|---|---|
| `main.js` 静态依赖图 | **224 个模块**，3.0 MiB raw / **914 KiB br** |
| `index.html` 引用 CSS | 25 个文件，736 KiB raw / 148 KiB br |
| 首屏请求（到可操作） | **250 个**（216 JS + 26 CSS） |
| 首屏传输 | **1.46 MB** |
| FCP / 可操作（LAN） | 268 ms / **522 ms** |
| FCP / 可操作（20 Mbps、50 ms、h1） | 516 ms / **4.3 s** |

可延迟模块的独占成本（静态 import 改动态 import 后首屏可省下）：

| 模块 | 独占模块数 | raw | br |
|---|---:|---:|---:|
| `public/js/screens/game.js` | 49 | 608 KiB | 185 KiB |
| `public/js/screens/loadout.js` | 7 | 110 KiB | 32 KiB |
| `public/js/audio.js` | 3 | 101 KiB | 28 KiB |
| `public/js/battle/runner.js` | 4 | 86 KiB | 25 KiB |
| `public/js/ui/codex.js` | 2 | 78 KiB | 19 KiB |
| `public/js/content.js` | 2 | 58 KiB | 15 KiB |
| `public/js/ui/allianceScene.js` | 1 | 56 KiB | 16 KiB |
| `public/js/screens/stats.js` | 1 | 39 KiB | 11 KiB |

> 只把对局界面与它独占的 49 个模块改成按需加载，首屏就少 **49 个请求 / 608 KiB raw / 185 KiB br**。

### 1.3 首访美术预热

`public/js/main.js` 的 `preloadArt()` 当前使用 `collectArtUrls(manifest, 'all')`：

| 范围 | 图片数 | 体积 |
|---|---:|---:|
| `all`（当前预热） | 2521 | **138.9 MiB** |
| `boot`（仅图标/头像） | 1494 | 50.9 MiB |
| 其中角色头像 | 425 | 24.7 MiB |
| 其中敌人图标 | 253 | 10.6 MiB |

首屏不显示这 678 张头像/敌人图标，却全部进入后台预热。当前有 boot gate + CDN 镜像兜底，但移动网络/流量敏感用户仍然承担 139 MiB 的后台下载。

### 1.4 重复访问

| 指标 | 值 |
|---|---|
| 第二次打开（缓存已存在） | 仍然 **250 个请求** |
| 第二次传输 | 仍然 **1.43 MB** |
| 原因 | `server/http/files.js` 对 `.html/.js/.mjs/.css` 返回 `Cache-Control: no-store` |

`public/js/ui/buildGuard.js` 已负责“部署后旧页面”的提示/刷新，因此这里有优化空间；但这是既有设计取舍，改动前必须做 A/B（§3.3）。

### 1.5 客户端运行时（`tools/perfbench.mjs`）

| 场景 | fps | p95 | 备注 |
|---|---:|---:|---|
| 1× CPU，普通战（19 单位） | 118–144 | 7 ms | 高端桌面 |
| 4× CPU，普通战 | 40 | 41.6 ms | 11.5% 帧 >33 ms |
| 4× CPU，2 人联防（冷样本） | 18 | 83 ms | 含场景加载长任务 |
| 4× CPU，2 人联防（预热后） | 37.7 | 41.7 ms | 20.6% 帧 >33 ms |
| 6× CPU + low，普通/联防 | 15.9 / 19.3 | 118 / 69 ms | 低端近似 |

预热后的 CPU profile：

| 区域 | 占比 |
|---|---:|
| `frameBody`（Pixi 渲染前的 JS） | **41.7%** |
| Pixi render | 27.0% |
| `units.js` update | **17.4%** |
| Spine pose | 11.1% |
| sim | 3.9% |
| three.js board | 2.2% |

**结论：瓶颈是渲染/视图更新，不是 sim。** 冷样本中的长任务主要来自 3D 场景/纹理加载。

### 1.6 服务端 bot 与启动

| 指标 | solo | coop4 |
|---|---:|---:|
| bot 准备 CPU p50 / p95 | 266 / 532 ms | 171 / 344 ms |
| 其中 rehearsal p50 | 123 ms | 115 ms |
| heuristics p50 | 51 ms | 18 ms |
| 每局 bot 准备总 CPU | 3.55 s | 6.68 s |

| 启动指标 | 值 |
|---|---|
| 启动到 `/healthz` 200 | **1.54–1.60 s** |
| RSS（启动后） | 222–277 MB |

Match 已把 rehearsal 切成时间片，不会让单个回调跑完整场战斗；高并发时仍是 CPU 压力。

### 1.7 数据与素材

| 项 | 值 |
|---|---|
| `GAME_FILES`（16 个数据文件） | 7.49 MiB raw / **420 KiB br** |
| `data/assets.json` | 1.82 MiB raw / 96.5 KiB br（本地）；生产视图 br 约 248 KiB |
| `chess.json` / `backups.json` | 各约 2.1 MiB raw / 100 KiB br |
| 素材总量 | 1.53 GB（32,641 文件） |
| PNG 总量 | **519.8 MB**（头像/敌人图标是主要首访项） |
| WebP 总量 | 141.9 MB |
| MP3 总量 | 328.1 MB（首访不加载） |
| Spine `.skel` | 195.3 MB |

### 1.8 已确认不需要改的

| 项 | 结论 |
|---|---|
| 生产 HTTP/2 | **已启用**（ALPN h2）；不需要为了模块数量再上 h2 |
| 文本压缩 | 请求带 `Accept-Encoding` 时 br/gzip 正常；图片不压缩是正确的 |
| WebSocket 压缩 | permessage-deflate + context takeover 已做；实测 3,339 KiB → 284 KiB |
| 服务端启动 | 1.55 s 可接受，排在 P2 |

---

## 2. 目标与预算

| 层 | 目标 | 当前 |
|---|---|---|
| 首屏请求（冷） | ≤ 210；P1 后 ≤ 25 | 250 |
| 首屏传输（冷） | ≤ 1.3 MB；P1 后 ≤ 0.9 MB | 1.46 MB |
| 4G/50 ms 可操作（h1） | ≤ 3.5 s；P1 后 ≤ 2.5 s | 4.3 s |
| 重复访问传输 | ≤ 50 KB（304/缓存） | 1.43 MB |
| 首访后台美术流量 | ≤ 20 MB（默认） | 139 MiB |
| 4× CPU，普通/联防 | p95 ≤ 33 ms | 41.6 / 41.7 ms |
| 6× CPU + low | p95 ≤ 50 ms | 118 / 69 ms |
| bot 准备 CPU p95 | ≤ 250 ms 或 worker 化 | 344–532 ms |
| 空闲启动 RSS | < 300 MB；4 房 soak 无持续增长 | 222–277 MB |

---

## 3. P0：低成本、先做（预计 2–3 天）

### 3.1 按路由拆分客户端代码

**做什么**

- `public/js/main.js` 中静态导入的以下模块改为按需 `import()`：
  - `screens/game.js`（含对局界面与 `battle/runner.js`）
  - `screens/loadout.js` / `screens/loadoutDeck.js`（干员调配）
  - `ui/codex.js`、`screens/stats.js`（图鉴/统计）
  - `ui/allianceScene.js`、`content.js`（按房间内容/场景）
- 进入房间时预取 `screens/game.js` + `battle/runner.js`（`requestIdleCallback`，不阻塞房间界面）。
- 保持 `audio.js`、`screens/title.js` 静态（标题音乐/首屏需要）。

**预期**

- 首屏模块 224 → 约 150–170；请求 250 → 约 190–210。
- 首屏传输约 1.2–1.3 MB；4G/h1 可操作约 3.5–3.8 s。
- 生产 h2 下请求数收益较小，但解析/执行 CPU 明显下降。

**验收**

- `node tools/perfbench.mjs` 的 4×/6× 无回归。
- 进入对局无额外等待感（进房预取生效）。
- `npm run test:browser:smoke` 通过。

### 3.2 合并 CSS

**做什么**

- 新增构建步骤（计划 `tools/build-css.mjs`），按 `index.html` 的现有顺序合并：
  - `public/css/app.css`：基础 + 首屏
  - `public/css/app-game.css`：对局相关，进房加载
- 首屏只保留 1–2 个 `<link>`；开发模式仍可直接引用源文件。
- 需要时把关键首屏 CSS 内联到 `index.html`。

**预期**

- CSS 请求 26 → 2；传输字节基本不变（148 KiB br），减少 24 个 RTT/请求。
- FCP 小幅下降。

**验收**

- 首屏、房间、对局、结算的视觉回归（截图）。
- 样式顺序不变（合并顺序 = 原 `<link>` 顺序）。

### 3.3 缓存策略 A/B：`no-store` → `no-cache`

**做什么**

- 将 `server/http/files.js` 中 `.js/.mjs/.css/.html` 的 `Cache-Control` 从 `no-store` 改为 `no-cache`（保留 ETag/Last-Modified 重新验证）。
- A/B 指标：
  - 第二次访问的 304 数量、传输量、可操作时间；
  - `buildGuard` 在部署后是否仍能触发刷新；
  - 同一次页面加载中是否出现新旧模块混用。
- 若不接受 `no-cache`，改用 §4.2 的 Service Worker（按 build tag 缓存）或 §4.1 的 hash bundle。

**预期**

- 第二次传输 **1.43 MB → 约 5–20 KB**。
- LAN 重复访问可操作 0.66 s → 约 0.4 s；生产 h2 下接近瞬时。

**风险**

- 这是对现有“每次取最新代码”策略的改动；必须用真实部署 + `buildGuard` 验证。保留可快速回退的开关。

### 3.4 收窄首访美术预热

**做什么**

- `preloadArt()` 默认只预热标题/大厅当前可见的图片；头像、敌人图标按需加载。
- 进入房间时预热本局可能用到的干员/敌人图标。
- 保留“玩家选择缓存到本地”时的全量后台缓存（这是明确的选择）。

**预期**

- 默认首访后台流量 139 MiB → **约 10–20 MB**。
- 移动网络下不再与 JS/数据抢带宽；首屏时间基本不变。

**风险**

- 依赖“预热过才不闪图”的界面需要占位图/渐显；复用 `installImageFallback`。

---

## 4. P1：结构性优化（预计 3–5 天）

### 4.1 生产构建 bundle + content hash

- 以 `public/js/main.js` 为入口，使用 esbuild（devDependency，计划）：
  - `--bundle --splitting --format=esm --minify`
  - 输出 `public/dist/<entry>.<hash>.js` + 按路由 chunk
- 生产 `index.html` 引用 hash 入口；开发/测试继续用原生模块。
- 构建时 alias `preact` / `htm`；插件与内容集的运行时动态模块保持 URL 加载。
- hash 产物配 `Cache-Control: immutable`。

**预期**

- 首屏请求 ≤ 25；JS 传输约 0.6–0.8 MB。
- 4G/h1 可操作约 2–2.5 s；生产 h2 约 1.2–1.8 s。
- 重复访问接近 0 请求。

**风险**

- 构建/调试复杂度、source map、动态 import/插件 UI 兼容；必须保留“不 bundle”的开发开关。

### 4.2 Service Worker 缓存 App Shell（可选替代 bundle）

- 现有 `public/sw.js` 只缓存 `/assets|/fonts|/vendor`。
- 扩展到 `/js|/css|/shared|/sim|/data`，缓存名带 `/healthz` 的 build tag：
  - 新 build → 新 cache；旧 cache 在 activate 时删除。
  - cache-first + 后台更新。
- 收益接近 bundle 的“重复访问”部分，但首次仍需下载全部模块。

### 4.3 数据拆分

- `GAME_FILES` 7.49 MiB raw / 420 KiB br，其中 `chess.json`、`backups.json` 各 2.1 MiB。
- 拆为索引 + 详情：
  - `chess.index.json`（商店/列表/基础字段）
  - `chess.details/<id>.json`（详情面板首次打开时取）
  - `backups` 同理。
- 首屏只加载 `config` / `assets`；进房 warm 索引；详情按需。

**预期**

- 进入对局的数据传输下降 40–60%；首屏影响有限（P1 后段）。

**验收**

- `node tools/build-data.mjs --offline` 不改 `data/`；golden 与数据守卫全绿。

---

## 5. P2：运行时与服务端（预计 1–2 周）

### 5.1 客户端渲染（最高运行时优先级）

目标：4× CPU 普通/联防 p95 ≤ 33 ms；6× CPU + low p95 ≤ 50 ms；预热后无 >100 ms 长任务。

按 profile 下手：

1. **`units.js` update（17.4%）**
   - 离屏/被遮挡单位跳过视图更新；远处单位降低动画/血条刷新频率。
   - 合并同帧的 transform / 文本更新。
2. **Spine pose（11.1%）**
   - 非焦点、远处单位以 30 Hz 更新 Spine；扩大 impostor 适用面。
   - 检查 `pickImpostorInterval` 在 loadLevel 3 是否足够激进。
3. **`frameBody`（41.7%）**
   - 找出每帧重复计算的静态几何/排序/可见性，移到状态变化时。
   - 低质量下更早降级粒子/官方特效。
4. **自适应降级**
   - 评估 `adaptLoad` 在 loadLevel 2/3 更早降 renderScale、关闭阴影/官方特效的阈值。
5. **对局加载抖动**
   - 冷样本 783–1702 ms 长任务主要来自 3D 场景/纹理；分帧/分块加载，先画 2D 地块再替换。

**验收**

- `node tools/perfbench.mjs` 固定 4×/6× 两组，p95 回归 >10% 红。
- `RENDER_E2E=1` + 截图对比，画面不变。

### 5.2 服务端 bot CPU

现状：rehearsal 占大头（p50 115–123 ms），heuristics 只占 18–51 ms。

选项（按收益/风险排序）：

1. **Worker 线程**：bot rehearsal 放 worker pool，主线程只收结果；工程量大但最彻底。
2. **rehearsal 结果复用**：相同 board/shop/round 状态复用；需要完备的状态键。
3. **降低默认 rehearsal 数**：行为/强度会变，必须 owner 同意，并用 `node tools/botbench.mjs --compare old.json new.json` 对比胜率/回合数。
4. **更细的时间片**：降低单片预算，减少对 10 Hz `m.public` 的抖动。

**目标**：单次 bot prep p95 < 250 ms；4 人房并发时主线程无 >50 ms timer 延迟。

### 5.3 启动与内存

- 1.55 s 启动可接受；若要 <1 s：
  - 延迟加载非启动路径（`server/studio`、`server/plugins/forgeImport` 等）。
  - 数据文件按需读取。
- 加 soak：4 个 coop4 房间跑 30 分钟，记录 RSS / 事件循环延迟 / bot 队列。
- 目标：空闲 <300 MB；4 房 <450 MB；无持续增长。

---

## 6. P3：素材层（收益大、周期长）

- 头像/敌人图标 PNG（425 + 253 张，约 35 MiB）转 WebP/AVIF；目标 -50% 以上。
- 头像提供 1x/2x DPR 变体，按设备像素比选择。
- 检查大图（场景 `scene.bin`、`lm*.png`，单张 5 MB 级）是否可按需/分块。
- 音频 328 MB MP3 首访不加载；已有 `/media` 路由，保持按需。

---

## 7. 度量与门禁

### 7.1 现有工具

| 命令 | 用途 |
|---|---|
| `node tools/perfbench.mjs` | 真实战斗帧时间（1×/4×/6× CPU，可 `--profile`） |
| `node tools/botbench.mjs` | bot 准备 CPU、决策时间、胜率/回合数 |
| `npm run test:browser:smoke` | 首屏 + 一场 mock 对局的浏览器 smoke |
| `RENDER_E2E=1 node --test test/render/battle-perf.browser.test.js` | battle-perf 页的浏览器断言 |
| `npm run complexity:check` | 函数复杂度预算（与性能无关，但防止热路径函数失控） |

### 7.2 计划新增

- `tools/loadbench.mjs`：本地服务器 + Puppeteer + CDP，输出 cold LAN / cold 4G / repeat / cache 四组 JSON。
  - 指标：请求数、encoded/transfer、FCP、可操作时间、按类型分组。
- 提交 `test/e2e/out/perf/baseline.json`，作为 perfbench/botbench/loadbench 的对比基线。
- CI：先做 nightly/手动 job（机器差异大），稳定后再考虑 PR 必跑；PR 阶段可只跑 smoke。

### 7.3 记录格式

每次优化提交附：

```text
场景 / 机器 / 命令
before: fps p95, 请求数, 传输, 可操作 ms
after:  同上
结论：保留 / 回退 / 继续
```

---

## 8. 明确暂缓

| 项 | 原因 |
|---|---|
| HTTP/2 | 生产已启用 ALPN h2 |
| WebSocket 压缩 | 已做 context takeover，收益已拿到 |
| sim 算法 | profile 仅 3.9% |
| 服务端启动 <1 s | 1.55 s 可接受，排 P2 后 |
| 全量素材转 WebP | 先做“不预加载”更划算 |

---

## 9. 进度

- [ ] P0-1 按路由拆分客户端代码
- [ ] P0-2 合并 CSS（首屏 1–2 个文件）
- [ ] P0-3 缓存策略 A/B（`no-cache` + ETag）
- [ ] P0-4 收窄首访美术预热
- [ ] P1-1 生产 bundle + content hash
- [ ] P1-2 Service Worker App Shell（可选）
- [ ] P1-3 数据索引/详情拆分
- [ ] P2-1 渲染热路径（4×/6× 帧率）
- [ ] P2-2 bot rehearsal worker/缓存
- [ ] P2-3 启动与内存 soak
- [ ] P3 图片格式/DPR/大图按需

## 10. 更新记录

| 日期 | 内容 |
|---|---|
| 2026-11-22 | 建立基线（首屏 250 请求 / 1.46 MB；重复访问 1.43 MB；4× 联防 p95 41.7 ms），写入 P0–P3 方案与验收 |
