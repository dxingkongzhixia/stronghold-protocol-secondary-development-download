# 内容集构建：机制、缓存与排障 / Content-set builds: mechanics, caches, diagnosis

> 状态：维护中（2026-11-02）。**本页是「房间插件内容集构建」这一主题的唯一位——机制、缓存键、环境变量、排障
> 步骤和踩过的坑都在这里。** 规格在 [`PLUGINS.md`](PLUGINS.md) §11，部署与变量速查在 [`DEPLOY.md`](DEPLOY.md)，
> 当前线上状态在 [`PROJECT-STATE.md`](PROJECT-STATE.md)。
>
> 为什么单独成页：2026-11-01/02 排查「开插件房很占 CPU / 切插件要等很久」时发现，这条链路上有 **4 层缓存**、
> 1 个按环境变量开关的子进程、以及若干「不报错但退化」的路径。任何一层失配都不会报错，只会悄悄变慢——
> 那次真实故障就是 3 个独立的退化叠在一起。这页就是当时的教训。

---

## 1. 一次构建做什么

`buildContentSet({ registry, ids, settings })`（`server/plugins/contentSet.js`）：

1. `base` = 一次性的 vanilla 快照（data + i18n + 文件字节，`deepFreeze`，按 registry 缓存）；
2. 按 `resolvePluginOrder` 的顺序，逐个插件把 `data` / `operators` / `enemies` / `stages` / `modes` 的补丁或记录
   应用到数据上（copy-on-write：只复制写到的表和到字段的路径）；
3. 校验（`validateGameplayData`）、语言叠加、官方 bounds 快照；
4. 对 **每张表** 判断「有没有变」：身份没变就沿用 base 的字节和 sha256，变了才 `JSON.stringify` + sha256；
5. 算出 `cs`（内容标识），产出 `index.json` 和该集自己服务的文件。

代价应当**跟随「改了什么」**，而不是数据集大小。2026-11-01 之前是后者：每个 patch 深拷贝 7 MB、每张表和每套
i18n 用 `canonicalJson` 序列化两遍、所有文件重算 sha256、整树再 `deepFreeze` 一遍——所以「只加一个干员」和
「重算整个数据集」一样贵。那次改动的实测：vanilla 300 → 25 ms，5 个插件 800 → 200 ms。

## 2. 四层缓存（以及各自的键）

| 层 | 键 | 位置 | 失配时发生什么 |
|---|---|---|---|
| 进程内构建缓存 | `cs` | `contentSet.js` 的 `caches`（按 registry） | 用已有集，不重新组装 |
| rooms 的 memo | `ids` + 每个插件的 `content.hash` + `manifest` + `status` + 归一化 `settings` | `contentSets.js` 的 `memo` | 未命中 → 走下一层 |
| 落盘缓存 | 上面的 memo key **+ vanilla 身份**（`app` / `sim` 代码哈希 / data 文件哈希） | `.cache/content-sets/<sha32>/` | 未命中 → 真正构建 |
| 浏览器 | `cs` | 页面内存 `checked` | 未命中 → 重新下载 + 逐字节校验 |

**关键点：memo 的键里必须同时包含「插件 id 的顺序」和「插件内容哈希」。** `resolve()` 拿到的是
`resolvePluginOrder` 排好序、补全依赖之后的列表；如果预热（prebuild）用原始请求列表算键，两者永远对不上，
memo 永远 miss——而 miss 只意味着「慢」，不会报错。这就是第 4 节第 2 条。

落盘缓存只存**该集自己服务的文件**（变更的表 + manifest，几 MB），未变更的表从 vanilla base 借用；载入时先
核对 manifest → `cs`，再核对每个字节 → manifest，任何一条不符就整条丢弃并回退构建。

## 3. 构建跑在哪 & 环境变量

| 变量 | 作用 | 生产取值 |
|---|---|---|
| `SP_CONTENT_BUILDER=1` | 构建在**子进程**（`server/plugins/contentBuilderChild.js`，开机即起、插件扫描算进启动）；主线程只接收结果。关掉 = 老的主线程同步构建（也是构建失败时的回退） | `1` |
| `SP_CONTENT_CACHE=1` | 构建结果落盘（默认**随子进程构建一起开启**）；`0` 关闭 | 随上者默认开 |
| `SP_CONTENT_CACHE_DIR=…` | 落盘目录（默认 `<repo>/.cache/content-sets`，上限 48 条 / 256 MB，最旧先淘汰） | 默认 |
| `SP_PLUGIN_DEBOUNCE_MS` | 可选的合并窗口。**不设或 0（推荐）：变化即构建、构建完即应用**；设大值 = 每次切换固定等这么久 | **不设** |

`room.setPlugins` 的行为：记录待处理集 → 立刻让子进程构建 → 构建完如果仍是最新选择就应用（同一房间同时只跑
一个构建；更新的点击会在当前构建结束后按最新集再跑一次）。启动或开局前 `_flushPlugins` 会同步应用待处理集。

## 4. 踩过的坑（症状 → 真因 → 怎么确认 → 修法）

| # | 症状 | 真因 | 怎么确认 | 修法 |
|---|---|---|---|---|
| 1 | 切一下插件要等 **5 秒** | 生产 `SP_PLUGIN_DEBOUNCE_MS=5000`，把「等」写死在关键路径 | `grep SP_ /www/server/nodejs/vhost/scripts/server.sh` | 删掉该变量（2026-11-02 已删） |
| 2 | 应用阶段 200–1300 ms，开房瞬间满核 | 预热用的 id 顺序与 `resolve()` 交给构建器的顺序不同 → memo 键不匹配 → 改在**主线程**同步重建 | `/admin/api/state` 的 `contentSets`：`builds` 一直涨而 `memoHits` 不涨 | `roomSets.prebuild` 用与 `resolve` 相同的 `resolvePluginOrder` 顺序（已修） |
| 3 | 日志里 `[process] uncaught exception ... prebuild is not a function` | 房间的 `contents` 是 **Keel 包装层**（`createKeelContentSets`），它没转发 `prebuild`；定时器里抛错被全局兜住，界面继续但走同步构建 | `grep -a uncaught /www/wwwlogs/nodejs/server.log` | 包装层补 `prebuild` / `prebuildEnabled`（已修） |
| 4 | 带 prts 一类插件的房间**每次**应用都重建 | Keel 内容快照没有 `content.hash` → `memoKey()` 返回 `null` → 无法记忆化 | 临时在 `memoKey` 打印缺 hash 的 id；或 `stats.memoHits` 长期为 0 而 `builds` 涨 | `createKeelContentSets` 用 `withContentHash()` 给快照补指纹（已修） |
| 5 | 重启后开同一插件房又慢 | 落盘缓存未命中：变量没开 / vanilla 身份变了（改了 `shared/**` 或 `data/**`）/ 条目被淘汰 | `ls .cache/content-sets \| wc -l`，`/admin/api/state` 的 `cacheHits` | 首次必须重建一次；之后应命中。改了代码/数据就不命中，这是设计 |
| 6 | `npm test` 报 `server/…:33 imports ./x.js (not shipped)` | 新文件没 `git add`，包测试按 `git ls-files` 生成「哪些文件会随包发布」 | 报错原文 | 先 `git add` 再跑全量 |
| 7 | 上线后某个插件「消失」 | 11-01 起**不再加载官方 manifest 2**；只认 Keel（manifest 3） | 启动日志 `plugins/<id>/ skipped: plugin.json: manifest 2 is no longer loaded` | `node tools/keel.mjs import <id> --write` → `check <id> --strict` → 重启（2026-11-02 对 `prts-kaltsit` / `prts-source-code` 做过） |
| 8 | 日志里看到「新」报错，其实是几小时前的 | `server.log` 是**追加**文件，跨多次重启 | 先找最后一次启动横幅：`grep -an '卫戍协议' log \| tail -1`，只看它之后的行 | 不要按 `tail -n` 判断新旧（这次差点误判成回归） |
| 9 | 生产行为和仓库对不上 | 生产上手工打过补丁（5 秒防抖直接改 `server/lobby.js` + `server.sh`），一次覆盖部署就被抹掉 | 部署前后比 `/healthz` 的 `build` 与磁盘 `computeBuildTag()`；查 `git status` | **永远只改仓库**；生产只做「覆盖部署 + 重启」 |

## 5. 排障步骤（线上）

```bash
# 1) 服务在跑吗、build 与磁盘一致吗
curl -s http://127.0.0.1:3000/healthz
cd /www/wwwroot/Stronghold-Protocol && node -e 'import("./server/http/buildTag.js").then(m=>console.log(m.computeBuildTag()))'

# 2) 子进程在不在（不在就先看日志里子进程启动错误）
ps -eo pid,pcpu,rss,args | grep contentBuilderChild | grep -v grep

# 3) 构建统计：builds / memoHits / cacheHits / lastBuildMs / sets / held（轻量只读接口；/admin/api/state 也带同一份）
curl -s "http://127.0.0.1:3000/admin/api/plugins/stats?token=<admin-token>" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.contentSets, j.counts.cacheHitRate)})'

# 4) 落盘缓存
ls -1 .cache/content-sets | wc -l; du -sh .cache/content-sets

# 5) 最近的构建与错误（只看最后一次启动横幅之后）
LAST=$(grep -an '卫戍协议' /www/wwwlogs/nodejs/server.log | tail -1 | cut -d: -f1)
awk -v n="$LAST" 'NR>n && (/plugins:/ || /refused/ || /uncaught/) { print }' /www/wwwlogs/nodejs/server.log
```

**健康的样子**：`contentSets` 里 `memoHits` 随切换增长、`builds` 只在「新组合」时 +1、`cacheHits` 在重启后出现；
`lastBuildMs` 100–400 ms（子进程）；日志里每次切换一条 `[lobby] <CODE> plugins: …`。

**要单独测一次构建**（不动线上进程）：

```bash
node --input-type=module -e '
import path from "node:path";
const ROOT = process.cwd();
const dirs = { publicDir: ROOT + "/public", dataDir: ROOT + "/data", packsDir: ROOT + "/packs", pluginsDir: ROOT + "/plugins" };
const log = { info(){}, warn(){}, error(){}, debug(){} };
const { createPluginRegistry } = await import(ROOT + "/server/plugins/registry.js");
const { buildContentSet } = await import(ROOT + "/server/plugins/contentSet.js");
const reg = createPluginRegistry(dirs, { app: "0.4.0", log }); reg.refresh(true);
reg.contentDirs = { dataDir: dirs.dataDir, simDir: ROOT + "/server/sim", sharedDir: ROOT + "/shared" };
for (const ids of [[], ["faction-yan"], ["faction-yan","faction-rhodes"]]) {
  const t = performance.now();
  const set = buildContentSet({ registry: reg, ids });
  console.log(ids.join("+") || "vanilla", Math.round(performance.now() - t) + "ms", set.problems?.length ? "PROBLEMS" : set.cs.slice(0, 8));
}
'
```

## 6. 改这条链路时必须做的验证

1. **产物字节不变**：同一组插件，改动前后 `contentSetFiles(set)` 的每个 `sha256` 必须一致（`cs` 只在
   `shared/**` 变化时才会变，因为代码本身进内容标识）。
2. **`npm test` 全绿**，并且新文件已经 `git add`（否则第 4 节第 6 条）。
3. **本地起一份**，开插件房连开 3–4 个插件：`/admin/api/state` 的 `contentSets` 应看到 `memoHits`/`cacheHits`
   增长、`lastBuildMs` 在几百毫秒内，`ps` 里能看到 `contentBuilderChild`。
4. 重启一次，再开同一个组合：应命中落盘缓存（`cacheHits`+1，`builds` 不涨，开房到内容生效 < 50 ms）。
5. 部署到线上后按第 5 节排障步骤确认一遍，再发完成通知。
