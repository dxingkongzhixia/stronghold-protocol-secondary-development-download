# 插件问题与待办清单

> 快照日期：2026-10-19  
> 代码基线：`master` `ae9e2ae3c`（插件文档提交后）  
> 状态：普通插件链路可用；全量 CI **8186 tests / 8150 pass / 0 fail**；真实浏览器插件 E2E **6 / 6 pass**。  
> 本文件记录**仍未解决**的问题，不把已修项写成待办。

## 状态标记

- `P0`：可能阻断生产或造成严重安全风险
- `P1`：影响兼容性、可运营性或验证可信度
- `P2`：体验、性能、文档或长期维护问题
- `TODO`：已确认，待排期
- `WATCH`：当前不是缺陷，但需要持续观察/复评

---

## P0：生产启用 trusted 前的阻断项

### P0-1 trusted 生产隔离未完成

- 状态：`TODO`
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

- 状态：`TODO`
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

- 状态：`TODO`
- 现状：`forgeImport` 有大量单元/夹具测试，真实浏览器 E2E 只有普通 content/script
- 下一步：
  - 用一个受控 Forge 包导入
  - 验证 content + cosmetic + kits 脚本
  - 验证房间 `cs`、自定义干员、`PREP`
  - 把 `IMPORT-REPORT.md` 的关键结论纳入断言

### P1-3 Forge 导入报告没有进入运营台

- 状态：`TODO`
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

- 状态：`TODO`
- 现状：owner 打开后，所有旧 `content` / `script` / `trusted` 都可能进入候选
- 风险：
  - 缺少按插件 id 的白名单
  - 一次放行可能扩大攻击面
- 下一步：
  - 支持 `allowIncompatible` 的 per-plugin 列表
  - 或在 `/admin` 显示“哪些插件因此被放行”

### P1-6 上游 `dev` 有未筛选提交

- 状态：`WATCH`
- 快照：
  - 上游 `master`：`c9d804f47`（0.3.2，未变）
  - 上游 `dev`：`23dfa3d79`，比 master 多 26 个提交
- 风险：
  - 其中可能包含插件相邻修复（技能动画、时装、buff、removeBuff 等）
  - 当前未按插件影响面筛选
- 下一步：
  - 逐提交标记：必须移植 / 可选 / 不需要 / 与 fork 冲突
  - 不整分支 merge

---

## P1：脚本插件可用性

### P1-7 独立脚本插件不能直接在房间面板选择

- 状态：`TODO`
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

- 状态：`WATCH`
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

- 状态：`TODO`
- 已覆盖：
  - cosmetic 3 条
  - UI 插槽 1 条
  - content 内容集 1 条
  - sandbox 脚本依赖 1 条
- 未覆盖：
  - trusted consent 全流程
  - 真实 Forge 导入包
  - 多插件冲突 / 自动依赖 / 重新应用
  - 内容集下载失败、锁失败、脚本超时
  - 房间内容切换后的缓存与重连
  - Firefox / Safari
- 下一步：
  - 按风险补用例，不追求数量
  - 优先 trusted consent 和 Forge pack

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

### P2-1 `/admin` 仍然是只读 Phase 1

- 状态：`WATCH` / 设计选择
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

- 状态：`TODO`
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

- 状态：`WATCH`
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

- 状态：`WATCH` / 已设计
- 现状：
  - 通过 `diy.officialPool` 与 `diy.ownedPool` 分离
  - 功能正确
- 风险：
  - 玩家可能困惑“为什么同名干员有两个入口、技能不同”
- 下一步：
  - UI 明确区分“商店形态 / 官方自选形态”
  - 文档和公告里解释

### P2-5 插件类别对玩家仍然复杂

- 状态：`WATCH`
- 风险：
  - 外观 / 改变玩法 / 脚本 / 信任混在一个设置体系
  - 玩家难以判断公平性和风险
- 下一步：
  - 固定标注四级：外观 / 改变玩法 / 脚本沙箱 / 原生信任
  - 写一份面向玩家的插件风险说明

### P2-6 非官方对局默认不计入统计

- 状态：`WATCH` / 有意设计
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
- Pixi 的 CSP no-eval 适配器已接入，真实浏览器不再退回 simplified view
- 0.3.x `lang` / `cosmetic` / `ui` 自动兼容
- 真实浏览器插件 E2E：6 / 6
- 字体 CSP 已允许 `fonts.gstatic.cn`
- 全量 CI：8186 / 8150 / 0

---

## 建议排期

1. **P0-2** trusted consent 真实 E2E
2. **P1-2** 真实 Forge pack 浏览器 E2E
3. **P1-3** Forge 导入报告进入运营台
4. **P1-6** 上游 `dev` 26 个提交筛选
5. **P1-5** `allowIncompatible` per-plugin 白名单
6. **P1-7** 独立脚本插件选择体验
7. **P2-1 / P2-2** 运营台 Phase 2 与指标
8. **P2-3** 性能
9. **P2-4 / P2-5 / P2-6** 玩家体验与风险说明

> 每次完成一项，把状态改为 `DONE` 或在提交说明里引用本文件编号；不要直接删除历史记录。
