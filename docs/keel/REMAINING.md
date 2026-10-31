# Keel 剩余项与边界

> 状态：**第一阶段完成**。主链路、V2 兼容运行时、作者链路、真实房间边界验证都已完成。
> 本文只列“还没做 / 明确不做 / 需要长期维护”的内容；完整功能见 [`FEATURES.md`](FEATURES.md)，当前检查点见 [`NEXT.md`](NEXT.md)。
> 已完成任务的历史记录见 [`HISTORY.md`](HISTORY.md)。

## 1. 结论

Keel 已经可以用于实际插件开发和房间运行：

- manifest 3 与七类模块；
- 原生 sim 在浏览器 Worker；match / policy 在服务端 meta；
- bot / 接管 / 无人类 boss 的 field 委托；
- 房主断线、房主主动离开、最后一人离开、server fallback；
- 作者链路（CLI / studio / Forge / 模板 / 迁移）；
- V2 作为正式兼容运行时保留。

没有已知的功能阻塞。剩下的都是可选项、外部插件迁移和长期维护。

## 2. 可选项（不阻塞）

### 2.1 工作室模块表单深化

第一版已经支持：

- manifest 3 清单 / 基本信息；
- 模块列表、模块文件；
- content 的 `parts` / `provides` / `consumes`；
- asset 的 `assets`；
- sim / match / policy 的 `state`；
- ui 的 `slots`；
- `provides/consumes` 简单关系图；
- 新建 Keel 模板。

可以继续做的体验项：

- 每种模块更细的专用表单（而不是 JSON 文本）；
- 依赖图交互（点击跳转、缺失提供者修复建议）；
- 模板参数化（作者填写选项后生成更完整的初始内容）。

### 2.2 低端设备压测

已做：

- 4 座 + 4× CPU throttle：4 个 Worker，`avgTickMs` 约 2.6–4.1 ms，JS heap 约 70–98 MB，页面保持响应；
- 4 座房间最多 4 个 field → 4 个 Worker；
- 8 field 上限是 headless 调度压测，不是真实房间。

暂缓：

- 真实低端机 / 更多设备组合；
- 长时间运行的内存曲线。

结论：目前没有证据要求 Worker 池化；真实房间不需要。

### 2.3 V2 兼容运行时的长期维护

`compat.v2Script` 是正式兼容线：

- 用于主线插件 / Forge kit 的 `setup(sp)`；
- 仍在 Worker 的 SES 中执行；
- 仍受 lock / pin / sandbox / 浏览器确认约束；
- 不是技术债，不要求“彻底删除”。

长期维护内容：

- 跟随主线 `sp:sdk@1` 的签名变化；
- 保持 `keelToV2` 投影与共享 content/visual 编译器一致；
- 新插件优先写原生模块，不强制走 v2。

## 3. 外部插件迁移

`plugins/*` 默认不提交。当前仓库里的三个真实插件已迁移：

- `prts-kaltsit`
- `prts-source-code`
- `black-snake`

> `prts-kaltsit` / `prts-source-code` 的 `plugin.keel.json` 已随仓库强制提交（与它们的 `plugin.json`、lock 一样），
> 新机器直接可用；`black-snake` 整个目录仍只在本机（未跟踪），需要时重新 `node tools/keel.mjs import black-snake --write`。

其他机器/其他作者如果还有 manifest-2 插件：

```bash
node tools/keel.mjs import <id> --write
node tools/keel.mjs check <id> --strict
node tools/plugin.mjs pack <id>
node tools/keel.mjs exit
```

未迁移的文件夹不会静默消失：registry 会以 `PLUGIN_LEGACY_REMOVED` 跳过并写日志。

## 4. 明确不做

| 项 | 决定 |
|---|---|
| manifest-2 文件夹零改动直接加载 | 不做；先 `keel import --write` 迁移 |
| `trusted.server` / `trusted.page` | 不支持；没有受信页面/服务端 runtime |
| `trust: "native"` | 拒绝；原生代码写 `sim` / `match` / `policy` |
| 服务端执行原生 sim | 不做；服务端只用 content 数据兜底 |
| 页面内执行插件代码 | 不做；原生/兼容脚本都进 Worker |
| 页面-wide lockdown / `unsafe-eval` | 不做；页面保持严格 CSP |

## 5. 当前验证

```bash
npm test
npm run check:keel
node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js
npx eslint .
npm run typecheck
```

真实 Chrome E2E（两个文件各自启动多个浏览器，建议分开跑）：

```powershell
$env:SP_E2E='1'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/ui/native-room.e2e.test.js
node --test test/ui/native-boss.e2e.test.js
```

当前基线：

- `npm test`：**8799 / 8758 / 0 / 41 skipped**
- `npm run check:keel`：**163 / 163**
- docs gates：**35 / 35**
- typecheck：通过
- eslint：0 errors

## 6. 相关文件

- [`FEATURES.md`](FEATURES.md)：功能总览与状态矩阵。
- [`NEXT.md`](NEXT.md)：当前检查点、恢复命令、基线。
- [`RUNTIME.md`](RUNTIME.md)：Worker、meta、委托与边界。
- [`MANIFEST-V3.md`](MANIFEST-V3.md)：manifest 3 字段与模块。
- [`COMPAT-V2.md`](COMPAT-V2.md)：manifest 2 → 3 迁移。
- [`HISTORY.md`](HISTORY.md)：里程碑与关键决策。
