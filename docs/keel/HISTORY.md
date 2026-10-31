# Keel 历史与决策

> 当前功能见 [`FEATURES.md`](FEATURES.md)。本文只保留里程碑、关键决策和“为什么现在是这样”，不再维护逐日任务流水账。
> 已经删除的早期任务文档（M0/M1/M1.5/N1/NATIVE-TASKS/INTEGRATION-PLAN/NATIVE-REBUILD/DECISIONS/DEMO/MIGRATION-REPORT/LEGACY-COMPAT/CUTOVER/EXIT）备份在本地 `_backup_keel_n5_2026-10-31/docs`；本次改动提交后也可从 git 历史恢复。

## 1. 里程碑

| 阶段 | 内容 | 结果 |
|---|---|---|
| M0 | manifest 3 读取、模块图、契约、CLI、迁移草稿 | 完成 |
| M1 | runtime、state、commands、budget、sim hooks | 完成 |
| M1.5 | 房间描述符、content set、match 接线 | 完成 |
| N1 / N1.5 | 原生模板 + 运行时；原生 sim 客户端执行 | 完成 |
| N2 | studio 编辑 manifest 3、模块字段、依赖图 | 第一版完成 |
| N3 | `keel new/dev/test/pack/exit` | 完成 |
| N4 | `keel-reference` 参考模板 + 三个真实插件 parity | 完成 |
| N5 | 旧 loader、trusted runtime、旧模板/fixtures 删除 | 完成 |
| D9 | 原生 sim / v2 sandbox 战斗进 `WorkerSimHost` | 完成 |
| D10/D11 | 服务端不跑原生 sim；match/policy 只跑服务端 meta | 完成 |
| D12 | bot/接管/无人类 boss 的 field 委托在线浏览器 | 完成 |

## 2. 关键决策

| 决策 | 结论 |
|---|---|
| 插件入口 | **manifest 3 是唯一入口**；manifest 2 先 `keel import --write` 迁移 |
| V2 兼容 | `compat.v2Script` 是**正式兼容运行时**，不是技术债；不恢复 manifest-2 直接加载 |
| 原生 sim 位置 | 浏览器 Worker；服务端不 import / 不执行原生 sim |
| match / policy 位置 | 服务端 match host meta；浏览器不下载 meta 代码 |
| 原生代码信任 | `SP_PLUGIN_SCRIPTS` + lock + pin + 每浏览器、每 content set 确认 |
| trusted | `trusted.server` / `trusted.page` 不支持；`trust: "native"` 拒绝 |
| 委托 | bot / 接管 / 无人类 boss 优先委托在线浏览器（房主优先，≤8 field），再回退服务器 |
| 房主迁移 | 断线/主动离开都先由剩余真人接管 host 与 field；没有真人才 server fallback / 销毁房间 |
| 页面安全 | 页面保持严格 CSP；不 page-wide lockdown、不加 `unsafe-eval`；插件代码只在 Worker |
| 低端设备压测 | 暂缓；4× CPU throttle 基准已完成，不阻塞功能 |

## 3. 为什么删除旧文档

- 任务文档是过程记录，完成后会与当前功能漂移；
- 同一状态在 M0/M1/M1.5/N1/NATIVE-TASKS/NEXT/REMAINING 多份重复；
- 旧文档里的 `KEEL=1`、manifest-2 双载入、trusted 路径、sandbox frame 等描述已被 N5/D9 取代；
- 当前只需要：**功能（FEATURES）→ 规格（MANIFEST/CONTRACTS）→ 运行时（RUNTIME）→ 兼容（COMPAT-V2）→ 状态（NEXT/REMAINING）**。

## 4. 相关文件

- [`FEATURES.md`](FEATURES.md)：功能矩阵与边界。
- [`MANIFEST-V3.md`](MANIFEST-V3.md)：manifest 3。
- [`CONTRACTS.md`](CONTRACTS.md)：扩展点。
- [`RUNTIME.md`](RUNTIME.md)：Worker / meta / 委托。
- [`COMPAT-V2.md`](COMPAT-V2.md)：manifest 2 → 3 迁移。
- [`NEXT.md`](NEXT.md)：检查点与命令。
- [`REMAINING.md`](REMAINING.md)：剩余项/明确不做。
