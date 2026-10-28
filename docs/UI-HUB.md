# 主界面：经典大厅与 Hub / Main interface: classic lobby and Hub

> **当前状态（2026-10-23）**：默认 `hub`（新大厅）；管理后台「界面」页可切回 `classic`。切换只影响大厅，房间 / 备战 / 战斗 / 结算 / HUD 的代码完全不变。上线前默认值、部署与通知仍按 [`AI-WORKFLOW.md`](AI-WORKFLOW.md) 的发布流程执行。

## 1. 两套界面

| 模式 | 入口 | 外观 | 代码 |
|---|---|---|---|
| `classic` | 旧大厅 | 一屏式：三个模式卡 + 四张难度卡 + 加入同盟 + 提示 | [`../public/js/screens/lobby.js`](../public/js/screens/lobby.js) |
| `hub` | 新大厅 | 程序化要塞背景 + 中央徽记 / 雷达 + 左右功能砖 + 右下三个大入口；点模式进入全屏「选择模拟协议」 | [`../public/js/screens/hub/lobby.js`](../public/js/screens/hub/lobby.js) |

标题页两种模式共用（[`../public/js/screens/title.js`](../public/js/screens/title.js)）。Hub 只是大厅、协议选择页和干员调配的皮肤，**不复制业务逻辑**：两套界面共用 `store`、`net`、`screens/online.js`、`screens/rooms.js`、`screens/stats.js`、`screens/sweep.js` 和全部 `room.*` / `mm.*` 动作。干员调配的**数据与同步**共用 `ui/loadoutSync.js` / `ui/loadoutModel.js`，只有界面不同：Hub 用 `screens/loadoutDeck.js`（特殊版的物资调配处卡片），经典大厅继续用 `screens/loadout.js`。

Hub 的来源是 owner 的特殊 0.3.0 分支（Hub UI `b2bd17af` / Stardust-minus `d6e96f4`，GPL-3.0-or-later），移植时保留了原注释和授权说明；本项目整体仍是 GPL-3.0-or-later。

## 2. 开关

### 玩家侧

`public/index.html` 在模块入口之前加载：

```html
<script src="/ui-config.js"></script>
```

`server/index.js` 直接返回一个 `no-store` 的小脚本：

```js
window.__SP_UI__ = { "main": "hub" };   // 或 "classic"
```

[`../public/js/main.js`](../public/js/main.js) 读取后只动态导入其中一个大厅：

```js
const { LobbyScreen } = UI_MODE === 'classic'
  ? await import('./screens/lobby.js')
  : await import('./screens/hub/lobby.js');
```

因此：

- 切换不需要重启，玩家**下次刷新**页面生效；
- 页面只下载当前界面的代码；
- 旧界面的文件、样式和测试都保留。

### 管理侧

`/admin?token=…` → 左侧「界面」：

- `GET /admin/api/ui` 读取当前值；
- `POST /admin/api/ui`，body `{ "main": "hub" | "classic" }`，非法值返回 400；
- 保存写入 `var/ui.json`（在代码树和 `data/` 之外，部署不会覆盖）。

### 本机预览

```text
https://<host>/?ui=hub
https://<host>/?ui=classic
```

`?ui=` **只对当前这次页面加载生效**，不写 localStorage，也不改服务器设置，方便对比而不影响其他玩家。

## 3. 文件

| 文件 | 作用 |
|---|---|
| `server/uiMode.js` | 读写 `var/ui.json`、校验模式、生成 `/ui-config.js` |
| `server/index.js` | `/ui-config.js` 路由、`/admin/api/ui` |
| `server/admin.js` | 后台「界面」页与保存按钮 |
| `public/js/ui/uiMode.js` | 客户端选择：`?ui=` 预览 + 服务器默认 |
| `public/js/screens/hub/lobby.js` | Hub 大厅、协议选择页、野排队列条 |
| `public/js/ui/hub/backdrop.js` | 程序化要塞背景、雷达、背景设置面板（夜巡 / 动态皮肤 / 剧情背景 / 自定义） |
| `public/js/ui/hub/appearance.js` | 夜巡 + 动态皮肤（官方 L2D）+ 剧情背景（随机 CG）+ 自定义图片（IndexedDB） |
| `public/js/ui/hub/dynIllust.js` | 动态皮肤：读 `/assets/dynillust/index.json`，PIXI + pixi-spine 播放官方 `Idle`（可静止 / 尊重减少动效） |
| `tools/local-extract/dynillust.py` | 从官方客户端 `arts/dynchars/*.ab` 抽取动态立绘到 `public/assets/dynillust/`（git-ignored） |
| `public/js/ui/hub/storyImages.js` | 剧情背景图片清单（`tools/assets/hub-story.py` 生成） |
| `public/assets/ui/hub/story/*.webp` | 54 张剧情 CG；**不进 `data/assets.json`**，不参与启动预载 |
| `public/js/ui/hub/localMedia.js` | 浏览器本地图片存储 |
| `public/js/ui/hub/protocolScene.js` | 随难度变化的等距要塞线稿 |
| `public/css/screens/hub.css` | Hub 布局、协议页、背景、主题、响应式 |
| `public/js/screens/lobbyData.js` | 两套大厅共用的模式 / 难度 / 房间码纯函数 |
| `public/js/screens/online.js` | 两套大厅共用的在线玩家浮层 |
| `public/js/screens/loadoutDeck.js` | Hub 的干员调配（物资调配处卡片 / 快速配置 / **右侧**详情抽屉），移植自特殊版 |
| `public/css/screens/loadout-deck.css` | Hub 干员调配样式；经典界面仍加载 `loadout.css` |
| `public/js/ui/musicPicker.js` | 顶栏音乐芯片 +「主界面音乐」弹窗（官方曲库、分类、搜索、音量） |
| `tools/lobby-music.mjs` · `tools/assets/lobby-music.mjs` | 主界面音乐下载 / 清单与曲目 id 表（`docs/ASSETS.md`） |
| `public/js/ui/operatorPortrait.js` | 卡片立绘跟随本机皮肤选择 |
| `public/js/ui/transitions.js` | 浮层淡出 / 保留挂载 |
| `public/js/ui/achievements.js` | 成就统计：左侧成就卡 + 全屏面板（两套大厅共用，各自接线） |
| `public/js/ui/achievementModel.js` | 成就进度与战果 / 盟约 / 策略纪录的纯聚合（无 DOM、无存储） |
| `public/css/screens/achievements.css` | 成就卡与成就面板样式（`index.html` 加载） |
| `public/js/coreSkins.js` | 读取核心皮肤目录并交给 `cosmetics.setCore` |
| `skins/catalogue.json` | 核心皮肤目录（tracked；美术在忽略的 `skins/sets/`） |
| `tools/skins.mjs` | `import` / `build` 核心皮肤目录 |

`lobbyData.js` 与 `online.js` 是从 `screens/lobby.js` 抽出的纯模块；`lobby.js` 继续 re-export 原有名字，旧的 import 和测试不需要改。

## 4. 功能对照

| 现有功能 | Hub 位置 |
|---|---|
| 返回标题、ping、在线人数、公告 | 顶栏左 |
| 大厅背景 / 主界面音乐 / 设置 / 玩法说明 | 顶栏工具（音乐芯片显示当前曲名；窄屏只留音符图标）。大厅背景只留 **夜巡 / 动态皮肤 / 剧情背景 / 自定义背景** 四个入口（动态皮肤只在 `public/assets/dynillust/index.json` 有条目时出现；点它进入和剧情背景同款的选择页，按名称 / 系列列出**全部已抽取**的官方动态皮肤，缩略图按滚动懒加载，选中即切换并返回；主面板可调暗化）；点「剧情背景」进入独立选择页，按图片原名列出 54 张剧情 CG，选中即保存并返回；缩略图按滚动懒加载，不一次性铺满设置页 |
| 登录 / 注册、账号、统计 | 顶栏右 |
| 公开房间 | 右侧「公开房间」实时面板（最多 3 个，组队中优先；正在模拟按有 AI、观战人数排序；组队中→加入、正在模拟→观战；标注 原版 / MOD；全部 → 完整目录） |
| 更新日志 | 左侧功能砖 |
| 加入同盟 / 观战 / 最近密钥 | 左侧「加入同盟」弹窗 |
| S.W.E.E.P.、干员调配 | 右侧功能砖（统计入口在右上角档案牌） |
| 插件（全局预览） | 右侧「插件」功能砖 → 插件预览；开关只影响主界面里浏览的插件内容（干员调配 / S.W.E.E.P 等），对局仍由房主决定 |
| 成就统计 | 左侧顶部的成就卡（场景条 + 战果奖杯数）；经典大厅左栏同一张卡 |
| 资料库、作战提示 | **Hub 不提供**；仍保留在经典大厅 |
| S.W.E.E.P. 对应干员 | 点击干员打开干员调配并选中该干员；关闭调配（返回 / Esc）回到原来的 S.W.E.E.P. 页 |
| 三个模式 | 右下三张卡，按官方样式分组：上方「独立模拟 / 联合模拟」标签；独立模拟 / 同盟模拟 / 同盟匹配，同盟匹配为亮色主卡（野排入口） |
| 难度、公开可见性、测试房间、创建 | 全屏「选择模拟协议」 |
| 野排队列 / 退出 | 在「选择模拟协议」页点「搜寻队友」后**留在该页**，按钮变成「退出匹配」并显示 n/4、已等待与 AI 补位倒计时；退出后仍在该页。返回 Hub 时队列条显示在模式入口上方，**与三张模式卡同宽、同右边缘**（不会再压到卡片） |
| 主界面音乐 | 顶栏音符芯片 → 弹窗：默认主题 + 官方曲库（提交的 24 首；若放了本地音乐包则 218 首全量），按 主题 / 活动 / 联动 / 危机合约 / 肉鸽 / 生息演算 / 剧情 分页、可搜索；点选即播，选择存在本机 `settings.lobbyMusic`。只替换 Hub 的 BGM——标题、房间大厅与作战仍用各自曲目，不影响队友 |
| 深度链接 `?room=` | 由 `main.js` 处理，与界面无关 |
| 离开同盟后的返回 | 从完整公开房间目录进入 → 公开房间；从「选择模拟协议」创建 → 协议选择页；从主界面公开房间面板进入 → 主界面 |

## 5. 测试

- `node --test test/ui/ui-mode.test.js`：开关存储、校验、`?ui=`、两套大厅都存在。
- `node --test test/ui/achievements.test.js`：成就聚合口径（有效对局、MOD / 测试 / 空退出排除）、战果 / 盟约 / 策略纪录与服务端 + 本机记录合并。
- `node --test test/ui/mm-look.test.js test/ui/online-overlay.test.js test/ui/room-origin.test.js`：抽取后旧行为不变。
- 浏览器实测（1600×900 / 844×390）：标题 → Hub 大厅 → 协议选择 → 创建同盟 → 房间；背景面板、加入同盟弹窗、成就面板、经典界面回退。
- 部署前按 [`AI-WORKFLOW.md`](AI-WORKFLOW.md) 跑完整闸门。

## 6. 注意

- Hub CSS 依赖 `--ui-unit` / `--utility-text`（在 `hub.css` 的 `:root` 中定义，未定义时有 fallback）。不要把这两个变量删掉。
- `hub.css` 在 `index.html` 中始终加载（约 58 KB，gzip 后很小），这样切到 Hub 时首屏不会闪无样式；经典界面不受 `.hub-*` 选择器影响。
- 主题 / 自定义背景是**每个浏览器**的偏好，存在本机 IndexedDB / localStorage，不跟账号走，也不上传。
- 剧情背景保存 `theme: 'story'` 和选中的 `story` 文件（本机偏好）；点「剧情背景」打开选择页，按图片原名（`storyImages.js` 的 `name`）展示 54 张，选中后返回。缩略图用 `IntersectionObserver` + 懒加载，打开选择页只取首屏附近十几张，滚动再取；54 张图是静态资源，**没有登记进 `data/assets.json`**，所以启动预载和美术预载都不会碰它们。
- 主界面音乐同理：`settings.lobbyMusic` 只在本机，进房间 / 作战时不生效。Hub 的 `lobby` 路由才换成 `lobby:<id>`；标题页与房间大厅仍是模式默认曲（`public/js/audio.js` installAudio 的路由同步）。清单缺少所选 id 时 `resolveBgm` 回退到 `bgm.lobby`，不会静音。
- 全量曲库是**可选**的：`var/music/`（git 忽略，`tools/local-extract/music.py` 从本地客户端提取并统一响度到 -14 LUFS）由 `/music/index.json` 暴露，`ui/musicLibrary.js` 在启动时并入清单；没有音乐包时只剩提交的 24 首，UI 不报错。音量曲线在 `audio.js` `_applyVolumes`（BGM 0.8 × `v^1.5`，旧的 0.55 × `v²` 明显偏小）。
- 新增大厅功能时，两套界面都要接线；共用逻辑优先放进 `lobbyData.js` / `online.js` / `rooms.js`，不要再复制一份。
