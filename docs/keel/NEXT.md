# Keel 当前检查点

> 状态：**第一阶段完成；可用**。功能见 [`FEATURES.md`](FEATURES.md)，剩余/边界见 [`REMAINING.md`](REMAINING.md)。
> 代码状态：**已提交 `c3fd7dca7`**（2026-10-31，github / gitee 已同步）。`plugins/*` 不随仓库提交，
> 迁移后的 `plugin.keel.json` 是**每台机器的本地状态**；新机器上 `node tools/keel.mjs exit` 会先列出未迁移的插件。
> 基线：`npm test` 8799 / 8758 / 0 / 41；`check:keel` 169 / 169；docs gates 35 / 35。

## 1. 现在是什么状态

| 项 | 状态 |
|---|---|
| 插件入口 | 只有 manifest 3；manifest-2 文件夹返回 `PLUGIN_LEGACY_REMOVED` |
| 模块 | content / asset / sim / match / policy / ui / lang |
| 原生 sim | 客户端 Worker（WorkerSimHost / SES / 确认 / 心跳 / 超时） |
| match / policy | 服务端 match host meta；浏览器不下载 meta 代码 |
| 委托 | bot / 接管 / 无人类 boss；房主优先，每浏览器最多 8 field |
| 房主迁移 | 断线与主动离开都已验证；剩余真人接管 host 与 field |
| 作者链路 | `keel new/dev/test/pack/exit`、studio、Forge、模板、迁移 |
| V2 | `compat.v2Script` 正式兼容运行时；不是技术债 |
| trusted | 不支持；`trust: "native"` 拒绝 |
| 测试 | 全量绿；真实 Chrome E2E 覆盖原生房间/房主离开/无人类 boss |

## 2. 已完成的功能（摘要）

- manifest 3、能力、依赖、`provides/consumes`；
- content：记录/补丁/干员/敌人/波次/模式/DSL/offers/i18n；
- asset：视觉覆盖、Spine/音频/FX/主题、`/vs` `/p`；
- sim：hooks、状态、视图、命令、RNG、预算、Worker；
- match / policy：服务端 meta；
- ui：槽位 frame / postMessage；
- lang：语言覆盖；
- `/cs`、`index.keel`、原生源码下发与 pin；
- 1–4 座、AI、委托、房主迁移、server fallback；
- studio / Forge / 模板 / `keel import`。

完整说明见 [`FEATURES.md`](FEATURES.md)。

## 3. 恢复命令

```bash
cd D:/Git本地库/stronghold-protocol-secondary-development-download
git status --short --untracked-files=all
npm run check:keel
node tools/keel.mjs exit
npm run typecheck
npm test
```

真实浏览器 E2E：

```powershell
$env:SP_E2E='1'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/ui/native-room.e2e.test.js
node --test test/ui/native-boss.e2e.test.js
```

> 两个 E2E 文件各自启动多个浏览器，建议分开跑。

插件检查 / 迁移：

```bash
node tools/keel.mjs check prts-kaltsit --strict
node tools/keel.mjs check prts-source-code --strict
node tools/keel.mjs check black-snake --strict
node tools/keel.mjs import <legacy-id> --write
node tools/keel.mjs migrate <legacy-id> --write
```

## 4. 不要做

- 不要在未明确要求时 commit / push / deploy；
- 不要手写 `data/*.json`；
- 不要为了让测试通过而放宽 `plugin.keel.json` 校验；
- 不要把 `compat.v2Script` 当遗留代码删除；它是正式兼容线；
- 不要把 `trusted.server/page` 迁进 Keel；
- 不要在页面内执行插件代码或加 `unsafe-eval`。

## 5. 相关文件

- [`FEATURES.md`](FEATURES.md)：功能总览。
- [`REMAINING.md`](REMAINING.md)：剩余项/边界。
- [`RUNTIME.md`](RUNTIME.md)：Worker、meta、委托。
- [`MANIFEST-V3.md`](MANIFEST-V3.md)：manifest 3。
- [`COMPAT-V2.md`](COMPAT-V2.md)：V2 迁移。
- [`CONTRACTS.md`](CONTRACTS.md)：扩展点。
- [`HISTORY.md`](HISTORY.md)：里程碑、关键决策与旧文档去向。
