# 手机端视觉优化（MOBILE-UI）

> 2026-11-04 立项。**现状不是"没做"**：对局内的触屏/安全区/画质已经有一套完整实现；
> 缺的是**对局外页面**与**真机矩阵验收**。本文是审计结论 + 排期清单，做完一项就勾一项。
>
> 相关：[`UI-HUB.md`](UI-HUB.md)（主界面）、[`PROJECT-STATE.md`](PROJECT-STATE.md) §9（待办）、
> [`QUERY-INDEX.md`](QUERY-INDEX.md)、[`../public/css/devices.css`](../public/css/devices.css)。

## 1. 已经具备的（别重复造）

| 能力 | 落点 | 备注 |
|---|---|---|
| 视口与刘海 | `index.html` `viewport-fit=cover` + `devices.css` `--sa-*` | 对局 HUD 内缩，棋盘/背景满幅 |
| 设备特征类（不嗅探 UA） | `public/js/ui/device.js` → `sp-touch / sp-coarse / sp-hover / sp-no-hover / sp-fs / sp-standalone / sp-reduced-motion / sp-rotatable` | 输入设备变化时实时更新 |
| 手势 | `devices.css` §1：禁缩放/下拉刷新/长按菜单，棋盘 `touch-action: none` | 商店/列表仍可滚动 |
| 触摸目标 | `devices.css` §3：小控件套 ≥44 px 的 `::before` 命中区 | 名单覆盖对局内控件 + 通用 `.btn` 等 |
| 短屏规则 | 85 条 `@media`，含 `max-height: 520px`、`max-width: 760/767px`、`pointer: coarse` | 对局、装备、统计、成就、扫荡、表情有专门规则 |
| 画质/分辨率 | `render/app.js`：`devicePixelRatio` 上限按质量档 + `renderScale`，3D 阴影/抗锯齿随档位 | 低端机可切「低」 |
| 横屏提示 | `sp-rotatable` + `.rotate-hint`（竖屏时提示旋转） | **当前只支持横屏** |
| 自定义黑边/屏幕适配 | `public/js/ui/screenFit.js`（设置里的四边内缩） | 异形屏兜底 |
| 自动化 | `test/render/*.browser.test.js`（Puppeteer，`RENDER_E2E=1`）；`elembar.browser.test.js` 已用 **844×390 手机视口** | 矩阵还没铺开 |

## 2. 审计出的缺口（有证据）

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| M1 | **对局外页面大多没有手机规则** | 只有 7 个 CSS 有 `max-width/max-height/pointer:coarse` 规则；**lobby / room / result / settle / title / codex / guide / game-panels / game-shop / loadout-deck / match-popups / boss-plates / theme** 都没有 | 房间、结算、大厅在 640×360 这类屏上会挤/溢出 |
| M2 | **`100vh` 与 `dvh/--sp-vh` 混用** | `100vh` 14 处，`dvh`/`--sp-vh` 12 处 | 移动浏览器地址栏展开时底部被盖住（尤其大厅/结算/弹层） |
| M3 | **固定像素尺寸集中在几页** | `loadout.css` 10 处、`stats.css` 7 处、`game.css` 9 处 ≥3 位数宽/高 | 短屏（≤420 px 高）挤压、滚动 |
| M4 | **只有横屏**，且竖屏只有提示 | `sp-rotatable` = 粗指针且非横屏 → 显示 `.rotate-hint` | 竖屏不可玩；是否支持是产品决定（见 §5） |
| M5 | **验收矩阵只有一个手机视口** | 现有浏览器测试用 844×390 | 640×360（SE/小屏）、915×412、1024×768 未覆盖 |
| M6 | **点击区名单靠手工维护** | `devices.css` §3 的 `:where(...)` 清单 | 新控件容易漏；需要一条"可点元素 <44 px"的自动检查 |
| M7 | **hover 依赖** | 详情/提示类交互在桌面靠 hover | 触屏上要么长按、要么点开即锁；需统一规则 |

## 3. 计划（P0 → P1 → P2）

### P0 · 正确性与基线（先做，1–2 天）

1. **视口矩阵 + 基线截图**：`640×360`、`740×360`、`844×390`、`915×412`、`1024×768`（横屏），跑 `RENDER_E2E=1`，
   截图落 `test/e2e/out/mobile-*`；每页一张，作为后续对比基线。
   *验收*：五个视口下 `document.scrollWidth <= innerWidth`，无横向滚动，无元素超出安全区。
2. **`100vh` 收敛**：全部换成 `100dvh` 或既有 `--sp-vh`（对局内已用）。
   *验收*：移动浏览器模拟地址栏展开/收起，底部按钮仍可见。
3. **可点元素 ≥44 px 自动检查**：新脚本 `tools/mobile-audit.mjs`（Puppeteer），扫描每页所有可点元素的
   命中盒（含 `::before`），输出 `<44 px` 清单；并入 `RENDER_E2E`。
   *验收*：清单为空，或每条例外都在脚本里显式豁免并注明原因。
4. **安全区回归**：模拟 `env(safe-area-inset-*)`（左右 24 px、底部 34 px），逐页确认内容不被裁。
   *验收*：对局 + 房间 + 结算 + 大厅四页通过。

### P1 · 主要页面（3–5 天）

| 页面 | 要做的 | 验收 |
|---|---|---|
| **房间 / 备战大厅**（`screens/room.css`） | 座位卡与队伍栏在 640×360 下换行/压缩；按钮进 44 px 名单；纵向可滚 | 640×360 下无遮挡、可完成建房→准备 |
| **结算 / 结算页**（`result.css` / `settle.css`） | 排名表横向滚动或列裁剪；底部按钮固定在安全区内 | 5 人局 640×360 完整可读、按钮可点 |
| **大厅 / Hub**（`lobby.css` / `hub.css`） | 卡片两列 → 单列；标题区按高度收缩；`100dvh` | 640×360 首屏可见"开始/加入" |
| **图鉴 / 指南 / 统计** | 侧栏折叠为抽屉；表格横向滚动容器 | 单手可完成"打开→检索→关闭" |
| **设置 / 装备抽屉** | 抽屉宽度 ≤ 90vw；分段控件换行；键盘弹出时滚到焦点 | 触屏无 hover 也能完成全部设置 |
| **对局 HUD 补漏** | 商店卡、羁绊条、技能/道具提示在 640×360 的字号与间距 | 不遮挡棋盘可部署格；无文字截断到不可读 |

### P2 · 打磨（按需）

- 字号阶梯（小屏统一 `clamp()`，不再逐条 `px`）
- 长按 = 右键/详情（替代 hover），并在首次触屏时给一次提示
- 动效降级（`prefers-reduced-motion` 已有，补"低画质下关抖动/粒子"）
- 触感反馈（`navigator.vibrate`，可选开关）
- 横屏手势提示（首次进入对局提示"拖动 = 移动棋子"）

## 4. 怎么验收（统一口径）

1. `RENDER_E2E=1 node --test test/render/*.browser.test.js`（含新矩阵）
2. `node tools/mobile-audit.mjs`（点击区 + 横向滚动 + 安全区）
3. 真机抽查：至少一台 iOS Safari、一台 Android Chrome（横屏）
4. 每项完成补一条截图对比（`test/e2e/out/mobile-<page>-<viewport>.png`）

## 5. 需要 owner 拍板的三件事

1. **竖屏**：继续"只支持横屏 + 旋转提示"，还是要做竖屏布局？（做竖屏 = 重排对局 HUD，成本另算）
2. **最低目标机型**：是否以 `640×360`（iPhone SE 一代横屏）为下限？还是要覆盖到 `568×320`？
3. **自动化范围**：P0 的视口矩阵是只在本地跑，还是要进 CI（需要 Chromium + 已下载素材）？

## 6. 与其它待办的关系

- 本清单**不改玩法**，与 `UPSTREAM-DEV-TRIAGE.md` §9 的 A/B 批互不阻塞
- 若后续做「入场动画」（主线 #878），入场页也要进本矩阵
- 真机矩阵落地后，`PROJECT-STATE.md` §9 的"已知问题"里与手机相关的条目可以逐条销账
