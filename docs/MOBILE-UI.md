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
| 画质/分辨率 | `render/app.js`：`devicePixelRatio` 上限按质量档 + `renderScale`，3D 阴影/抗锯齿随档位；**粗指针高画质直接用设备 DPR（3–4）**，自适应降采样在手机上不低于 0.8（干员不再被放大糊） | 低端机可切「低」 |
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

> **执行口径以 §7 的勾选清单为准**（决策已定：横屏、最低 640×360、矩阵进 CI）。本节只说明为什么这样排。

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

> **2026-11-04 验证已开始**：真机模拟（640×360、DPR 2、触屏）打开真实标题页与 Hub 首屏，`document.scrollWidth == 640`
> （无横向滚动），Hub 的公开房间 / 模拟入口 / 账号卡都在视口内；公开房间目录的座位头像代码已接上（随下次部署上线）。
> 其余页面（房间 / 结算 / 图鉴 …）需要房间或对局状态，按 P1 逐页验。

> **2026-11-04 继续验（可达页面）**：协议选择（独立/同盟）、独立模拟等待房、BRIEFING / INFO CHECK、机变草稿、
> 对局准备 HUD、设置弹层、成就统计、干员调配、插件面板在 640×360 下都是 `scrollWidth == 640`，无横向滚动；长内容
> （BRIEFING 的附加盟约、设置行）在列/弹层内部滚动而不是被裁掉。无头浏览器没有 3D 上下文，准备 HUD 回退到简化棋盘，
> **对局内实机画面仍要真机看**（M1.8）；4 人同盟房与结算页需要第二个人 / 打完一局，暂用骨架页覆盖。

1. `RENDER_E2E=1 node --test test/render/*.browser.test.js`（含新矩阵）
2. `npm run check:mobile`（`tools/mobile-audit.mjs`：点击区 + 横向滚动 + 安全区；截图在 `test/e2e/out/mobile/`）
3. 真机抽查：至少一台 iOS Safari、一台 Android Chrome（横屏）
4. 每项完成补一条截图对比（`test/e2e/out/mobile-<page>-<viewport>.png`）

## 5. 已定决策（owner 2026-11-04）

| 项 | 决定 | 影响 |
|---|---|---|
| 竖屏 | **只支持横屏** + 旋转提示（维持 `sp-rotatable`） | 不做竖屏布局；所有规则以横屏为基准，竖屏只保证提示可见 |
| 最低目标 | **640×360**（iPhone SE 一代横屏） | 640×360 必须完整可玩可点；更小的 `568×320` 不承诺 |
| 自动化 | **矩阵进 CI** | 新增独立 job（不碰现有 `RENDER_E2E=0` 的主 job），见 §7 的 M0.8 |

## 6. 与其它待办的关系

- 本清单**不改玩法**，与 `UPSTREAM-DEV-TRIAGE.md` §9 的 A/B 批互不阻塞
- 若后续做「入场动画」（主线 #878），入场页也要进本矩阵
- 真机矩阵落地后，`PROJECT-STATE.md` §9 的"已知问题"里与手机相关的条目可以逐条销账

## 7. 执行清单（台式机，按顺序勾）

> 本机（笔记本）**不改代码**，只保留这份清单；到台式机上按 ID 顺序做，每项一个提交。
> 约定：横屏、最低 640×360、矩阵进 CI；只动 `public/css`、`public/js`（布局/样式/harness）、`tools/`、`test/`，**不碰玩法与 golden**。

### P0 · 基线与自动化（先做，1–2 天）

> **2026-11-04 P0 完成**：`npm run check:mobile` = 9 个页面 × 5 个视口（640×360 / 740×360 / 844×390 / 915×412 /
> 1024×768），45 张截图在 `test/e2e/out/mobile/`，当前 **all clear**。安全区模拟 24/24/34/24；`.gm__hud > .shopbar`
> 是唯一一条“故意伸进底部安全区”的豁免（原因写在 `test/mobile/tap-exceptions.json`）。点击区检查顺带补了
> `.settle__next / .cx-chip / .chat-dock__toggle / .bstrip__more / .guide__chapter / .tips__nav / .bslot` 的 44px 命中区。

- [x] **M0.1 矩阵常量**：`test/mobile/matrix.mjs`（`VIEWPORTS` + `MIN_VIEWPORT` + `SAFE_AREA`），审计脚本与文档共用。
- [x] **M0.2 `100vh` 收敛**：`public/css/**` 14 处全部换成 `100dvh`（`git grep 100vh -- public/css` = 0）。
- [x] **M0.3 审查 harness**：`public/dev/mobile-audit.html` + `mobile-audit.js`，9 个骨架页（lobby / hub / room /
      result / settle / codex / stats / settings / game HUD），真实样式表 + mock 内容，不登录、不需要素材。
- [x] **M0.4 审计脚本**：`tools/mobile-audit.mjs`（puppeteer-core，`CHROME_PATH` 可配；无 `SP_MOBILE_BASE` 时自起
      端口 0 的服务），横向溢出 / <44 px 命中盒 / 安全区越界三类断言，退出码 0/1，截图落 `test/e2e/out/mobile/`。
- [x] **M0.5 安全区模拟**：审计把 `--sa-*` 覆盖为 24/24/34/24 并同时设置 `--sp-vh`；`.gm__hud`、`.shopbar`、
      底部按钮逐页检查（`.shopbar` 一条已记录豁免）。
- [x] **M0.6 点击区白名单**：`test/mobile/tap-exceptions.json`（选择器 → 原因，另支持 `safe: true` 的越界豁免）。
- [x] **M0.7 npm 脚本**：`package.json` `"check:mobile": "node tools/mobile-audit.mjs"`。
- [x] **M0.8 CI job**：`.github/workflows/ci.yml` 新增 `mobile-audit`（Node 24 + `setup-chrome` + 截图 artifact），
      主 job 的 `RENDER_E2E=0` 不变。
- [x] **M0.9 最小尺寸写进注释**：`devices.css` 头部注明“横屏 ≥640×360；568×320 及以下不承诺”，与 §5 一致。

### P1 · 页面适配（3–5 天，按此顺序）

- [ ] **M1.1 房间 / 备战大厅**（`public/css/screens/room.css`）：座位卡 ≥640 宽时两列、以下单列；队伍栏可横向滚动；
      全部按钮进 44 px 名单；`overflow-y: auto`。*验收*：640×360 完成"建房 → 准备 → 开始"。
- [ ] **M1.2 结算 / 结算页**（`result.css`、`settle.css`）：排名表放进横向滚动容器；底部按钮固定且进安全区；
      标题按高度收缩。*验收*：5 人局 640×360 可读可点。
- [ ] **M1.3 大厅 / Hub**（`lobby.css`、`hub.css`）：卡片两列 → 单列；首屏可见主 CTA；`100dvh`。
      *验收*：640×360 首屏可见"开始/加入"。
- [ ] **M1.4 图鉴 / 指南 / 统计**（`codex.css`、`guide.css`、`stats.css`）：侧栏折叠为抽屉；表格横向滚动；
      统计页 7 处固定宽度改百分比/`clamp()`。*验收*：单手可完成"打开 → 检索 → 关闭"。
- [ ] **M1.5 设置 / 装备抽屉**（`loadout.css`、`loadout-deck.css`、设置面板）：抽屉 ≤90vw；分段控件换行；
      输入框聚焦时滚到可视区。*验收*：触屏无 hover 完成全部设置。
- [ ] **M1.6 对局 HUD 补漏**（`game.css`、`game-shop.css`、`game-panels.css`）：640×360 下商店卡、羁绊条、
      技能/道具提示的字号与间距；不遮挡可部署格。*验收*：640×360 一局完整可打。
- [ ] **M1.7 弹层/草稿/简报**（`match-popups.css`、`draft.css`、`briefing.css`、`boss-plates.css`）：
      短屏最大高度 + 内部滚动。*验收*：640×360 全部可关闭。
- [ ] **M1.8 真机抽查**：iOS Safari + Android Chrome 横屏各一台，记录机型/系统版本。
      *验收*：P0 脚本与真机截图都通过。

### P2 · 打磨（按需）

- [ ] **M2.1 字号阶梯**：统一 `clamp()`，去掉零散 `px`。- [ ] **M2.2 长按替代 hover**：详情/提示类交互，长按 400 ms 打开并锁定；首次触屏提示一次。
- [ ] **M2.3 低画质动效降级**：`quality=low` 时关抖动/粒子（`prefers-reduced-motion` 已有）。
- [ ] **M2.4 触感反馈**：`navigator.vibrate`，设置里可关。
- [ ] **M2.5 首次手势提示**：进入对局提示"拖动 = 移动棋子、点按 = 选中"。

### 每项完成的固定动作

1. `npm run check:mobile` + `RENDER_E2E=1 node --test test/render/*.browser.test.js` 通过
2. 截图对比图放 `test/e2e/out/mobile/`（CI artifact）
3. 本清单勾选 + 一句"改了什么"；涉及 `PROJECT-STATE.md` §9 的条目同步销账
