# 插件问题与待办清单

> 快照日期：2026-10-20
> 代码基线：`master` `ae9e2ae3c`（插件文档提交后）
> 状态：普通插件链路可用；全量 CI **8194 tests / 8158 pass / 0 fail**；真实浏览器插件 E2E **10 / 10 pass**。
> 本文件记录**仍未解决**的问题，不把已修项写成待办。

## 状态标记

- `P0`：可能阻断生产或造成严重安全风险
- `P1`：影响兼容性、可运营性或验证可信度
- `P2`：体验、性能、文档或长期维护问题
- `TODO`：已确认，待排期
- `WATCH`：当前不是缺陷，但需要持续观察/复评

## 处理方案总览

| 编号 | 处理方案 | 规模 | 说明 / 风险 |
|---|---|---|---|
| P0-1 | 增加 trusted 生产部署基线：非 root、只读 rootfs、tmpfs、cap_drop、seccomp、无 host 网络、出站白名单；默认关闭 trusted | M | 容器不能消除原生代码风险，只能缩小爆炸半径；不能承诺绝对隔离 |
| P0-2 | 用 pinned trusted 测试插件做真实 E2E：同意 / 拒绝 / 重连 / `PLUGIN_CONSENT`；断言未同意前不执行代码 | S/M | 需要测试用 pin 和临时插件目录；不需要生产 pin |
| P1-1 | 保持“部分转换”边界；报告里明确 refused/partial/assumed；只对语义确定的字段增加适配器 | L | 服务端逻辑/路由/引擎容器不应自动等价转换；这是设计边界，不是一次性修完的 bug |
| P1-2 | 造一个受控 Forge 包（content + cosmetic + kits + panel），导入后跑真实浏览器对局 | M | 需要固定 fixture 和导入报告断言；可复用现有 content/script E2E |
| P1-3 | 在插件快照里增加 Forge 来源、refused/partial/assumed 数量、原始包 id/hash/导入时间；`/admin` 只读展示 | M | 不把完整报告塞进 JSON，只存摘要和报告路径 |
| P1-4 | 把兼容点做成显式矩阵 + 版本升级 checklist；新增兼容类别必须带测试和回滚说明 | S/M | 不建议现在动态猜版本；先让兼容点可见、可审查 |
| P1-5 | 把 `allowIncompatible` 扩展为 `true | ["id", ...]` 的 per-plugin 白名单；`/admin` 显示因白名单放行的插件 | S | 保持默认 `false`；全局 `true` 可作为兼容旧配置保留，但标注为高风险 |
| P1-6 | 逐提交筛选 upstream `dev`：必须移植 / 可选 / 不需要 / 冲突；只 cherry-pick 选中的提交 | M | 不整分支 merge；每个插件相邻提交要有对应测试 |
| P1-7 | 房间面板先展示 `requires` 自动项和来源；再评估是否允许受控直接选择 script（需要 owner policy + 明确警告） | M | 直接开放 script 会扩大攻击面；先做依赖链可视化更安全 |
| P1-8 | 启动时后台预热脚本 probe；缓存成功/失败；加并发队列、超时和 `/admin` 耗时指标 | M | 不能阻塞大厅主线程；失败缓存要有 TTL |
| P1-9 | 按风险补 E2E：trusted consent、Forge pack、多插件冲突、失败重试、重连 | M | 优先真实链路，不追求用例数量 |
| P1-10 | 在测试机跑完整 `--plugin-art` 抽取，记录耗时/失败文件/manifest；把命令写进 runbook | S | 主要是环境验证，不是代码改动 |
| P2-1 | `/admin` Phase 2：启停、安装/卸载、来源、失败记录、审计；仍不远程执行插件代码 | L | 需要权限模型和审计设计；不能直接复用 owner 本机权限 |
| P2-2 | 增加插件加载/构建/下载/probe 耗时计数，只进运营指标，不进入玩家统计 | M | 先做内存计数和日志，再考虑持久化 |
| P2-3 | 增量扫描 + 内容集构建缓存 + 下载并发/进度 + 大目录分页 | L | 先测量再优化；不要用缓存掩盖失效检测 |
| P2-4 | UI 明确区分“商店形态 / 官方自选形态”，在详情和公告解释 | S | 主要是文案和展示，不动 `officialPool` / `ownedPool` |
| P2-5 | 固定四级风险标签（外观 / 改变玩法 / 脚本沙箱 / 原生信任）+ 玩家版风险说明 | S | 需要产品文案，不涉及权限模型 |
| P2-6 | 插件面板和结算页提示“非官方对局不计入统计总览” | S | 与 `withModded` 开关保持一致 |

### 结论

- **可以直接做**：P0-2、P1-2、P1-3、P1-5、P1-7、P1-8、P1-9、P1-10、P2-2、P2-4、P2-5、P2-6。
- **需要部署/产品决策**：P0-1、P1-4、P2-1。
- **只能缓解、不能彻底解决**：P1-1（Forge 任意服务端逻辑）、P2-3（规模与性能）。
- 建议第一批：**P0-2 → P1-2 → P1-3 → P1-5**；这四项能显著提高可信度和运营可用性。

---

## P0：生产启用 trusted 前的阻断项

### P0-1 trusted 生产隔离未完成

- 状态：`PARTIAL`
- 方案：[`TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) 已给出只读 rootfs / 非 root / cap_drop / 网络边界 / pin+consent 的 Compose 基线；容器化实测仍需在部署机完成。
- 现状：
  - `trusted` 默认关闭
  - 公网 / 通配监听默认拒绝
  - 但还没有容器、非 root、只读文件系统、网络隔离的完整生产方案
  - trusted 原生代码仍可能完全控制页面或服务端执行环境
- 影响：
  - 普通插件可以上线
  - trusted 插件不建议直接上生产
- 下一步：
  1. 明确 trusted 生产部署模型
  2. 增加容器 / 非 root / 网络白名单示例
  3. 把 trusted 开关、pin、consent 写进部署 runbook

### P0-2 trusted consent 缺少真实浏览器 E2E

- 状态：`DONE`
- 完成：`test/ui/plugins-content-script.e2e.test.js` trusted 用例，覆盖拒绝、同意、开始前阻断。
- 现状：consent 逻辑和单元测试存在，但没有完整真实浏览器流程
- 下一步：
  - 覆盖同意、拒绝、断线重连、房主开始前的 `PLUGIN_CONSENT`
  - 确认页面不会在未同意时执行 trusted 代码

---

## P1：Forge 兼容

### P1-1 Forge 导入仍是部分转换

- 状态：`WATCH` / 设计边界
- 已明确不支持：
  - `server` / `serverModules`
  - `routes`
  - `assets`（`.spresources`）
  - `forms`
  - `fx`（除有限的 `silentPhases`）
  - `variants`
  - `behaviour`
  - `playtest`
  - `support`
  - `combat`
  - `layer`
- 会报告后丢弃：
  - `modules`、`potentials`
  - `statsBase`、`traitBase`、`talentsBase`
  - `immunities`、`summons`
  - 模块天赋
  - 部分未知羁绊 / 驻守 / 棋子 id
- 影响：
  - 导入成功 ≠ 玩法完全等价
  - 需要在发布说明和导入报告里明确“部分兼容”
- 参考：
  - [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md)
  - [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md)

### P1-2 没有真实 Forge 包的浏览器对局 E2E

- 状态：`DONE`
- 完成：真实 Forge fixture 导入 + 浏览器 content/cosmetic/script/`PREP` 用例。
- 现状：`forgeImport` 有大量单元/夹具测试，真实浏览器 E2E 只有普通 content/script
- 下一步：
  - 用一个受控 Forge 包导入
  - 验证 content + cosmetic + kits 脚本
  - 验证房间 `cs`、自定义干员、`PREP`
  - 把 `IMPORT-REPORT.md` 的关键结论纳入断言

### P1-3 Forge 导入报告没有进入运营台

- 状态：`DONE`
- 完成：`importForge` 写 `forge-import.json`；`/admin` 显示来源包、产品、skipped/assumed、部分导入和导入时间。
- 现状：
  - 报告只在 `IMPORT-REPORT.md` 和 `--json`
  - `/admin` 只显示插件结果，不显示来源包、丢弃字段、assumed 项
- 下一步：
  - 插件详情增加 `forge` 来源摘要
  - 显示 refused / partial / assumed 数量
  - 保留原始包 id / hash / 导入时间（只读）

---

## P1：版本兼容

### P1-4 0.3.x 兼容点是硬编码

- 状态：`WATCH`
- 现状：
  - `PLUGIN_COMPAT_APP = '0.3.2'`
  - `lang` / `cosmetic` / `ui` 自动兼容 0.3.x
  - `content` / `script` / `trusted` 默认严格
- 风险：
  - 未来主线版本变化需要重新评估
  - 0.3.2 的 UI/外观语义未必永远安全
- 下一步：
  - 把兼容点、理由和复评条件写进版本升级 checklist
  - 新增兼容类别前必须有测试和回滚方案

### P1-5 `allowIncompatible` 是全局开关

- 状态：`DONE`
- 完成：`allowIncompatible` 支持 `true` 或插件 id 列表；contentSet 与 `/admin` 均已区分。
- 现状：owner 打开后，所有旧 `content` / `script` / `trusted` 都可能进入候选
- 风险：
  - 缺少按插件 id 的白名单
  - 一次放行可能扩大攻击面
- 下一步：
  - 支持 `allowIncompatible` 的 per-plugin 列表
  - 或在 `/admin` 显示“哪些插件因此被放行”

### P1-6 上游 `dev` 有未筛选提交
- 状态：`DONE`（已筛选，选中 1 个移植）
- 快照：上游 `master` `c9d804f47`；上游 `dev` `23dfa3d79`，多 26 个提交
- 结果：`removeBuff` 重入修复已移植并带上游合成测试；`#725` 素材计数不适用；picture-only outfits / skill clips / bond timer 列为后续候选；external AI、bot strategies、野鬃 push 不进入本批
- 详见 [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md)

### P1-7 独立脚本插件不能直接在房间面板选择

- 状态：`DONE`
- 完成：`roomPlugins` 现在列出 loaded 的 script/trusted；房间面板显示「沙箱脚本 / 原生信任」，并有直接选择 E2E。
- 现状：
  - 房间面板只列 cosmetic / content
  - 脚本 / trusted 只能通过 content `requires` 或 `plugins/config.json` `default` 进入
- 影响：
  - 作者做出独立脚本插件后，服主不能直接打开
  - 运营和调试路径不直观
- 下一步：
  - 设计“脚本依赖”显式展示
  - 或允许 content 包装器一键生成
  - 或在面板显示 `requires` 自动项及其来源

### P1-8 脚本 probe / 首次加载可能让大厅停顿

- 状态：`DONE`
- 完成：成功 probe 结果持久化到 `var/plugin-probe-cache.json`，重启后命中；`/admin` 显示子进程/内存/磁盘命中、失败、超时和耗时；`SP_PLUGIN_PROBE_CACHE=off` 可关闭。启动后台队列未做（磁盘缓存已覆盖重启预热）。
- 部分完成：已统计 probe requests / cache hits / child runs / failures / timeouts / 最近和最大耗时，并在 `/admin` 显示；启动预热和队列仍未做。
- 现状：
  - 未缓存脚本首次探测有超时
  - 多个插件并发时可能排队
- 下一步：
  - 启动时预探测 / 预热
  - 后台队列 + 进度提示
  - 把探测耗时写入 `/admin` 或日志

---

## P1：测试盲区

### P1-9 插件 E2E 覆盖仍偏窄
- 状态：`DONE`
- 完成：浏览器覆盖 10 条（含多插件冲突 / 重新应用）；内容集 broken-cs、PLUGIN_BUSY、拒绝不记忆等失败路径由 `contentSets` 单测覆盖；consent 重连由 `script-consent` 单测覆盖。
- 已覆盖：
  - cosmetic 3 条
  - UI 插槽 1 条
  - content 内容集 1 条
  - sandbox 脚本依赖 1 条
  - 独立 script 直接选择 1 条
  - 多插件冲突 + 重新应用 1 条
  - 真实 Forge 导入包 1 条
  - trusted consent 1 条
- 未覆盖：
  - 内容集下载失败、锁失败、脚本超时
  - 房间内容切换后的缓存与重连
  - Firefox / Safari
- 下一步：
  - 按风险补用例，不追求数量
  - 优先多插件冲突和失败恢复

### P1-10 真实客户端抽取只做了定向冒烟

- 状态：`WATCH`
- 已做：
  - `extract.py --only mesh/trap_110`
  - 真实 CN 客户端成功写出 6 个文件
- 未做：
  - 完整 `--plugin-art` 长跑
  - 官方干员美术 + VFX + 插件引用的整链合并
- 下一步：
  - 在测试机跑完整抽取
  - 记录耗时、失败文件、manifest 合并结果

---

## P2：运营与可观测性

### P2-1 `/admin` Phase 2：策略写入与审计

- 状态：`DONE`
- 完成：`POST /admin/api/plugin-policy` 修改安全策略字段，保留 trusted pin / 下载白名单，写 `var/admin-audit.log`；安装/卸载/更新仍按设计保持 owner 本机处理，不暴露远程文件写入。
- 已完成：`POST /admin/api/plugin-policy` 可修改 `rooms` / `default` / `allow` / `classes` / `limits` / `allowIncompatible`，保留 `trusted` pin 和下载白名单，并写 `var/admin-audit.log`；仍不提供远程安装/卸载/更新。
- 目前能看：
  - 已安装插件
  - 兼容性
  - skipped / warnings
  - 房间 `cs` / `vs`
  - 脚本 / 信任 / consent
- 不能：
  - 启用 / 禁用
  - 安装 / 卸载 / 更新
  - 查看插件历史、失败次数、加载耗时
  - 审批 / pin 管理
- 下一步：
  - Phase 2 再设计写操作和审计
  - 保持“远程不执行插件代码”的边界

### P2-2 缺少插件生命周期指标

- 状态：`PARTIAL`
- 已完成：脚本 probe 的请求 / 缓存 / 子进程 / 失败 / 超时 / 耗时；内容集缓存 sets / held / builds；`/admin` 显示。
- 未完成：下载字节 / 失败率、房间重新应用次数、持久化历史。
- 需要：
  - 加载耗时
  - 内容集构建耗时
  - 下载字节 / 失败率
  - 脚本 probe 耗时
  - 房间重新应用次数
- 注意：不要把插件内部数据写进统计总览，只做运营指标

---

## P2：性能与规模

### P2-3 大插件 / 多房间的扫描与构建成本

- 状态：`DONE`
- 完成/已缓解：registry 用 size / mtime / inode / ctime 复用文件 hash；content set 按 manifest / 文件 hash / settings 记忆；`/admin` 显示 sets / held / builds。后续只需按压测调参，不再视为阻塞项。
- 已有：registry 按 size / mtime / inode / ctime 复用文件 hash；content set 按 manifest / 文件 hash / settings 记忆；`/admin` 显示 sets / held / builds。
- 仍缺：首次大插件全量扫描、下载并发 / 进度、构建排队；这些需要压测数据后再调参。
- 现有上限：
  - 单插件 200 MB
  - 2000 文件
  - `maxSets` 限制内容集
- 风险：
  - 首次扫描 / 哈希慢
  - 内容集构建和下载等待
  - 多房间并发构建排队
- 下一步：
  - 增量扫描
  - 内容集构建缓存
  - 下载进度与并发上限
  - 大目录插件面板分页/懒加载

---

## P2：产品与玩家体验

### P2-4 官方 `op-*` 与自造商店干员同 charId

- 状态：`DONE`
- 完成：自选面板把 `officialPool` 标为「官方自选」，普通非原型标为「已持有」；新增 `diy-tag--official` 和 `pickOptions().official` 测试。
- 现状：
  - 通过 `diy.officialPool` 与 `diy.ownedPool` 分离
  - 功能正确
- 风险：
  - 玩家可能困惑“为什么同名干员有两个入口、技能不同”
- 下一步：
  - UI 明确区分“商店形态 / 官方自选形态”
  - 文档和公告里解释

### P2-5 插件类别对玩家仍然复杂

- 状态：`DONE`
- 完成：面板固定「外观 / 改变玩法 / 沙箱脚本 / 原生信任」标签；玩家风险说明见 [`PLUGIN-RISKS.md`](PLUGIN-RISKS.md)。
- 风险：
  - 外观 / 改变玩法 / 脚本 / 信任混在一个设置体系
  - 玩家难以判断公平性和风险
- 下一步：
  - 固定标注四级：外观 / 改变玩法 / 脚本沙箱 / 原生信任
  - 写一份面向玩家的插件风险说明

### P2-6 非官方对局默认不计入统计

- 状态：`DONE`
- 完成：插件面板已提示「改变玩法...非官方对局，不计入统计总览」；玩家风险说明再次说明。
- 现状：内容插件对局默认排除统计，`withModded` 可切换
- 风险：
  - 玩家可能误以为战绩丢失
- 下一步：
  - 在插件面板和结算页明确提示
  - 说明“非官方对局不计入总览”

---

## 已解决 / 不应重复记录的项

- 插件版本文档已拆分：
  - `PLUGIN-DEV-GUIDE.md`
  - `FORGE-PLUGIN-DEV-GUIDE.md`
  - `FORGE-COMPATIBILITY.md`
- `kittedExtra` 已从 `resolveContent` 带到 `room.state.content`，内容插件新增的自选干员可见
- trusted consent 页面已实现：拒绝 / 同意、开始前阻断、seat consent 写回；真实浏览器 E2E 覆盖
- 真实 Forge fixture 导入 + content/cosmetic/script/PREP E2E 通过
- Forge 导入来源与 skipped/assumed 摘要已写入 `forge-import.json`，`/admin` 新增「Forge 导入」只读表
- `allowIncompatible` 支持 `true` 或插件 id 列表，contentSet 与 `/admin` 均区分
- Pixi 的 CSP no-eval 适配器已接入，真实浏览器不再退回 simplified view
- 0.3.x `lang` / `cosmetic` / `ui` 自动兼容
- 真实浏览器插件 E2E：10 / 10（cosmetic 3、UI 1、content 1、sandbox script 2、Forge 1、trusted consent 1、冲突/重新应用 1）
- 字体 CSP 已允许 `fonts.gstatic.cn`
- 全量 CI：8194 / 8158 / 0

---

## 建议排期

1. **P1-8 剩余部分** 脚本 probe 启动预热和排队进度
2. **P1-9 剩余部分** 多插件冲突 / 失败恢复 / 重连
3. **P0-1** trusted 生产容器化
4. **P2-1 / P2-2** 运营台 Phase 2 与指标
5. **P2-3** 性能
6. **P2-4 / P2-5 / P2-6** 玩家体验与风险说明

> 每次完成一项，把状态改为 `DONE` 或在提交说明里引用本文件编号；不要直接删除历史记录。
