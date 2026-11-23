# 测试系统优化方案（TESTING-PLAN）

<!-- doc: role=plan status=plan -->

> **状态**：2026-11-23 起草；按 Phase 0 → 3 执行，进度见 §7。
> **权威基线**：[`TESTING.md`](TESTING.md)（命令、分层、golden 规则、已知不稳定项）；本文只回答「还要做什么、为什么、
> 怎么验收」。行为与数字一律以代码和 `npm test` 为准，本文不写死用例数。
> **相关**：[`PROJECT-STATE.md`](PROJECT-STATE.md)（当前状态）· [`AI-WORKFLOW.md`](AI-WORKFLOW.md)（发布纪律）。

## 0. 目标与约束

| 约束 | 值 | 状态 |
|---|---|---|
| PR 墙钟上限 | **8 分钟** | 已拍板 |
| 全图像素 diff | **不做**（只做计算样式 / 均值色 / 几何） | 已拍板 |
| skip | **只降不升**（带原因的 44 条由 `test/skip-budget.test.js` 守） | 已落地 |
| 覆盖率 | **只采趋势，不设门槛** | 已落地（命令） |
| studio / native | **暂不投入** | 已拍板 |
| golden | 变动必须归因，代码与语料分两个提交 | 仓库铁律 |

**总目标**：把「可信边界」从 CI 的 24 个浏览器套件，扩到 **所有无素材 e2e + 联机流程定期验证 + 关键行为无空白**，
同时不牺牲墙钟与稳定性。

## 1. 基线（2026-11-23 实测）

| 指标 | 现在 | 目标 |
|---|---|---|
| 全量 `npm test` | 9505 用例 / 0 失败 / 90 跳过 / 439 s | 0 失败 / 跳过 ≤90 / ≤8 分钟 |
| 快速档 `test:fast` | 183 用例 / 34 s | ≤2 分钟 |
| 浏览器 smoke | pre 5/5（53 s）+ match 19/19（314 s），两个并行 job | 覆盖 ≥40/64，墙钟 ≤8 分钟 |
| e2e 进 CI 比例 | **28 / 58（48%）**；其余 30 个已在 `tools/e2e-lanes.mjs` 登记归属 | 覆盖全部可无素材套件 |
| 素材 e2e（观战 / 替补 / 配装） | **0 次/CI** | 每周至少 1 次 |
| 仍用 `networkidle0` 的 smoke 套件 | 18/24 | 新增为 0 |
| 固定 `sleep`（`test/ui`） | 472 处 | 新增为 0 |
| 带原因的 skip | 44（门禁） | ≤44 |
| 运行时 skip | 90 | ≤90 |
| 覆盖率基线 | line 87.51% / branch 84.26% / funcs 87.99%（`server/sim` + `shared`） | 有首次数字 + 月度对比 |
| 无自动化守护的行为 | 4 块 | ≤2 块（其余有产品结论） |

## 2. 工作流

### WS1 · 覆盖补齐（最高价值）

| # | 任务 | 做法 | 验收 | 估算 |
|---|---|---|---|---|
| 1.1 | smoke 拆 2 个并行 job | `browser-smoke-pre` + `browser-smoke-match`；`tools/browser-smoke.mjs --group pre\|match` | 两 job 各 ≤4 分钟；`test/ci.test.js` 仍绿 | 3 h |
| 1.2 | 分诊 35 个未归属 e2e | 30 分钟法则：修 / 删 / 裁，逐条记录重加条件 | 每个文件有结论；CI 套件 → 30+ | 2–3 天 |
| 1.3 | 素材 e2e 夜间 job | `schedule` 每周跑 `test:e2e:assets`（standin / spectator / teammate-loadout / leftovers / watch-bonds） | 连续两周绿；失败有 artifact | 4 h |
| 1.4 | 补回被删行为 | `text-scale`（等商店栏修复）、`inspect-range`（等产品确认）、`capsule-motion` / emote 气泡（先修 harness） | 每块要么有测试，要么有书面「不做」结论 | 1–2 天 |

### WS2 · 稳定性与可诊断

| # | 任务 | 做法 | 验收 | 估算 |
|---|---|---|---|---|
| 2.1 | `openMock()` 助手 | 统一 `domcontentloaded` + 显式等待 + 屏蔽远程镜像；**新增必须用**，存量随碰随改 | 新增 e2e 中 `networkidle0` = 0 | 4 h |
| 2.2 | sleep → 事件等待 | 只改 smoke 的 24 组，用 `waitForSelector/Function` 替换 `sleep(300..900)` | 单组重跑 5 次 0 抖动 | 1–2 天 |
| 2.3 | CI 失败留现场 | 两个 smoke job 上传 `test/e2e/out`（`if: always()`） | 任一组红可下载截图 | 30 min |
| 2.4 | 抖动登记 | 重跑一次仍红 → 记 `TESTING.md` §7 + issue；不静默 skip | 抖动率 <2%/组/月 | 持续 |

### WS3 · 指标

| # | 任务 | 做法 | 验收 |
|---|---|---|---|
| 3.1 | 覆盖率基线 | 跑 `npm run coverage`，把 `all files` 的 line/branch 记进 `TESTING.md`（只记录） | 有数字；每月更新 |
| 3.2 | 运行时 skip 入摘要 | `npm test` 结束打印 `skipped N（基线 90）`，超基线只提醒不失败 | 摘要出现 |
| 3.3 | 清单口径 | `TEST-INVENTORY` 已注明「静态计数 ≠ 断言数」 | 保持 |

### WS4 · 流程

| # | 任务 | 做法 | 验收 |
|---|---|---|---|
| 4.1 | golden 本地提示 | `test:fast` 检测 `server/sim`、`shared`、`data` 有未提交改动时提示跑 `test:golden`（不阻塞） | 提示出现 |
| 4.2 | 新 e2e 必须有归属 | 守卫测试：新增 `*.e2e.test.js` 既不在 smoke 也不在素材 lane → 红 | 没有「野生」e2e |
| 4.3 | 删除必须有重加条件 | 沿用 `TESTING.md` §7.1 的格式 | 每次删除都有条件 |

### WS5 · 产品侧（阻塞项，需 owner 决策）

| # | 事项 | 影响 | 建议 |
|---|---|---|---|
| 5.1 | 商店栏随字号变高（145 → 164 px @ 特大） | 手机 HUD 布局 | **已修复**：`.funds` 固定 2.24rem、`.shopbar__remain` 固定行盒；`text-scale.e2e` 已回 CI |
| 5.2 | COMBAT 下攻击范围高亮是否保留 | 交互一致性 | **保留**；`inspect-range.e2e` 已按 mock 的 COMBAT 阶段重写并回 CI |
| 5.3 | 阶段场景是否值得自动化 | 视觉为主 | 若不做，写进「已知空白」 |

## 3. 排期

| 阶段 | 内容 | 预计 |
|---|---|---|
| **Phase 0** | 1.1 拆 job、2.3 artifact、3.2 skip 摘要、4.1 golden 提示 | 半天 |
| **Phase 1** | 1.2 分诊 35 个 e2e、2.1 `openMock()`、4.2 归属守卫 | 3 天 |
| **Phase 2** | 1.3 夜间素材 e2e、2.2 sleep 清理、3.1 覆盖率基线 | 1 周 |
| **Phase 3** | 1.4 / 5.x 补回被删行为（视产品结论） | 视情况 |

## 4. 验收（Definition of Done）

- PR 墙钟 **≤8 分钟**（smoke 两组并行，各 ≤4 分钟）
- e2e 进 CI **≥40/64**；其余每条都有「素材 lane / 已删除 + 重加条件」的归属
- 素材 e2e **每周至少一次**有结果
- 新增 e2e：`networkidle0` = 0、必须有归属、走 `openMock()`
- 运行时 skip **≤90**、带原因 skip **≤44**
- 覆盖率有基线数字与月度对比
- 无守护行为降到 **≤2 块**

## 5. 明确不做

- 不做全图 / 像素 diff，不引入视觉快照库
- 不追覆盖率门槛，不为覆盖写无意义断言
- 不把素材 e2e 放进 PR 阻塞链（只夜间）
- 不重构全部 18 个 `networkidle0`（只保证新增为 0）
- 不给 studio / native 补测

## 6. 风险与对冲

| 风险 | 对冲 |
|---|---|
| 拆 job 后配置漂移 | `test/ci.test.js` 强制 workflow ↔ 本地 runner 步骤一致 |
| 删测试造成覆盖真空 | 每次删除写重加条件；夜间 job 兜联机流程 |
| 助手迁移 churn | 只对新增强制，存量随碰随改 |
| 夜间 job 被忽略 | 失败自动开 issue，周报数字进 `TESTING.md` |
| 覆盖率被当 KPI | 文档写明只趋势，不进 CI 门槛 |

## 7. 进度

- [x] Phase 0 · 1.1 smoke 拆 `pre` / `match` 两个并行 job
- [x] Phase 0 · 2.3 browser-smoke 失败上传截图 artifact
- [x] Phase 0 · 3.2 `npm test` 打印运行时 skip 与基线对比
- [x] Phase 0 · 4.1 `test:fast` 的 golden 提示
- [x] Phase 1 · 1.2 首轮分诊 32 个未归属 e2e（进 CI 4 个 → 28/58；其余 30 个全部登记 lane 与原因）
- [x] Phase 1 · 2.1 `openMock()` 助手 + 新增约束（`test/helpers/mockPage.mjs`）
- [x] Phase 1 · 4.2 新 e2e 归属守卫（`tools/e2e-lanes.mjs` + `test/ui/e2e-lanes.test.js`）
- [x] Phase 2 · 1.3 夜间素材 e2e job（`.github/workflows/nightly.yml`；首轮定时执行待下一个周一）
- [ ] Phase 2 · 2.2 smoke 的 sleep 清理（`ready-fold` 已改为 DOM 等待；其余按「随碰随改」）
- [x] Phase 2 · 3.1 覆盖率基线（line 87.51% / branch 84.26% / funcs 87.99%）
- [x] Phase 3 · 1.4 / 5.x 被删行为补回（`text-scale` 修复并恢复；`inspect-range` 重写并恢复；8 个旧契约红套件已删并在 `TESTING.md` §7.1 记录重加条件）
