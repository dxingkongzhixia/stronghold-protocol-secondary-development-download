# 野排（搜寻队友）— 设计、实现与改动记录

> 面向二次开发的中文说明。计划与本次实际落地的改动都记在这里，便于回溯。
> 关键文件：`server/db.mjs`、`server/auth.js`、`server/matchmaker.js`、`server/lobby.js`、`server/net.js`、
> `server/index.js`、`server/admin.js`、`shared/protocol.js`、`shared/constants.js`；客户端 `public/js/net.js`、
> `store.js`、`main.js`、`screens/title.js`、`screens/lobby.js`、`ui/account.js`、`ui/components.js`。

## 0. 需求（用户确认）

1. 服务端真实注册：仅用户名 / 密码，账号有独立 id，禁止重名。
2. 用 **SQLite** 存用户数据（内置到项目）。
3. 野排规则：**共享池**，排队窗口 **30 秒**；30 秒内凑齐 4 人即可开局，不足用 **AI 队友**补位。
4. 池必须**异步**（并发多人进入），每 4 人组成一个同盟后按对应逻辑执行。
5. 匹配成功**直接开局**（无二次确认）。
6. 中途有人退出 → **AI 接管**（既有机制，见 §7）。
7. 所有改动形成文档（本文）。

## 1. 架构总览

```
客户端 ── hello{name, token, accountToken} ──▶ net.js 鉴权：accountToken → 账号
  auth.register / auth.login ─▶ lobby.register/login ─▶ AuthService(server/auth.js) ─▶ SQLite(server/db.mjs)
  mm.join{difficulty} / mm.cancel ─▶ lobby.mmJoin ─▶ Matchmaker(server/matchmaker.js)
                                                    │  桶: (难度) → 队列
                                                    │  ≥4 立即成组；最早者等待满 30s → 补 AI 成组
                                                    ▼
                                        lobby.createMatchedRoom(sessions)
                                                    ▼
                                     Room(coop, 已就绪) → startMatch()（直接开局）
```

- **账号**：`AuthService` 负责注册 / 登录 / 会话；密码 scrypt 加盐哈希；会话 token 存 SQLite，`hello.accountToken` 恢复登录。
- **匹配池**：`Matchmaker` 单线程事件循环 + 一个 `setInterval(250ms)`；`join` 后立即尝试成组（第 4 人瞬间开局），窗口到期 `tick` 里补 AI 成组。
- **组队→对局**：`Lobby.createMatchedRoom` 建一个 `coop` 房间、人类按排队顺序落座并**自动准备**、其余座位补 AI，随后 `startMatch()`（复用现有开局逻辑与 Match 引擎）。

## 2. 账号系统

- **注册** `auth.register { name, password }`
  - 名字：经 `server/auth.js cleanName` 清洗（NFC、剥离控制/零宽/双向/孤立代理字符、折叠空白），长度 **2–12**（= `NAME_MAX_LEN`，与 `hello.name` 同上限，避免截断；按未截断长度校验）；**唯一性不区分大小写**（存 `name_lower`）。
  - 密码：长度 **6–128**；`scrypt(N=16384, r=8, p=1, keylen=64)` 加盐哈希，存储格式 `scrypt$N$r$p$salt$hash`（成本随哈希保存，日后可升级参数）。
- **登录** `auth.login { name, password }` → 校验（常量时间比较）→ **作废该账号的旧 token**（`DELETE FROM sessions WHERE account_id=?`）→ 新建会话 token。
- **单点登录**：一个账号同时**只有一个有效会话**。在别处登录 → 旧 token 立即失效，且**踢掉**其他设备上已绑定的在线会话（`Lobby.kickOtherSessions` 关闭其 socket，码 **4001 REPLACED**；对方界面提示「该身份已在其他页面登录」并清掉登录角标，重连时 `SESSION_EXPIRED` → 回退游客）。
- **会话**：`sessions(token PK, account_id, created_at, expires_at)`，TTL **30 天**。客户端把 token 存 localStorage，`hello` 时作为 `accountToken` 发送；服务端在 `Lobby.onHello` 里 `auth.resolve(accountToken)` 绑定账号并回 `auth.ok`。
- **登出 / 过期**：`auth.error { code: SESSION_EXPIRED }` → 客户端清 token 并回退游客。
- **游客**：不登录仍可独立模拟 / 私房；**野排（`mm.join`）要求已绑定账号**（否则 `AUTH_REQUIRED`）。

## 3. 存储（SQLite）

- **驱动**：Node 内置 **`node:sqlite`（`DatabaseSync`）**，零依赖；导入时抑制其 Experimental 警告。
- **位置**：默认 `var/accounts.db`（`SP_DB` 覆盖），**不在被公开静态服务的 `data/` 目录**；`var/` 已加入 `.gitignore`。
- **表**：`accounts`、`sessions`（见 §2），索引 `idx_sessions_account` / `idx_sessions_expires`；`PRAGMA user_version` 做迁移（当前 v1）。
- **测试**：`openMemoryDb()` 提供内存库。

## 4. 匹配池

- **分桶**：`难度`（FUNNY/NORMAL/HARD/ABYSS）。同难度才可能同队（协议/内容版本由部署保证一致）。
- **入池** `mm.join { difficulty }`：每个会话（playerId）最多一条；已在池 → `IN_QUEUE`；在跑对局 → `ROOM_STARTED`；在未开始的大厅房间 → 先退出该房间。
- **成组规则**：
  - 桶内 **≥4** → 立即取最早进入的 4 人成组（多余者继续等待下一个 4 人）；
  - 桶内最早者等待满 **30 s** → 取**当前所有人（1–3）** + AI 补足到 4 成组。
- **退出池**（任何"不再排队"的路径都会移出，**不会留幽灵**）：
  - 点「取消搜寻」→ `mm.cancel`，回 `mm.state { queued:false }`；
  - **离开大厅（点「返回」回标题）** → 客户端自动补发 `mm.cancel`（socket 仍连着，不加这步服务器会把这个人一直留在池里、甚至匹配进他看不到的房间）；
  - **建房 / 加入房间**（`room.create` / `room.join`）→ 服务端自动移出（一人不能同时在池里又在房里）；
  - 断线 / 会话过期 → `Lobby.onDisconnect` / `onExpire` 自动移出；`room.leave` 也会兜底清一次。
- **进度推送**：`mm.state { queued, difficulty, waiting, need, elapsedMs, deadlineMs }`，约 **1 Hz**。
- **并发/重入**：Node 单线程，无需锁；成组时**先从桶里移除**再调用 `onMatch`，不会重复分配；`join` 后立即 `_tryMatch`（第 4 人即时开局），窗口到期在 `tick` 里 `flush`。

## 5. 组队 → 对局

`Lobby.createMatchedRoom(sessions, { difficulty, ai })`：
1. 生成房间码，建 `Room('coop', difficulty)`；
2. 人类按排队顺序落座、`ready = true`、写 `session.roomCode`；
3. **所有空座位补 AI**（含排队期间掉线的会话）；
4. 首位人类为房主；广播 `room.state`；`startMatch()` **直接开局**。

客户端收到 `room.state` 即由路由切到房间 / 对局界面；`main.js` 同时清空排队 UI 状态。

**对局结束即解散**：野排房是临时的（`room.auto === true`），对局结束走 `onMatchEnd` → `disposeRoom(room, 'matched-end')`，玩家收到 `room.closed{reason:'matched-end'}` 回到大厅（客户端只清房间、**保留结算界面**，结算按钮显示「返回大厅」），想再玩需**重新排队**——不会和同一批陌生人被一直绑在一队。手建同盟房则保留，可继续再来一局。

## 6. 协议（`shared/protocol.js`）

| 方向 | 消息 | 说明 |
|---|---|---|
| C2S | `hello { name, token?, version?, accountToken? }` | `accountToken` = 账号会话，用于恢复登录 |
| C2S | `auth.register { name, password }` / `auth.login { name, password }` | 注册 / 登录（都回 `ok`，并推 `auth.ok`） |
| C2S | `auth.logout {}` | 退出登录：服务端解绑会话并作废 token |
| C2S | `mm.join { difficulty }` / `mm.cancel {}` | 进入 / 退出野排池 |
| S2C | `auth.ok { account:{id,name}, token }` | 绑定成功（推送或回包） |
| S2C | `auth.error { code }` | `SESSION_EXPIRED` 等 |
| S2C | `mm.state { queued, difficulty, waiting, need, elapsedMs, deadlineMs }` | 排队进度 |

错误码（`shared/constants.js ERR`）：`AUTH_REQUIRED`、`BAD_NAME`、`BAD_PASSWORD`、`NAME_TAKEN`、`BAD_CREDENTIALS`、`SESSION_EXPIRED`、`IN_QUEUE`、`NOT_QUEUED`，中文本在 `ERR_TEXT`。
常量：`AUTH_NAME_MIN/MAX`、`AUTH_PASS_MIN/MAX`、`MM_WINDOW_MS=30000`、`MM_SEATS=4`。

## 7. 退出与断线

- **对局中退出**：沿用既有 `Match.onLeave` → 座位标记 `left`、`bot.js` **AI 接管**（本功能未改这块，仅复用）。
- **排队中退出**：`Matchmaker.leave` 立即移出池。
- **匹配瞬间掉线**：`createMatchedRoom` 只给**仍连接**的会话落座，空出来的座位由 AI 补上。
- **关闭浏览器 / 断线**（在线状态）：游客**立即**离线；登录用户保留"在线"**5 分钟**（`PRESENCE_GRACE_MS`）再离线——见 §12。断线不结束对局（AI 接管）。

## 8. 客户端界面

### 标题页 `screens/title.js` — 只有一个身份：博士代号 = 账号名

- 顶部 `博士代号 · CALLSIGN` 输入框**既是游客代号，也是登录 / 注册时的账号名**（不再有两个名字输入框）。
- **主按钮**动态化：
  - 未登录 + 输入框为空 → **「游客进入 · 随机代号」**：点击用 `randomGuestName()`（`游客` + 4 位数，`net.js`）进入，并提示「已随机生成游客代号「游客XXXX」」；
  - 输入了代号 → 「进入作战」，以该代号游客身份进入；
  - 已登录 → 「进入作战」，输入框锁定为账号名（`disabled`）。
- **「账号登录 / 注册」（可折叠）**：展开后 `登录 | 注册` 两个页签 + 一个密码框 + `登录并进入 / 注册并进入`。账号名取自上方代号框。成功后 `auth.ok` → 显示「已登录 · <账号名>」+「退出登录」，代号框自动填入账号名，token 存 `localStorage('sp.pref.authToken')`。
  - 表单抽到 `public/js/ui/account.js`（`AccountForm` / `AccountWho` / `AccountDialog`），标题页与大厅共用。
  - **不会"点不动"**：提交按钮只在**代号不可用 / 离线**时禁用；密码过短会在**点击后用 toast 提示「密码至少 6 位」**，并在下方显示提示语，不再默默置灰。
  - **重名会明确显示**：注册时如果代号已被占用（**不区分大小写**），表单内会**常驻红字**「代号「X」重名，已被占用 —— 请换一个」，同时弹 toast；改代号后自动清除。
- **关键修复**：`main.js` 让标题页在进入前也先发一次 `hello`（临时名 `博士`）。否则服务器以 `hello required` 拒绝 `auth.*`（`server/net.js` 要求先有 session），登录/注册按钮点了没反应。

### 大厅 `screens/lobby.js`

- 顶栏左侧 **「在线 N」** 徽标（`.online-badge`）：数据来自**服务器** `/healthz` 的 `online`（= 真实在线人数，含登录用户断线后 5 分钟宽限；与 `/admin` 同源；客户端每 15s 拉一次）。**点击打开游戏内浮层**（`OnlineOverlay`，复用游戏自己的组件/风格，数据取免令牌的 `/online/api`，每 4s 刷新）——列出 名字 / 是否登录 / 状态 / 房间，**不开新页面**。
- 顶栏玩家名旁：**未登录**时显示 `游客` 徽标（`.me-chip__guest`）。
- 顶栏 **「登录 / 注册」** 按钮（仅游客显示）：打开 `ui/account.js` 的**账号弹窗**，把当前**游客身份升级为正式账号** —— 账号绑定到**当前会话**，房间 / 对局继续、`playerId` 不变（服务端 `Lobby.bindAccount`），升级后 `游客` 徽标消失、顶栏显示账号名。
- 同盟模拟下新增 **「搜寻队友（野排）」** 按钮：未登录禁用并提示「需先在标题页登录 / 注册账号」；已登录进入共享池并弹出**排队浮层**（难度 / 已等待 / 当前人数 `k/4` / 取消 / 约 n 秒后由 AI 补位开局）。
- **匹配成功**：服务器广播 `room.state` → 路由进房，浮层随 `mm.state queued:false` 消失。

### 野排 ≠ 同盟密钥（两条独立流程，别混）

- **同盟密钥**：手建房（`room.create`）得到房间码，或凭码 `room.join` 加入。房间**长期存在**、对局结束后**保留**可再来一局；房间界面显示 **「同盟密钥」**（复制密钥 / 邀请链接）。
- **野排**：`mm.join` 进池 → 匹配成功由 `createMatchedRoom` 建**临时房**（`room.auto=true`）。**不显示同盟密钥**（`room.js` 对 auto 房显示「野排队伍 · 对局结束后自动解散」而非 `InviteBox`）；对局结束**自动解散**，想再玩重新排队。
- 代码上全靠 `room.auto` 区分：`room.state` 带 `auto`，客户端据此决定 UI，服务端据此决定是否解散。
- 两者**互斥**：在池里就不能在房里、反之亦然（`mmJoin` 先退房；`create` / `join` 先退池）。

### 组件

- `ui/components.js` 的 `TextField` 增加可选 `type`（密码框），**并在密码框右侧提供「眼睛」按钮切换明文 / 密文**（新增 `eye` / `eyeOff` 图标）。
- 账号表单的提交按钮统一为 **`primary` 全宽按钮**（与「进入作战」等主按钮同款：绿色 + 斜纹 + 括号角），不再是灰色小方块；样式与全局按钮一致。

## 9. 运维 / 配置

| 项 | 默认 | 说明 |
|---|---|---|
| `SP_DB` | `<repo>/var/accounts.db` | SQLite 文件路径 |
| `MM_WINDOW_MS` | 30000 | 排队窗口（`shared/constants.js`，单一来源） |
| `MM_SEATS` | 4 | 每组成员数 |
| `SP_VERIFY` | `off` | 服务端**战斗结果校验**模式：`sample` ≈ 每 8 场复算 1 场、`all` 全复算、`off` 关；不一致时**用服务器自己的模拟结果**（不会误拒合法结果）。本机 `server-start.cmd` 已设为 `sample`，可在 `/admin` 看到 `校验 sample · 复算/不一致/拒收/接管` 计数 |
| `var/admin-token.txt` | 首次启动随机生成 | 管理页 `/admin` 的访问令牌（启动日志会打印完整 Admin 链接） |

- 启动：`npm start`（`main()` 以 `accounts: true` 启动，自动建库）。
- 测试默认**不启用**账号（`startServer` 只在 `opts.accounts === true` / 注入 `opts.auth`/`opts.db` 时建库），既有 48 个 `startServer` 测试不受影响。

## 10. 测试

- `test/auth.test.js`：密码哈希往返、名字清洗与长度、重名（不区分大小写）、登录、会话过期、**登录轮换作废旧 token**。
- `test/matchmaker.test.js`：满 4 即时成组、不足 30s 补 AI、分桶、取消 / 断线 / `IN_QUEUE`/`NOT_QUEUED`、`mm.state` 1Hz；`createMatchedRoom`、**退池**、**对局结束解散**、**单账号踢人**、`auth.logout`、**掉线补发结算回放**。
- `test/admin.test.js`：状态判定、**在线/离线 presence**（游客断线即时离线 / 登录用户 5 分钟宽限）、快照计数、令牌鉴权、HTTP 路由。
- 运行：`node --test`（全部）。

## 11. 改动文件清单（落到本项目）

> 干净上游克隆在 `D:\DOTK\Stronghold-Protocol-github`（`master` @ `bdb0765`）。下面是本项目相对上游**新增 / 修改**的文件。

### 服务端
| 文件 | 改动 |
|---|---|
| `server/db.mjs` | **新增**：内置 `node:sqlite` 打开 / 迁移 / 内存库 |
| `server/auth.js` | **新增** `AuthService`：scrypt 哈希、名字清洗与校验、注册 / 登录 / 会话（登录**轮换作废旧 token**）、`listAccounts()`、`logout()` |
| `server/matchmaker.js` | **新增**：野排共享池（按难度分桶 / 30s 窗口 / AI 补位 / `mm.state` / `leave`） |
| `server/bootgate.js` | **新增**：`BootGate` 启动预加载排队闸门（`bootSlots` 个通道、FIFO、`drain`、`holdMs` 兜底回收）——见 §14 |
| `server/admin.js` | **新增**：`/admin`(HTML)+`/admin/api/state`（令牌）、`buildPublicSnapshot`（免令牌 `/online/api`，含**可加入房间 `openRooms`**）、`statusOf` / `buildSnapshot`（含 `verify` 计数） |
| `server/lobby.js` | 注入 `auth`+`Matchmaker`；`accountToken` 绑定 + **单账号踢人**（`kickOtherSessions`）；`auth.*`/`mm.*`；`createMatchedRoom`/`makeBot`（`room.auto`）；`create` 存 **`room.public`**（单人房恒 false、野排 false）、`toState().public`；**`boot.claim`/`boot.release` + `bootGate`（§14 排队）**；成组失败通知；**退池**（create/join/leave/断线/返回）；对局结束**解散野排房**；退出登录；`stats().online` 走 presence；`removeMember`/`disposeRoom` 清 resync、给掉线者补结算回放 |
| `server/net.js` | `Session.accountId/accountToken`；`hello` 透传 `accountToken`；**`presenceOnline()`**（游客即时离线、登录 5 分钟宽限）；`closeSession()`（服务器端正确关会话）；`auth.*` 纳入 `HEAVY_TYPES` 限流 |
| `server/index.js` | 建库 + `AuthService` 注入；`/admin` 路由（令牌 + cookie）、`/online/api`；启动打印 Admin 链接；关闭时关库 |
| `server/match/Match.js` | `finish()` 取消 `_pubTimer` |
| `server/sim/Battle.js` | `spawnEnemy` 不再给敌人发友军 `deploy` 钩子；`_checkRedeploys` 部署被拒**退 DP** |

### 共享
| 文件 | 改动 |
|---|---|
| `shared/protocol.js` | `hello.accountToken`；`auth.register/login/logout`、`mm.join/cancel`；`room.create` 增设**可选 `public`**（缺省＝公开）；S2C `auth.ok/auth.error/mm.state` |
| `shared/constants.js` | `AUTH_*`（`AUTH_NAME_MAX = NAME_MAX_LEN`）、`MM_*`、**`PRESENCE_GRACE_MS`**；相关错误码与中文 |

### 客户端
| 文件 | 改动 |
|---|---|
| `public/js/net.js` | 账号 token 进出 `hello`；`authRegister/authLogin/mmJoin/mmCancel/setAccountToken`；`randomGuestName()` |
| `public/js/store.js` | `auth` / `mm` 状态切片 |
| `public/js/main.js` | `auth.ok/error`、`mm.state`、`room.closed{matched-end}` 接线；token 持久化；**重连/会话重置清排队态**；标题页临时 `hello` |
| `public/js/screens/title.js` | **重做**：博士代号=账号名；`AccountBox` 折叠登录/注册；空代号→游客随机代号进入 |
| `public/js/screens/lobby.js` | 「搜寻队友」按钮 + `MmOverlay`；游客徽标；**「在线 N」徽标 + 游戏内 `OnlineOverlay`**；**「公开同盟」`PublicAlliances`（4s 轮询 `/online/api` 的 `openRooms`，最多 3 个密钥、点击即加入）**；**建房 `公开 / 不公开` 二选一（`lobby.public`）**；账号弹窗；返回时退池 |
| `public/js/screens/room.js` | 野排房不再显示「同盟密钥」，改「野排队伍 · 对局结束后自动解散」；「同盟密钥」框显示 **公开 / 仅密钥** 徽标（`room.public`） |
| `public/js/screens/game.js` | `commitFacing` 定时器随卸载清理 |
| `public/js/battle/runner.js` | `clear()` 保留未送达的 `b.result`（可重发） |
| `public/js/render/spine.js` | 转场 mix 调优（`defaultMix` 0.12→0.25、`_play` mix 0.15）；慢攻速干员 `slowOp`（一击一次、不拖成慢动作）；`_sustainedSkill()` 语义标记（**原有守卫已按上游 v0.1.3 #23 撤除**，见 §15.2） |
| `public/js/render/units.js` | 被裁剪单位仍衰减闪光/抖动/血条残影 |
| `public/js/render/board3d/scene.js` `materials.js` | PMREM render target 随场景销毁；`_fitShadow` 空包围盒兜底 |
| `public/js/render/textures.js` | 缓存命中必须是**存活**纹理（被 GC 销毁的会重建） |
| `public/js/ui/account.js` | **新增**：`AccountForm`/`AccountWho`/`AccountDialog`；`logoutAccount` 通知服务端解绑 |
| `public/js/ui/components.js` | `TextField` 支持 `type`；新增 `eye`/`eyeOff`，「眼睛」切换明文/密文 |
| `public/js/preload.js` | **新增**：启动预加载（`collectArtUrls` 分 scope / `preloadImages` 并发+取消）+ `BOOT_VIDEO` 启动视频配置（现为自托管 `/assets/loading/boot.mp4?v=2`）；`main.js` 在**进标题前**加载**全部美术图片**（scope `all` ≈1910 张 / 104 MB），**带进度条、无跳过、无超时**（必须全部加载完才进标题）；见 §14 |
| `public/index.html` `public/css/theme.css` | `#boot` 启动页新增**进度条 + 背景视频 + 音提示**（现为自托管 `public/assets/loading/boot.mp4`，可用 `BOOT_VIDEO` 切回 Bilibili iframe）；`.boot__sound` 提示点击开声 |
| `public/js/main.js` | **启动视频生命周期**：静音自动播 → 首次点击/按键 `unlock` 开声音；标题出现时 `stopBootVideo()` **暂停 + 清 `src` + `load()` + 移除**并摘掉手势监听。**否则**：被摘下的 `<video>` 仍占着解码器，且手势闭包把它一直留活，**启动后第一次点击会把它重新播起来（还开了声音）→ 后台持续解码 1080p → 卡顿、并盖住 BGM（"音乐老是没"）** |
| `public/js/main.js` | **启动预加载排队**（§14）：`boot.state` 接线 + `artLikelyCached`（缓存探测）+ `acquireBootSlot`（`boot.claim` 轮询等待）+ 下完 `boot.release`；返回访客跳过排队 |

### 样式 / 脚本 / 文档 / 测试
| 文件 | 改动 |
|---|---|
| `public/css/screens/title.css` `lobby.css` `room.css` | 登录块 / 野排按钮 / 排队浮层 / **在线徽标 + 在线浮层** / **大厅"贴合视口"**（难度卡滚动、两个按钮常驻）/ **`.create-vis` 可见性二选一** / **`.invite__vis` 公开徽标** |
| `public/css/components.css` | 密码眼睛按钮、账号表单、`me-chip__guest` |
| `server-start.cmd` | 启动时设 `SP_VERIFY=sample` |
| `.gitignore` | 忽略 `var/`（SQLite） |
| `docs/MATCHMAKING.md` `docs/DEV-GUIDE-ZH.md` | 本文 + 导航 |
| `test/auth.test.js` `test/matchmaker.test.js` `test/admin.test.js` `test/bootgate.test.js` | 新增测试（`bootgate.test.js`：闸门 slot/FIFO/回收） |

## 12. 服务器管理页 `/admin`（server/admin.js）

看**已注册账号**与**实时在线状态**的只读页面：

- **公开在线数据** `/online/api`（**免令牌**）：返回当前在线玩家（名字 / 是否登录 / 状态 / 房间）+ **公开同盟房间 `openRooms`**（`[{ code, difficulty, difficultyName, host, humans, full, freeSeats, seats }]`，含**房主设为公开**、**手建 coop、未开局**的房间——大厅已满的也在内并标 `full:true`，**未满在前**、组内按人数降序、最多 12 条），**不含账号列表、IP、最后登录**；由大厅顶栏「在线 N」徽标的**游戏内浮层** `OnlineOverlay` 每 4s 拉取。**没有独立网页版**（数据来自 `server/admin.js` 的 `buildPublicSnapshot`）。
- **建房可见性（公开 / 不公开）**：大厅「创建同盟」按钮上方有 `公开 / 不公开` 二选一（`public/js/screens/lobby.js`，仅同盟模式显示，选择记忆在 `lobby.public`）；创建时作为 `room.create.public` 发送（`shared/protocol.js` 的**可选**布尔字段，**缺省＝公开**）。服务端存进 `room.public`（`server/lobby.js`：**单人房恒为 `false`**；野排房 `false`；`toState().public` 下发），房间屏「同盟密钥」框据此显示 **公开 / 仅密钥** 徽标（`public/js/screens/room.js`）。**只有 `public:true` 的手建同盟房才会进 `openRooms`。**
- **公开同盟（大厅「加入同盟」区）**：`public/js/screens/lobby.js` 的 `PublicAlliances` 同样 **4s 异步轮询** `/online/api`，把 `openRooms` 里**未满的最多 3 个**密钥显示为 `code-chip`（悬停看「难度 · 人数/4 · 房主」），**点一下即填入密钥并加入**（已满的 `full` 房跳过，不显示）；无公开房间时整行不渲染。
- **在线 / 离线判定**（`server/net.js presenceOnline`，`/admin`、`/online/api`、`/healthz` 与大厅徽标同源）：socket 连着即在线；**游客断线立即离线**；**登录用户断线后保留"在线"5 分钟**（`PRESENCE_GRACE_MS`，覆盖刷新 / 网络抖动）再离线。
- **管理页访问**：`http://<主机>:3000/admin?token=<令牌>`；令牌在 `var/admin-token.txt`（首次启动随机生成），启动日志会打印完整链接（`Admin: http://localhost:3000/admin?token=…`）。无 / 错令牌 → `403`。首次用 `?token=` 打开会下发一个 30 天的 HttpOnly cookie，之后裸链 `/admin` 也可访问。
- **数据接口**：`GET /admin/api/state?token=…` → `{ now, counts, queue, verify, rooms, accounts, online }`（页面每 2 秒自取一次）；`verify` 是 `SP_VERIFY` 抽检计数（复算 / 不一致 / 拒收 / 接管）。公开在线数据另见 `/online/api`。
- **状态判定**（`statusOf`，只读，不改任何对局逻辑）：

  | 状态 | 含义 | 判定 |
  |---|---|---|
  | 离线 | presence 不在线 | 游客：断线即离线；登录用户：断线超过 5 分钟（`PRESENCE_GRACE_MS`）后离线 |
  | 在线 | 已连接、空闲 | 有会话但不在房间 / 队列 / 对局 |
  | 组队中 | 在大厅房间里，未开始 | `roomCode` 指向未开局的房间 |
  | 野排排队 | 在野排池中等待 | `matchmaker.byKey` 命中 playerId |
  | 野排游玩 | 野排自动开局的对局中 | 房间 `inMatch` 且 `room.auto === true` |
  | 同盟游玩 | 手建同盟对局中 | 房间 `inMatch`、`mode === 'coop'`、非 auto |
  | 单人游玩 | 独立模拟对局中 | 房间 `inMatch` 且 `mode === 'solo'` |

- **三张表 + 顶部计数卡**（深色 + 薄荷绿，状态用带圆点的彩色徽标）：注册账号（ID / 代号 / 状态 / 房间 / playerId / 注册时间 / 最后登录）、在线会话（名字 / 账号或「游客」/ 状态 / 房间 / 地址 / 最近活动）、房间（房间码 / 模式 / 难度 / 状态 / 类型「野排/手建」/ 玩家 / AI）。游客没有账号，只出现在「在线会话」。页头有「实时」指示与「刷新」按钮，每 2 秒自动刷新。
- **安全**：令牌鉴权；`server/admin.js` 只读取 `registry` / `lobby` / `matchmaker` / `auth`，不暴露密码哈希。若不想让局域网访问，靠防火墙 / 反代限制 `/admin`。

## 13. 后续可做（未实现）

- 官方式的 **快速 / 精确（按等级）搜寻**（当前只按难度分桶）；奖杯 / 功勋等级；
- 匹配确认环节（当前直接开局）；匹配中显示队友昵称；
- 账号资料（头像、战绩、历史）；登录限流与验证码；
- `docs/design/*.md` / `docs/META.md` 的对应英文规则段落。

## 14. 启动带宽：预加载排队 + 缓存（2026-10，"33 人 455ms" 的处置）

**现象**：33 人在线、服务器 CPU 20% / 内存 1.3 GB（资源很足），但 ping 冲到 **455 ms**、整体发卡。

**实测**：`/sys/class/net/*/statistics/tx_bytes` 4 秒采样 → **23 Mbps ≈ 2853 KB/s**，正好顶满 RainYun 的 **20 Mbps 上行**；入口仅 0 Mbps。TCP 栈也已是最优（kernel 6.1、`bbr` + `fq`），不是拥塞算法的问题。

**根因**：**每个客户端首次进标题前要下 141 MB** —— `preload scope 'all'` **104.1 MB / 1910 张** + 启动视频 **36.9 MB**。20 Mbps ≈ 2.5 MB/s 是**全服共享**的，于是一个访客的首次加载就要独占整条上行约 **56 秒**；两三个新访客同时进来，上行打满 → 所有人的请求排队 → 卡顿。

**措施**：

1. **浏览器缓存（本就有的）**：`public/assets|fonts|vendor` 一律 `Cache-Control: public, max-age=604800`（7 天，`server/index.js` 的 `LONG_CACHE`）。**同一浏览器 7 天内第二次进入，这 141 MB 全部命中本地缓存、0 下载**（`curl -I` 可核对响应头）。
2. **预加载排队闸门**（`server/bootgate.js`，新增 `BootGate`）：**同一时刻只允许 `bootSlots`（默认 1）个客户端预加载**。
   - 客户端 `boot.claim` 申请通道 → 服务端 push `boot.state { granted, position }` → 拿到才开下载，下完 `boot.release` 交还；等待期启动页显示「正在排队加载资源… 前方 N 位博士」。
   - **返回访客不排队**：`preloadArt` 先做**缓存探测**（`main.js artLikelyCached`，取 3 张图计时，< 350 ms 视为已缓存）——已缓存就直接预加载，不申请通道。
   - **死亡不占位**：`bootHoldMs`（默认 180 s）无释放自动回收；断线/过期由 `onDisconnect` / `onExpire` 立即释放。
   - 总传输量不变，但**任一时刻只有一条客户端在拉**，链路时延平稳，不再被 N 条并发流打满。
3. **客户端已修**：启动视频在标题出现时 `pause + 清 src + load()`（`main.js` `stopBootVideo`），不再在后台解码 / 出声。

4. **启动视频压小**（2026-10-05）：`boot.mp4` 由 **1920×1080 / 2.68 Mbps / 107.5 s（36.9 MB）** 重编码为 **1280×720 / 836 kbps / AAC 96k → 12.1 MB（−69%）**。`BOOT_VIDEO.src` 走 `?v=2`（`server/index.js cacheControlFor` 对 `?v=` 返回 `immutable` 一年），否则老访客 7 天内仍命中旧视频缓存。原件备份在服务器 `/root/boot.orig.mp4`。

**仍未做（建议，按收益排序）**：`preload scope 'all'（104.1 MB）→ 'ui'（74.6 MB）` 省 ~30 MB/人（立绘改为进屏按需加载）；或把 `public/assets` 迁到对象存储 / CDN，彻底脱离这 20 Mbps 上行。

**配置**：`LOBBY_DEFAULTS.bootSlots`（默认 1）、`bootHoldMs`（默认 180000）在 `server/lobby.js`，可由 `startServer({ options })` 覆盖。

## 15. 合并上游 v0.1.3（2026-10-05）

上游 `sganggs/Stronghold-Protocol` 在 `bdb0765` 之后推进了 **69 个提交 / 172 个文件**（`v0.1.3`：主要是玩法与平衡修复，外加联机/界面改进）。合并方式：用 `git worktree` 把「我们当前的状态」提交成 `ours` 分支，再 `git merge origin/master`，**在临时目录里解完冲突、跑绿全量测试，才拷回本项目**。

- 我们改了 65 个文件、上游改了 172 个，**重叠 25 个** → git 自动合掉 15 个，**手动解 10 个**：

  | 冲突文件 | 处理 |
  |---|---|
  | `data/assets.json` | 取上游（生成物，`tools/fetch-assets.mjs` 产出） |
  | `shared/constants.js` | **并集**：我们的账号/野排错误码 + 上游 `SPECTATOR` |
  | `public/js/main.js` | **并集**：store import 同时带 `loadPref/savePref` 与上游 `isSpectating`，保留我们的 `preload.js` |
  | `public/js/ui/components.js` | 保留我们的 `gear`/`eye`/`eyeOff`（上游的 `eye` 是重复键） |
  | `public/js/screens/lobby.js` | **并集**：我们的 `Tabs` + 上游 `MAX_SPECTATORS` |
  | `public/js/screens/room.js` | **并集**：上游 `SpectatorBar` + 我们的 `InviteBox({ code, public: isPublic })` |
  | `server/net.js` | **并集** `HEAVY_TYPES`：我们的 `auth.*` + 上游 `room.spectate` |
  | `server/lobby.js` | **4 处全并集**：`online`＋`spectators`、dispatch 里 `auth/mm/boot`＋`room.spectate`、`disposeRoom` 里观战通知＋我们的 `replay` |
  | `public/js/render/units.js` | 见 §15.1（补齐上游的整套攻击前冲） |
  | `public/js/render/spine.js` | 见 §15.2（与上游 #23 对撞，以上游为准） |

- **合并后跑绿**：`node --test` → **3664 项 / 3650 通过 / 0 失败 / 14 跳过**（合并前 3541 项；上游带来 +123 项测试）。

### 15.1 攻击前冲（GitHub #61，上游 `41739be`）
`public/js/render/units.js` 的 `update()`：

```js
// 修前：所有单位都冲
const lungeK = this.lunge > 0 ? Math.sin(this.lunge * Math.PI) * 0.12 : 0;
// 修后：Spine 模型已显示就不冲（#61）
const lungeK = this.lunge > 0 && !(this.actor && this.spineReady) ? Math.sin(this.lunge * Math.PI) * 0.12 : 0;
```

- `onAttack` 置 `this.lunge = 1`，`update` 里 `lunge -= dt*5` → `sin(lunge·π)·0.12` 是 **0.2 s、峰值 0.12 格** 的正弦鼓包。
- 用途：**钻石形头像**（Spine 未就绪）没有攻击动画，靠它代替；**Spine 模型**自带攻击动作，冲一下就变成「每发远程攻击把模型推歪」（#61）。
- 实测（1600×900 正常相机，1 格 ≈ 134.5 px）：钻石峰值 **16.53 px**，Spine **全程 0 px**。
- 同一次提交还修了弹道：从**手**发射、瞄**胸口**（`fx.js SHOT_HEIGHT = { launch: 0.45, aim: 0.5 }`），不再是腰→腰。
- ⚠️ 我们之前是**把整套前冲删掉**（所有单位都不冲）。若更喜欢「全都不冲」，改一行即可（`lungeK` 直接置 0）。

### 15.2 持续技能（初雪/薄绿浮空）与上游 #23 的对撞
- 上游 v0.1.3 新增「**技能自带 idle**」：有自带 idle 的技能用 loop 攻击、攻击间隙回 idle；没有 idle 的技能行为不变（社区 #23）。
- 我们此前的 `_sustainedSkill()` 守卫（持续技能被攻击不打断）与该设计**在同样的角色数据上要求相反行为，无法并存**。
- **取舍：以上游为准**。保留我们的 `slowOp`（慢攻速干员不拖成慢动作）与转场 `mix` 调优；`_sustainedSkill()` 方法保留（测试用）但去掉守卫；把原来那条测试改为断言真实保证（"持续技能期间攻击保持 `Skill_Loop`，不回 Idle/Attack"——上游设计里技能期间的待机动画本来就是技能 loop，所以浮空视觉仍成立）。
- ⚠️ 这两处（前冲、浮空）**建议进游戏实机验一下手感**。

**回滚**：`D:\DOTK\_optim-backup-20261005-merge-v013\` 内 `ours-pre-merge-f2d1fee.tar.gz`（合并前）与 `merged-7af3867.tar.gz`（合并后）各一份完整源码快照；临时合并目录 `D:\DOTK\_merge-scratch`（含 git 历史）。

## 16. 本项目全部改动总览（相对上游 v0.1.3，2026-10-05）

> 一句话：**在官方上游 v0.1.3 之上，本项目加了「账号体系 + 野排匹配 + 公开同盟 + 在线状态 + 启动体验 + 带宽治理」，并保留了一批战斗/渲染审计修复。** 代码与上游同源，合并与取舍见 §15。

### 16.1 账号与会话
- 存储用**内置 `node:sqlite`**（`server/db.mjs`，库在 `var/accounts.db`，`PRAGMA user_version` 迁移）；密码 **scrypt** 加盐、`timingSafeEqual` 比较（`server/auth.js`）。
- **代号 = 账号名**：大小写不敏感唯一、2–12 字；标题页折叠登录/注册；**空代号点进入 → 随机游客代号**；密码框「眼睛」明文切换。
- 会话 TTL 30 天；重连用 `hello.accountToken` 恢复。
- **单账号单会话**：登录轮换 token + 踢掉旧 socket（`kickOtherSessions`，关闭码 4001）。
- `auth.logout` 服务端解绑（不是只清本地）。

### 16.2 野排（自动匹配，`server/matchmaker.js`）
- 共享池**按难度分桶**、**30 s 窗口**、满 4 人**立即开局**、不足由 **AI 补位**；`mm.state` 进度 ~1 Hz。
- **需登录**；排队浮层 `MmOverlay`，取消 / 断线即退池。
- **退池**：取消 / 离开大厅 / 建房 / 进房 / 断线 / 过期一律退池；成组失败也补发 `queued:false`（不留幽灵）。
- 野排房 `room.auto`：**对局结束即解散**、不显示同盟密钥、不进「最近同盟」。

### 16.3 同盟（手建房）
- 建房可选 **公开 / 不公开**（`room.create.public`，缺省公开；单人房恒 false）。
- **公开同盟列表**：`/online/api.openRooms`，客户端 4 s 轮询、最多 3 个、点击即填密钥并加入。
- 房间屏「同盟密钥」框显示 **公开 / 仅密钥** 徽标。
- 与上游 v0.1.3 的**房主踢人**、**观战位**共存（合并时逐行并集，见 §15）。

### 16.4 在线状态 / 管理页
- `presenceOnline()`：**游客断线即时离线**；**登录用户断线保留 5 分钟**（`PRESENCE_GRACE_MS`）。
- 大厅「在线 N」徽标 + 游戏内 `OnlineOverlay`（免令牌 `/online/api`，4 s）。
- `/admin` 只读页（令牌 + 30 天 cookie）：注册账号 / 在线会话 / 房间三张表 + `SP_VERIFY` 抽检计数。

### 16.5 启动体验与带宽（详见 §14）
- **启动页**：进度条 + **自托管背景视频**（点击开声、无控件、不可拖动）+ **无跳过、无超时**（必须全部加载完才进标题）。
- **视频生命周期**：标题出现即 `stopBootVideo()`（暂停 + 清 `src` + `load()` + 移除并摘监听）——否则被摘下的 `<video>` 仍占解码器、且手势闭包把它留活，**启动后第一次点击会把它重新播起来（还出声）→ 后台解码 1080p → 卡顿并盖住 BGM**。
- **视频压小**：1920×1080/2.68 Mbps（36.9 MB）→ 1280×720/836 kbps（**12.1 MB**）；URL 走 `?v=2` 破 7 天强缓存。
- **预加载排队闸门** `server/bootgate.js`：一次只放 `bootSlots`（默认 1）个客户端预加载；已缓存的返回访客**不排队**；断线/过期立即释放。
- 静态资源 7 天强缓存（`/assets|fonts|vendor`）；`socket.setNoDelay(true)`。

### 16.6 保留的战斗 / 渲染审计修复
- `public/js/battle/runner.js`：`clear()` 保留未送达的 `b.result`（可重发）。
- `public/js/screens/game.js`：`commitFacing` 定时器随卸载清理。
- `public/js/render/board3d/{scene,materials}.js`：PMREM render target 随场景销毁；`_fitShadow` 空包围盒兜底。
- `public/js/render/textures.js`：缓存命中必须是**存活**纹理。
- `public/js/render/units.js`：被裁剪单位仍衰减闪光/抖动/血条残影。
- `public/js/render/spine.js`：转场 mix 调优；慢攻速干员 `slowOp`。
- `server/match/Match.js`：`finish()` 取消 `_pubTimer`。
- `server/sim/Battle.js`：敌人不再收到友军 `deploy` 钩子；部署被拒**退 DP**。
- ⚠️ 与上游冲突的两处已按上游为准：**攻击前冲**（上游 #61 版，§15.1）与**浮空技能**（上游 #23 版，§15.2）。

### 16.7 环境开关
| 项 | 值 | 说明 |
|---|---|---|
| `SP_VERIFY` | `sample`（Windows `server-start.cmd` 设定） | 服务端抽检复算客户端战斗结果 |
| `LOBBY_DEFAULTS.bootSlots` | `1` | 启动预加载并发闸门（`server/lobby.js`） |
| `LOBBY_DEFAULTS.bootHoldMs` | `180000` | 闸门无释放时的兜底回收 |

**当前线上**：`http://183.66.27.19:20522`，`app 0.1.3`（上游 v0.1.3 + 上述全部改动），`build` 见 `/healthz`。备份与回滚见 §15 末尾。

## 17. 观战与「夺舍 AI」（2026-10-05）

上游 v0.1.3 自带的观战入口（「加入同盟」旁边的 `观战` 按钮）体验不好，按需求改掉：

### 17.1 入口：从「正在模拟」列表进入（`/online/api` → `playRooms`）
- `server/admin.js` 的 `buildPublicSnapshot` 新增 **`playRooms`**：**正在打**（`r.match` 存在）的 coop 房间，字段 `{ code, difficultyName, host, humans, bots, auto }`；**排序 = 野排优先 → 有 AI 席位优先 → 人多优先**，**最多 4 个**。
- 大厅「加入同盟」面板下方两行（`public/js/screens/lobby.js` 的 `PublicAlliances`，4 s 轮询）：
  - **公开同盟**（`openRooms`）→ 点击**加入**；
  - **正在模拟**（`playRooms`）→ 点击**观战**（`room.spectate`）。
- 本地「最近的同盟」行**已于 2026-10-07 下架**（见 §22；此前一直保留）。
- 🐞 顺带修掉一个崩溃：`screens/lobby.js` 用了 `ERR.*` 却没 import `ERR` → 点「观战」报 `ERR is not defined`。

### 17.2 观战席：紧凑下拉，不占地方
- `public/js/screens/room.js`：原 `SpectatorBar`（一整条）改为 **`SpectatorDock`** —— 一个 `<details>` 小下拉，摘要行只写「观战席 n/2」，展开后是观战者名单（房主可 ✕ 移出）、有空位时的**入座**、以及**夺舍 AI 队友**。
- `public/js/screens/game.js`：观战**正在进行的对局**时，右下角浮一个同样的紧凑下拉 `SpecDock`（`position: fixed`），列出其他观战者 + **夺舍 AI**。它挂在 `GameScreen`（**路由层**）而不是战斗主体上，所以**确认信息 / 选盟约 / 战斗**各个阶段都能看到并夺舍。
- 样式在 `public/css/screens/room.css`（`.specdock*`）与 `public/css/screens/game.css`（`.specdock--ingame`）。

### 17.3 夺舍 AI（`room.takeOver`）
- 协议：`room.takeOver { seat }`（C2S）。
- `server/lobby.js` 的 `takeOver(session, { seat })`：只允许**观战者**夺舍**AI 席位**（空位请走 `room.join`），并保证**游玩者 ≤ MAX_SEATS**。
  - 房间**未开局**：直接把该 AI 席位换成本人；
  - 对局**进行中**：`Match.takeOver(humanId, seat, name)`。
- `server/match/Match.js` 的 `takeOver`：把该 AI 的**整个 `PlayerState`** 交给人 —— 同一席位 / 棋盘 / 资金 / 调配 —— 并把**所有按 playerId 索引的结构重写**（`players`、`spectators`、`watchers`、`fields[].players`、`draft.order|picks|skipsLeft`、`sp.order|picks|taken`、`f.result.perPlayer` …），随后 `_resync(ps)` 给新玩家发 `m.public` + 他自己的 `m.private`（战斗中还补 `m.field`）。这样他之后发的 `g.*`（带自己的 playerId）会自然路由到那个席位。
- `server/match/StubMatch.js` 同步实现该接口，并写进文件头的**平台契约**注释。
- 测试：`test/lobby.test.js` 增加「spectator takes over an AI seat — in the lobby and while the match runs」。

**约束**：AI 席位只能把 AI 换成真人，所以**游玩者永远 ≤ 4**。

### 17.4 退出夺舍（`room.releaseSeat`）
- 协议：`room.releaseSeat {}`（C2S）。**只对"夺舍来的席位"有效**（`room.state` 的席位带 `fromAi: true`）。
- 行为：把席位交还给一台**新的 AI**（沿用你那时的棋盘 / 资金 / 调配），本人**回到观战席**继续看 —— `room.takeOver` 的反操作。
- `Match.releaseSeat(humanId, aiId, aiName)`：把 `PlayerState` 反向改写成 `ai_…`（`isBot = true`），再跑一遍重写，然后把本人注册成观战者并 `_resync`（发公开视图）。
- 重写逻辑抽成 **`Match._rekeyPlayer(from, to)`**，夺舍 / 退出夺舍共用（`players`/`spectators`/`watchers`/`fields[].players`/`draft.*`/`sp.*`/`f.result.perPlayer`）。
- 房主若退出夺舍：先 `migrateHost`；若场上已无人持有席位，则**保留本人为房主**（人还在房里，控制权不变）。
- 客户端：`SpectatorDock`（房间屏）与 `SpecDock`（战斗界面）在「**你自己的席位 `fromAi`**」时显示 **退出夺舍（回到观战席）**；战斗界面那个下拉此时也会为"夺舍者"显示（此前只在观战时显示）。
- `test/lobby.test.js`：夺舍用例补上「退回观战席」与「普通玩家不能退（`BAD_TARGET`）」。

## 18. 界面打磨：反馈群、盟约居中、点其他位置收起（2026-10-06）

本轮是**纯客户端 UI/UX** 改动（**无协议 / 服务端变化**），按实机手感与用户反馈调整。

### 18.1 标题页「反馈群」入口（`screens/title.js` / `css/screens/title.css`）
- 左下角新增 **`FeedbackGroup`**：药丸「反馈群 816461825」→ 点击展开**二维码卡片**（群号 `816461825`；二维码 `/assets/ui/feedback-qr.png` 由进群链接生成，560px），卡片内有「QQ群 816461825」按钮（**点击复制群号**）与说明「使用手机 QQ 扫码加入同盟」。
- 药丸下方一行小字「**服务器为个人免费服务器 · 容量较小**」（对齐参考服务器的「服务器交流群」样式：药丸 + 二维码浮出卡 + 备注）。
- **点卡片 / 药丸以外任意位置收起**（见 §18.4）。

### 18.2 盟约条居中 + 上移（`css/screens/game.css`）
- `.gm__bonds` 由偏左定位改为 **`left:0; right:0; justify-content:center`** —— 盟约条在**任意宽度下都整条横向居中**（`fieldHost.js` 注释里的「盟约条底边」随之下移，单位图标不再和它错位）。
- `top` 由 **1.36rem → 1.08rem → .80rem**（2026-10-06，用户反馈「盟约图标上移些，不要遮挡干员」）：16:9 下官方取景把战场后排顶边贴着盟约条，干员立绘头肩会顶进条里；上移后尽量贴近顶栏（顶栏内容底边 ≈.66rem）。
- `HUD_REM.bondStripBottom` **仍为 2.16rem**：prep 相机的 HUD 余量不跟着减小，于是相对新条底（≈1.58rem）多留约 0.58rem，专门给后排干员立绘的头顶让位。

### 18.3 盟约详情弹窗居中（`css/screens/game-panels.css` + `ui/gameLogic.js`）
- `.bpop` 基准位置改为 **`left:50%; transform:translateX(-50%)`**（与居中的盟约条对应）；`beside` / `besideR` / `right` 三种停靠位补 `transform:none` 还原各自定位。
- `gameLogic.bondPopupPlace()`（`BPOP` 常量）里 `rectOf('left')` 用**居中后**的左边界，弹窗「不遮挡选中单位底盘 / 详情卡」的落点逻辑随之更新（`game.js` 的 `bpPlace`）。
  - ⚠️ **后被 §18.6 取代**：用户要求弹窗「恒居中不动」，`game.js` 不再调用 `bondPopupPlace`（不再停靠），helper 与本节描述仅作历史 / 单测保留。
- ⚠️ 部署后**若线上看不到效果先 `Ctrl+Shift+R` 强刷**：浏览器会缓存旧的 `game-panels.css`（`/css` 虽 `no-cache`，实测仍可能命中旧样式）。

### 18.4 点其他位置收起（`screens/game.js`、`screens/title.js`）
- **盟约详情弹窗 + 干员详情卡**：在 `GameScreen`（`public/js/screens/game.js`）加一个 `window` `pointerdown`（capture），按「点在其他面板之外就收起」处理两个浮层（**不放在 `BondPopup` 里**：单测直接调 `BondPopup(props)` 检查 vnode 树，组件里加 hooks 会崩 —— 见 `test/ui/watch-bonds.test.js`）：
  - **盟约弹窗**：点在 `.bpop` / `.bstrip` / `.dpanel` 之外 → `setBondOpen(null)`（**排除盟约条的盘**保留它自己的开/关切换、**排除详情卡**让其盟约标签仍可切换）。
  - **干员详情卡**：点在 `.dpanel` / `.bpop` / `.uframe` / `.fwheel` / `.modal` / `.guide` / `.spov` 之外 → `setDetail(null)` + `setSel(null)`（与点 ✕ 一致）。原来**只有点棋盘**才关，且挂在 field host 上的 `pointerdown` 用 `closesOnFieldPress` **只认 `piece` / `unit`** 两种卡 —— 从**商店卡 / 盟约成员 / 敌方情报**开的 `chess` / `item` / `enemy` 卡会一直留到点 ✕。排除 **`.uframe`**（单位操作底盘「撤退 / 出售 / 销毁」的按钮不能被误关掉）、**`.fwheel`**（朝向轮盘）、各类弹窗 / 玩法说明 / 机变决策。
- **标题页反馈群卡片**（`public/js/screens/title.js` 的 `FeedbackGroup`）：点 `.title-group-wrap` 以外收起（药丸本体仍是开/关）。

### 18.5 涉及文件
| 文件 | 改动 |
|---|---|
| `public/js/screens/title.js` | `FeedbackGroup`：反馈群药丸 + 二维码卡 + 复制群号；点外部收起 |
| `public/css/screens/title.css` | `.title-group-wrap` / `.title-group` / `.title-group-card` / `.title-group-qr` / `.title-group-note` |
| `public/assets/ui/feedback-qr.png` | **新增**：反馈群二维码（560px） |
| `public/css/screens/game.css` | `.gm__bonds` 横向居中 |
| `public/css/screens/game-panels.css` | `.bpop` 居中 + `--beside/--besideR/--right` 还原 `transform` |
| `public/js/ui/gameLogic.js` | `bondPopupPlace` 用居中后的左边距（`BPOP.left` 移除，`rectOf('left')` → `(W − R·width)/2`） |
| `public/js/screens/game.js` | 干员详情卡 + 盟约弹窗「点外部收起」（`window` capture 监听） |
| `test/ui/playtest2.test.js` / `playtest5-ui.test.js` | 断言跟上居中后的几何（`rectOf('left')`、`.gm__bonds` 居中） |

### 18.6 续：抽屉点外部收起、盟约框固定居中、购买卡变宽、顶栏变扁（2026-10-06）
- **本局信息 / 敌方情报抽屉点外部收起**（`public/js/screens/game.js`）：把 `drawer`（`.edrawer`）也纳入 §18.4 的 `window` capture 监听——点在 `.edrawer` / `.gtop__iconbtn`（顶栏那两颗 🔍）之外即 `setDrawer(null)`；那两颗按钮保留自己的开 / 关。
- **盟约框固定居中**（`public/js/screens/game.js`）：之前 `bondPopupPlace` 按详情卡所在侧把弹窗停靠到 `beside / besideR / right`，一打开或切换干员详情就跳位置。现在**不再传 `place` / `over`**，弹窗恒用基础 `.bpop`（`left:50%; translateX(-50%)`）居中不动。（`gameLogic` 的 `bondPopupPlace` / `BPOP` 与 `.bpop--beside*` 规则保留，当前不再被界面调用——单测仍覆盖它。）
- **购买界面卡片变宽 + 同宽**（`public/css/screens/game-shop.css`）：`.scard` 宽 **1.56 → 1.92rem**，LEVEL 卡 `.lvcard` **1.24 → 1.92rem**，资金卡 `.funds` **1.18 → 1.92rem**——三者等宽；同时上面的 **冻结 / 刷新** `.toolbtn` 调大（min-width 1.5rem、高 .48→**.56rem**、图标放大）。
- **资金更醒目**（`public/css/screens/game-shop.css`）：六边形 1×.9 → **1.16×1rem**，金币 .34 → **.42rem**，数字 .36 → **.5rem / 900 / 金色发光**，「目前资金」标签改金色。
- **顶栏变扁**（`public/css/screens/game.css`）：`.gtop__center` 高 **0.78 → 0.52rem**、`.gtop` 顶部内边距 .2→.12rem；同时缩小内部件——阶段胶囊 `.capsule` .5→.42rem（图标 .36→.30、字号 .21→.18）、`.gtop__iconbtn` .46→.40rem、`.roundbox__num` .44→.38rem（字号 .32→.26）、`.lp--lg` .34→.28rem、`.readybtn` .56→.46rem。整条顶栏明显变扁。
- **盟约条再上移**：`.gm__bonds` top 1.08 → **.80rem**，紧贴变扁后的顶栏下方。
- 涉及文件：`public/js/screens/game.js`、`public/css/screens/game.css`、`public/css/screens/game-shop.css`。测试：`test/ui/playtest5-ui.test.js`（`.scard` 宽）、`test/ui/playtest2.test.js`（盟约框几何不变）。

### 18.7 盟约详情成员列表只列可用干员（2026-10-06）
- `public/js/ui/bondStrip.js` 的 `BondPopup`：`成员` 列表**过滤掉本局禁用的干员**（`bondMembers` 的 `banned`）——用户反馈「被禁用的干员小 ✕ 不够明显，索性不显示，只列本局可用的」。
  - `成员 N/M` 的计数改成**可用成员**；`UnitThumb` 不再画 `is-banned`/红 ✕ 徽标。
  - 若有隐藏，列表下方加一行 `.bpop__hidden`「另有 N 名成员本局禁用，未列出」（`public/css/screens/game-panels.css`）。
- 测试：`test/ui/watch-bonds.test.js` 新增「banned operators are not listed: only the available members, with a hidden note」。

### 18.8 官方质感打磨（2026-10-06，用户「太简陋了，对齐官方」）
范围：选中单位操作框 / 底部购买栏 / 顶部 HUD（用户选定）。功能不动，只做美术质感。
- **选中单位操作框**（`css/screens/game-panels.css` + `js/ui/underframe.js`）：撤退/出售/销毁的八角面板改成径向渐变 + 内高光 + 双层描边 + 更重投影；四角 chevron 加粗 + 薄荷发光；菱形底衬加深；标签改成**深色胶囊 + 键位胶囊**（`.uframe__key`，由原来的 `撤退[Q]` / `出售[X]` 拆出，官方 `pc_key_holder` 观感）；价格 hex 放大到 `.28rem`。
- **底部购买栏**（`game-shop.css`）：干员卡加**稀有度描边**（`border-color: color-mix(in srgb, var(--tc) …)`，带回退行）+ **顶部稀有度色条**（`.scard::before`）+ 立体投影。
- **顶部 HUD**（`game.css`）：`.gtop__center` 描边改薄荷 + 内高光 + 底部薄荷强调线（`.gtop__center::before`；角标仍由 `.brackets::after` 画）。
- 验证：自带浏览器实机看顶栏/购买栏，另建临时预览页目检操作框（已删）；全量 `node --test` 通过。
  - 顺带把 `test/lobby.test.js` 的确定性 fuzz 加了一个**确定性种子**（先跑一局到 INFO_CHECK 并 `g.infoReady`），避免它因真实计时/房间销毁规则偶发失败。

### 18.9 盟约成员「在场 / 已拥有 / 未拥有」三态更明显（2026-10-06）
用户反馈：盟约详情成员列表里「激活（在场）vs 未激活（未拥有）」看不太出来。
- `public/css/screens/game-panels.css` 的 `.bpop__member`：
  - **在场**（`is-on`）：**薄荷实框 + 薄荷底色 + 内/外发光 + 左上角薄荷三角角标**，名字薄荷加粗。
  - **已拥有未上场**（`is-owned`，整备区 / 手牌）：白描边 + 白名字（无薄荷）。
  - **未拥有**：整格 `opacity: .6` + 缩略图本就 `grayscale`，名字用最暗色——可用干员因此格外突出。
  - 修了一个顺序 bug：原来 `is-owned` 的白色名字写在 `is-on` 之后，把在场成员的薄荷名覆盖了；现在 `is-on` 名字规则在后、优先生效。

## 19. 观战席断线释放（2026-10-06，修「进不了房间」）

### 19.1 症状
大厅「正在模拟」点某房间的 **观战** → `房间已满`（服务端 `room.spectate` → `ROOM_FULL` / `no free spectator seat`），但 `/online/api` 里该房间只有玩家在线、没有观战者在线。

### 19.2 原因
观战席（`MAX_SPECTATORS = 2`）按「像玩家席位一样保留、重连还给」实现：大厅里断线看 `lobbyGraceMs`（60 s）释放；但对局进行中断线的观战者，`server/lobby.js` 的 `onDisconnect` **既不起 grace、也不通知 match**（`if (room.match) { if (player) … } else startGrace(…)`），席位要等 registry 的 **reconnect 窗口（10 分钟）** 过期、`onExpire → removeMember` 才释放。两个断线的观战者就把 2 个席位锁住 10 分钟，后面的人一直进不来。

### 19.3 修复（`server/lobby.js`，纯服务端）
- `onDisconnect`：**观战者**（非玩家席位）断线时也起 grace（`startGrace`）；对局进行中只对**玩家**保留原逻辑（`callMatch('onDisconnect')`）。
- `startGrace`：判断该席位是不是观战者（`!room.seatOf(id) && room.spectatorOf(id)`）；观战者的 grace **即使 `room.match` 存在也照常触发**（玩家的 grace 依旧让 match 管）。
- 于是观战者断线后 **`lobbyGraceMs`（60 s）** 释放席位，重连（远快于 60 s）仍拿回席位。
- 未采用「满员时挤掉断线观战者」的即时方案：它会让 `test/lobby.test.js` 的确定性 fuzz（`g.infoReady` 至少要成功一次）不再命中。

### 19.4 测试
- 新增 `test/lobby.test.js`「a dropped spectator is freed while the match runs too」：对局进行中 2 名观战、第 3 人被拒 → 断线一个 → grace 后席位释放 → 第 3 人进得来。
- 既有「spectators during a match … reconnect gets the seat back」仍通过（重连远快于 grace）。
- `docs/design/network.md` 的观战席「Reconnect」段同步改写；`server/lobby.js` 文件头注释同步。

## 20. 弃局房间销毁（2026-10-06，修「真人全退出了房间还在」）

### 20.1 症状
真人建房 → 加 AI → 开局 → 真人**关标签页 / 断线**后，房间不销毁：队伍面板里 P1 仍是那个（已离线的）真人、其余是 AI，观战者能一直看，`/online/api` 的「正在模拟」里也一直挂着。

### 20.2 原因
`Room.activeHumans()` 只排除 `isBot` / `left` 的席位，**断线的真人**（`left=false`）仍算「活着」。对局中断线的席位按设计保留到 registry 的 **reconnect 窗口（10 分钟）**（旧 `onDisconnect` 对局中不起 grace），于是「0 个在线真人」的房间被一个断线席位吊着最多 10 分钟。
（显式 `room.leave` 本来就是对的：`seat.left=true` → `activeHumans` 归零 → 立即销毁。实测：`leave` 修复前就销毁 ✓，`terminate` 断线修复前不销毁 ✗。）

### 20.3 修复（`server/lobby.js`，纯服务端）
- `onDisconnect`：**任何**掉线都起 lobby grace（旧代码对局中不起）——观战者照旧在对局中也释放；**真人**只有到「房间已没有任何在线真人」时才会被 grace 真正移除（有活人的派对仍保留席位）。
- `startGrace`：对局中的**玩家** grace 允许触发，前提是 `room.activeHumans()` 里**没有 `connected` 的真人**（且 `mode !== 'solo'`，solo 的 24h 重连不受影响）。
- `removeMember`：处理完当前离场后若**已无在线真人**，把剩下的断线席位也一并按离场处理——最后一个负责 `disposeRoom('empty')`（覆盖「A 断线 + 之后 B 离开」）。
- 结论：**一个合作房间只在还有在线真人时存在**；真人全离线 / 离开后，最多一个 `lobbyGraceMs`（60 s）宽限即销毁，观战者收到 `room.closed {empty}`。solo 房间不适用（保留 `singleReconnectTime` = 24 h）。

### 20.4 测试
- 新增 `test/lobby.test.js`「all humans dropping mid-match disposes the room after the grace; a live party keeps the dropped seat」：① 真人断线但还有另一个在线真人 → 房间保留、席位 `connected=false`；② 全体离线 → grace 后房间销毁、观战者收到 `{empty}` 且 `room.leave` 报 `NOT_IN_ROOM`。
- `server/lobby.js` 文件头注释同步。

## 21. 合并上游 18 个提交（2026-10-06）

- 上游 `sganggs/Stronghold-Protocol` 的 `origin/master` 从 `763e224` 前进到 **`19a8908`**（**18 个提交 / 91 个文件 / +4765 −317**），版本仍 `0.1.3`。
- 合并流程（`_merge-scratch`，分支 `ours`）：
  1. **先完整同步**工作项目当前状态（工作项目**无 `.git`**，`ours` 此前停在 10-05；比对出 25 个已跟踪文件与之不同，全部拷入并提交）。
  2. `git merge origin/master` → **只有 5 个文件 / 6 处冲突**，全部解掉，**我们的改动全部保留**：
     - `public/css/screens/game.css`：我们的盟约条**居中+上移** × 上游 #149 **可折叠盟约条** → 保留我们的定位 + 上游的 `flex/gap` 与折叠按钮规则。**（#149 随后已回退，见 §22）**
     - `public/js/screens/game.js`：import 列表 → 并入上游 `fieldTile` / `ownerBandId` / `bondPopupPlace`。
     - `public/js/ui/gameLogic.js`：`DEFAULT_SETTINGS` → 采用上游（新增 **`voice`** 音量，默认改为 .6/.8/.8）。
     - `public/js/screens/room.js`（2 处）：#103 邀请语 → `InviteBox` 同时支持我们的 `public` 与上游 `name/difficulty`。
     - `public/js/screens/title.js`：#183 标题页设置按钮 → 保留我们的账号同步 + 上游 `settingsOpen`。
  3. 备份：`D:\DOTK\_optim-backup-20261006-merge-18commits`（76 个被覆盖文件）；合并提交 `ours = 0466d35`（其父 `61c5960` = 我们的状态）。
  4. 把差异（91 文件）应用回工作项目 → 全量 `node --test` **仅 `test/assets.test.js` 失败**（见下）。
- **带入的上游新功能**：#183 标题页设置按钮、#24 资源 gh-proxy 镜像、#185 特殊地形格自解释 / 活性源石、#134 漏怪警报音、#186 3D 棋盘 WebP、#73 干员战斗语音、#109/#160 技能时间窗（部署即计时 / 无 Begin·Idle 片段）、#103 邀请链接带邀请语、#72 回合 BGM（无畏者 / 骑士之日）、#129 观战队友手牌·装备·策略·效果、#110 联防腐蚀 BGM、#66 灵巧阵亡光环 / 隐藏层盟约、#150 观战手持物品不再停画 等（**#149 盟约条可折叠已弃用，见 §22**）。
- **资源（已补齐，见 `docs/ASSETS.md` §本地客户端来源）**：合并后 `data/assets.json` 新增约 **1690 个文件**（120 名干员语音、BGM、音效、`enemy_5601_entlec` 图标）。补齐方式：
  - **语音（1680 条）**：用**本地日服客户端**抽 —— 新工具 **`tools/local-extract/extract-voice.py`**（UnityPy 解 `voice/<干员>.ab` 的 AudioClip → ffmpeg 转 mp3 → 写回清单槽位，**无需改清单**）；默认取日服默认语言 `voice`（日语），`--voice-dir …\voice_cn` 可换 CN。
  - **BGM / SFX（6 个）**：本机直连 `raw.githubusercontent`/`jsDelivr` 被墙，但 `fetch-assets` 加 **`--asset-source=mirror`**（#24 的 gh-proxy 镜像）就能下 → `node tools/fetch-assets.mjs --asset-source=mirror`。
  - `enemies.enemy_5601_entlec.icon` 两边都没有 → 清单已省略该项，客户端用回退。
  - 结果：全量 `node --test` **exit=0**。

## 22. 不采纳的上游改动（合并黑名单，2026-10-06）

> 合并上游时**一律跳过**下列改动：即便上游再次提交/更新它们，也保持本仓库现状——冲突时**以我们为准**，必要时合并后再 `git revert`。**我们下架的自有功能**（表内「我们自己的功能」一行）同理：**不要恢复 / 不要合并**。

| 上游 | 内容 | 为什么不采纳 | 我们保留的行为 |
|---|---|---|---|
| **#149**（commit `ede8e7e`，issue #142「盟约条可折叠 / The bond bar can be folded」） | 盟约条加「收起／展开盟约」折叠按钮：收起时隐藏整个列表并关掉由它打开的浮层，只留一个 44×44 的恢复按钮 | **收起/展开很突兀**（用户 2026-10-06 反馈），不想为手机让位牺牲观感 | 盟约条**常驻**、居中，没有折叠按钮 |
| **最近的同盟**（**我们自己的功能**，非上游） | lobby「加入同盟」区顶部一行「最近加入/创建过的同盟密钥」快捷芯片（本地记录，`sp.pref.recentRooms`；`public/js/screens/lobby.js` 的 `recentRooms` / `rememberRoom` + `public/js/main.js` 的记忆调用） | **owner 2026-10-07 要求下架**：不需要这排「最近」芯片 | **已整段删除**；「加入同盟」输入框 + 加入 / 观战、`公开同盟`、`正在模拟` 保留 |

**回退内容**（#149 的痕迹已全部清除，`grep -r "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip"` 无命中）：
- `public/js/screens/game.js`：删掉 `bondsCollapsed` state、`.bonds-toggle` 按钮、`#match-bond-strip` 包裹 div → 还原为直接渲染 `<BondStrip>`。
- `public/css/screens/game.css`：`.gm__bonds` 去掉上游的 `align-items:flex-start; gap`（保留我们的 `display:flex; justify-content:center`）；删掉 `.gm__bond-list` 与 `.bonds-toggle*` 规则。
- `docs/design/client.md`（合并前是 `docs/DESIGN.md` 的界面段）/ `docs/PLAYING.md`：删掉 #149 的两段说明。
- `test/ui/bond-collapse.e2e.test.js`：删除（该 E2E 专测折叠）。

**另有我们独有的「最近的同盟」（非上游，2026-10-07 下架）**：
- `public/js/screens/lobby.js`：删掉 `recentRooms()` / `rememberRoom()` 两个导出、`const [recent] = useState(recentRooms)`，以及「加入同盟」面板里的 `.join-foot` 最近芯片行（含「填入密钥（不会直接加入）」提示与空态提示）。
- `public/js/main.js`：删掉 `rememberRoom` 的 import 与 `room.code` 的记忆调用。
- 4 个语言包（`public/i18n/{en,ja,ko,zh-TW}.json`）删掉只剩它用的 3 条 msgid：`最近的同盟`、`填入密钥（不会直接加入）`、`向同伴索取 {ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接`。
- 无测试覆盖它（`grep -rl 'recentRooms\|rememberRoom\|最近的同盟' test/` 无命中）。
- 自查：`grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test` 应无命中。

**下次合并怎么自查**：`git log -S bondsCollapsed -- public/js/screens/game.js` 能看出上游是否又把它加回来；一旦 `.gm__bonds` 相关块冲突，取我们的版本。

> 全部**「我们独有、非上游」**的机制（自造干员 / 双层战斗特效 / 本地素材管线 / 资源镜像 / 本文档 §22–§35 的既定决策 / 发布与部署）已汇总为独立清单 [`docs/OUR-FEATURES.md`](OUR-FEATURES.md)：每条都写明「是什么、代码在哪、怎么扩展、哪些测试钉住、**我们独有，非上游；合并时不得丢失**」。合并上游前先过一遍它；本表（黑名单）是其中 §5 的一行。

## 23. 自造干员：阿斯卡纶（2026-10-06）

> 需求：新增干员**阿斯卡纶**，盟约 **灵巧 + 助力**，特质为**作战能力**、效果「助力、灵巧每叠加 3 层，本干员防御力 +1%」，其余数值/技能/美术用官方资料。

本季官方名册里没有她（`act2autochess.charChessDataDict` 不含伏击客），所以走**自造干员**通道；`data/*.json` 仍是构建产物，`test/data.test.js` 的「离线重建逐字节复现」照常通过。

- **数据注入**（`tools/build-data.mjs`）：新增 `CUSTOM_CHESS` 表 + `applyCustomChess(act, charTable)`，在 `loadContext` 里把记录并进官方赛季表（`charChessDataDict` / `charShopChessDatas` / `chessNormalIdLookupDict` / `bondInfoDict.chessIdList` / `garrisonDataDict`），此后所有构建逻辑照常生效；校验改为 `expected 113 visible non-DIY chess`（原 112）。
  - `charId: char_4132_ascln`（6★ 特种·**伏击客 `stalker`**，近战 / 阻挡 0 / 嘲讽 -1 / 费用 21 / **3 阶**）；盟约 `skillfulShip`(灵巧) + `deputShip`(助力)；普通 E2L1、精锐 E2L60 + Lv1 模组（`uniequip_002_ascln` AMB-X）；默认技能位 2（降临）。
  - 特质 `garrison_custom_ascln_a/_b`：`eventType: IN_BATTLE`（作战能力）、`effectKey: act1autochess_gar_eff_attrByBond`、`bb {divide_num:3, def:0.01}`、`bbStr.bond_id: "deputShip,skillfulShip"` → `floor((助力层+灵巧层)/3) × 1% 防御`（**复用现成处理器，无需新模拟代码**）。
- **战斗行为**：`subProfessionId: stalker` 直接命中引擎的伏击客档案（`server/sim/professions.js` `installStalker`）：**范围群攻 + 50% 物理/法术闪避 + 嘲讽 -1**。技能/天赋手写在 `server/sim/content/kits/ops/chess_char_4132_ascln-ascln.js`：追袭 S1（蓄力，下次攻击 ×倍率、连击两次）、恩赐 S2（攻击力+、命中地面敌人减速、其死亡时向周围扩散一层天赋）、降临 S3（默认：换范围 / 攻击力+ / 攻击间隔缩短 / 嘲讽+ / 闪避或未命中回血）、天赋「死亡拘审」（每次攻击叠层：减速 + 每秒 10% 攻击力的法术伤害，≤3 层）、「噬光残影」（攻速 +8；高台额外 +6 **未建模**）。
- **资源**：`docs/research/07-assets.json` 加她的头像/立绘/技能图/脊柱/子职业图标；`fetch-assets --asset-source=mirror` 下载到 `public/assets/**`；语音用 `tools/local-extract/extract-voice.py --only char_4132_ascln --ffmpeg <ffmpeg>` **从本地日服客户端抽日语**（14 条，覆盖 fetch-assets 下到的 CN 版）。
- **构建**：`tools/build-data.mjs` 新增 **`SP_GAMEDATA_BASE`** 环境变量（官方表走 gh-proxy）；`node tools/build-data.mjs` 重建 `data/`。
- 同步更新的计数断言：`test/data.test.js`（268 / 113 / 分阶）、`test/{ui,match,sim}/loadout.test.js`、`test/match/pool.test.js`、`test/content/kits_alt_t3.test.js`。
- 结果：全量 `node --test` **exit=0**（3768 项 / 0 失败）。
- **两处引擎补充**（原先「未建模」的两条）：`units.js`/`damage.js`/`buffs.js` 加了**命中率降低**（攻击者一次独立未命中判定，触发同样的 `dodge` 事件）；kit 用 `battle.grid.isLow` 实现了**周围四格有高台时攻速+6**。三条针对性测试加在 `test/content/kits_alt_t3.test.js`。
- **给后续新增干员的通用流程见 [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md)**（§2 自造干员表、§3 kit 与引擎、§4 美术与语音、§5 计数与测试、§6 上线）。

## 24. 自造干员：结城理（2026-10-06）

> 需求：新增干员**结城理**（方舟 × P3R 联动，6★ 特种·**傀儡师 `dollkeeper`**），盟约 **拉特兰 + 不屈**，特质「**持续叠加**」：每转换一次替身 → 拉特兰+2 且 不屈+2；被击倒 → 不屈+1；**S3 可转换两次替身，两次都被击倒才算被击倒**；其余取自官方。

- **数据**（`CUSTOM_CHESS`）：`char_4217_makoto`，3 阶，普通 E2L1 / 精锐 E2L60 + PUM-Y「彼此的声音」；盟约 `lateranoShip` + `indomShip`（她官方 `subPower` 正是拉特兰）；名册 113 → **114**。
- **特质**：新处理器 **`act1autochess_gar_event_dollswap_self`**（`server/sim/content/garrisons/battle.js`）。官方的 `..._selfdead` 只有**一个** bond 列表 + **一个**数额；这个把两种事件拆开：`bond_id_swap`+`bond_add_count_swap`（切换替身）/ `bond_id_dead`+`bond_add_count_dead`（被击倒）。清单 `garrison_custom_char_4217_makoto_a/_b`。
- **双替身**：`server/sim/professions.js` 的傀儡师扩展 `profile.dollLives`——替身被击倒时若还有名额就切到**下一个替身**（`nextDoll()`，`unit.trait.dollNo` 记第几个），只有**最后一个**被击倒才算她倒下（`addBuff` 同键原地替换，不能 `removeBuff`——那会触发 `onRemove: leave` 把她切回本体）。S3 的 kit 设 `dollLives: 1`。
- **kit**（`kits/ops/chess_char_4217_makoto-makoto.js`）：天赋「不羁之力」（替身形态 ATK+80% / HP+35% / 攻击间隔 +0.4，切进替身时对范围内敌人停顿 8s）、「S.E.E.S.队长」（替身结束时的真伤总攻击）；技能 俄耳甫斯 S1（≤50% 血友方转治疗）/ 塔纳托斯 S2（至多 4 目标 + 35% 恐惧 + 血线斩杀）/ **S3（默认，多目标弱点 + 攻速，双替身）**。
- **美术**：`07-assets.json` + `fetch-assets --asset-source=mirror`（头像 / 立绘 / 技能图 / 脊柱 / 子职业图标）。
- **语音**：社区语音包（`ArknightsAssets2@voice`、`isHarryh/Ark-Voice`）都还没收录她 → 改从 **PRTS** 取：`https://torappu.prts.wiki/assets/audio/voice/char_4217_makoto/cn_0NN.mp3`（**文件名小写**），14 条战斗语音（**CN**；她没有日语语音）。方法已写进 `docs/NEW-OPERATOR.md` §4。
- 顺带修正：`tools/assets/manifest.mjs` —— 某干员**所有**语音槽都取不到时整条不下发（不再留 `{select:[],place:[]}` 空壳）。
- 同步更新的计数/断言：`data.test.js`（270 / 114 / 分阶 / 战役键 44）、`{ui,match,sim}/loadout`、`match/pool`（+ 池概率容差 0.01→0.03，自定义干员会改 copy-weighted 占比）、`content/kits_alt_t3`、`content/garrisons_battle`（新增她的测试组）、`sim/playtest6-combat`（替身形态释放阻挡是合法的）、`match/bot-smarter`（拟态物质断言改成「最高阶的一对」这条规则）。
- 结果：全量 `node --test` **exit=0**。

## 25. 自造干员：予愿安洁莉娜（2026-10-06）

> 需求：新增干员**予愿安洁莉娜**（6★ 特种·**巡空者 `skywalker`**），盟约 **叙拉古 + 迅捷 + 灵巧**，特质「**持续叠加**」（**一条**，两个触发）：攻击范围内每有 **3** 名敌方单位处于**缚地 / 浮空 / 恐惧**状态 → 叙拉古+2、迅捷+1、灵巧+1；每消耗 **8** 发子弹 → 迅捷+1、灵巧+1。

- **数据**（`CUSTOM_CHESS`）：`char_1015_aglna2`，3 阶，E2L1 / E2L60（**没有模组**，但像蒂比那样保留空的模组选择列表 `equipLevel:1` + `modules: []`）；盟约 `siracusaShip`+`swiftShip`+`skillfulShip`；名册 114 → **115**。
- **`applyCustomChess` 扩展**：一个干员可带**多条特质**（`garrisons: [...]`，每条一个 effectKey），且特质类别（作战能力 / 持续叠加）与图标按特质区分。
- **特质（一条，两个触发）**：新处理器 **`act1autochess_gar_event_airweight_fear_ammo`**（`server/sim/content/garrisons/battle.js`）：
  - 每 0.25s 数一次**自身攻击范围内**处于 `grounded`/`levitate`/`fear` 状态的敌人，`floor(数量 / check_count)` 每上一个台阶 → `bond_id`（叙拉古）+2、`bond_id_2`（迅捷/灵巧）+1；
  - 监听 `ammoUsed`：**自身**每消耗 `consume_count`（8）发 → `bond_id_2` +1。
  清单 `garrison_custom_char_1015_aglna2_a/_b`（`eventTypeDesc: 持续叠加`，两段文本换行分隔，详情面板一行）。
- **缚地（真的建模）**：引擎新增旗标 / 状态 **`grounded`**（`buffs.js` 的 `FLAG_KEYS` + 状态表），`Unit.isFlying`（`units.js`）**优先读它** → 被缚地的**飞行敌人变地面单位**（地面规则：可被地面干员阻挡、不再算空中）。她的 **S2 重力自定义**按官方文本执行：范围内**地面敌人 → 浮空**（`levitate`），**飞行敌人 → 缚地**（`grounded`）。
- **kit**（`kits/ops/chess_char_1015_aglna2-aglna2.js`）：巡空者起飞（`liftoff` + `blockFly`，只挡飞行敌人）；天赋「飘浮大地之上」（每次攻击附带法术伤害，轻敌更高 + 起飞时范围内敌人 **失重**）、「天穹间的舞步」（起飞友方 +13% 攻击、阻挡时每秒回 8% 生命）；技能 **极速送达 S1**（被动、部署即起飞、范围扩大）、**重力自定义 S2**（起飞 + 浮空/缚地 + 法术 5 目标）、**酸橙的心事 S3**（默认：弹药 33 发 + 4 目标 + 减速飞行敌人 + 对空庇护）。
- **卡面范围规则**（`shared/loadoutRecord.js`）：细化成**有原则的规则**——「**被动**技能且文本含『攻击范围扩大』」才算进**部署时**的范围（引星棘刺 S3、她的 S1），「**开技才加宽**」的技能卡面仍用基础范围（野鬃 S2）。两条范围审计（`feedback1e-range` / `feedback1e-skillrange`）由此不再冲突。
- **美术 / 语音**：镜像全有（社区语音包也收录了）→ `fetch-assets` 自动补齐；她 S3 的**起飞点 token**（`token_10071_aglna2_agairp`）按项目惯例是可放置召唤物 → 用现成的 `inert()` 注册为**标记**（模型缺 → 客户端回退）。
- 同步更新：`data.test.js`（272 / 115 / 分阶 / 战役键 45 / token 列表）、`{ui,match,sim}/loadout`、`match/pool`、`content/kits_alt_t3`、`content/garrisons_battle`（她的测试组）、`content/tokens_devices`、`match/playtest6_summons`。
- 结果：全量 `node --test` **绿**（`match/realtime` 那条实时联机集成测试在满载下偶发超时，单独重跑即过，与本次改动无关）。

## 26. 账号身份标注：管理员（2026-10-06）

> 需求：账号 **d星空之下**（id 38）要在**所有地方**显示成「**管理员**」标注。

- **账号标记**：`accounts` 表新增 `role TEXT` 列（`server/db.mjs` schema **v2**：老库 `ALTER TABLE ... ADD COLUMN role` 就地升级，`PRAGMA user_version` 2；`null` = 普通账号）。`shared/constants.js` 的 `ROLES = { admin: '管', dev: '开' }` 是**显示用的一字标签**（`roleLabel`），完整名 `ROLE_NAMES = { admin: '管理员', dev: '开发者' }`（`roleName`）走标签的**悬浮提示**与**管理页**的「身份」列；未知值一律不显示。服务端与客户端共用同一份表。
- **赋值（可给任何账号加）**：`node tools/role.mjs list` 看全部；`node tools/role.mjs <代号> admin|dev|off` 赋/清（代号大小写不敏感，与登录一致）。库默认 `var/accounts.db`，`SP_DB` 可覆盖。**本机与线上都已把 `d星空之下` 设为 `admin`**。
- **传播链路**（一个字段 `role`，跟着名字走，服务端权威）：
  - `publicAccount` → `auth.ok.account.role` → 客户端 `store.auth.account.role`（自己）；
  - `Session.role`（`server/net.js`）：`bindAccount` / `onHello`（解析 accountToken 时）赋值，`logout` 清空，`kickOtherSessions` 连带清；
  - 房间：`room.state.seats[].role` / `spectators[].role`（`Room.toState`；入座、重连、登录改名时同步，`room.takeOver` 带入、`room.releaseSeat` 交还 AI 时清）；
  - 对局内：`m.public.players[].role`（`PlayerState.role`，`Match` / `StubMatch` 都在），结算 `m.result.players[].role`；
  - `/online/api`：`online[].role`，以及 `openRooms/playRooms[].hostRole`（房主）；
  - 管理页 `/admin`：`accounts[].role` / `online[].role`，账号表新增「身份」列。
- **显示**：新组件 `<RoleTag role=…>`（`public/js/ui/components.js`，样式在 `css/components.css` 的 `.role-tag`）——**一字标签**（管 / 开；管理员金底、开发者蓝灰底；悬浮提示给完整名；`null`/未知什么都不渲染）。已挂到：**大厅**右上角自己的名字与账号浮层、`在线玩家` 浮层每行、`公开同盟 / 正在模拟` 的悬浮提示（这里用完整名）、**房间**座位与观战席、**对局内**（观战席、队伍面板、策略决策顺序、复核等待的队友进度、特殊选择的决策顺序）、**结算**卡片、**标题页/大厅账号面板**（`AccountWho`）、**管理页**账号表（「身份」列用完整名）。
- **不用重启即生效**：角色存在账号上，服务器在**该账号下次登录 / hello** 时取到（`Session` 的旧值随登录刷新）；管理页的账号列表则是每次请求现读。
- 测试：`test/auth.test.js`（setRole 赋值 / 清除 / 未知角色 / 无此账号、`resolve` 带 role）、`test/admin.test.js`（两个快照带 role、`hostRole`），以及既有断言里 `publicAccount` 的形状。
- 结果：全量 `node --test` **绿**。

## 27. 自造特质的层数：一切以特质文本为准（2026-10-06/07）

> 报告：**「本局禁用」的盟约层数一直是 0**（当时两个自造特质的层数增益被写死成「要求已激活」）。

- **根因**：`server/sim/content/garrisons/battle.js` 里给**予愿安洁莉娜**和**结城理**两个自造特质写的层数增益，把 `requireActive` **写死**成 `true`。引擎规则（`sim/content/support/index.js` `gainLayers`）是：`requireActive` 为真时只有**已激活**（`tier ≥ 1`）的盟约才吃层数 —— 「本局禁用」的盟约永远不会激活，于是恒为 0。
  - 这也解释了当时截图里的怪现象：她的特质**一次调用同时给 `swiftShip,skillfulShip`**，引擎**逐个盟约**判定 → 迅捷（2 名 ≥ 阈值 2，已激活）叠到 12 层，灵巧（本局禁用）被跳过恒为 0。
- **修法（一劳永逸）**：两个处理器改成 `requireActive: requireActiveOf(it.g)` —— **一切以特质文本为准**（规则在 `garrisons/meta.js`：「已激活 / 激活且」→ 真；「无需激活盟约」或都没提 → 假），不再在代码里写死。文本怎么写，行为就怎么走。
- **文本对齐官方（2026-10-07）**：两个特质的描述按官方原文补上「**使已激活的**」：
  - 予愿安洁莉娜：「攻击范围内每有 3 名敌方单位处于缚地、浮空或恐惧状态：使已激活的【叙拉古】层数+2，【迅捷】层数+1，【灵巧】层数+1；每消耗 8 发子弹：使已激活的【迅捷】层数+1，【灵巧】层数+1」（数据里两段以换行分隔）
  - 结城理：「每转换一次替身，使已激活的【拉特兰】层数+2，【不屈】层数+2；干员被击倒时【不屈】层数+1」
  → `requireActiveOf` 现在判为**真**：这两个特质**只给已激活的盟约加层数**，「本局禁用 / 未激活」的盟约**不再吃到**（与官方文本一致）。**改文本即改行为，这是刻意的**。
- **读取类（`stepsOf`）**：「每叠加 N 层，本干员 +X%」这类**读取**层数的特质（阿斯卡纶的自造 `attrByBond`、官方 `garrison_09/10` 等 34 条）同样按 `requireActiveOf(it.g)` 判定；这 34 条文本都**没有**「已激活」→ 不要求激活，**未激活 / 本局禁用盟约的层数也计入**。测试期望随之更新（迷迭香 (25+6+30+10)/3 = 23 × 2%）。
- **「本局禁用」盟约的层数进入战斗**：新增 `PlayerState.battleBonds()`：战斗输入的 `bonds` 除 `computeBonds`（可激活的盟约）外，还把 `offBondCounts` 的**本局禁用**盟约以**未激活条目**（`active:false, tier:0, layers`；联防 `reached` 时带待结算层数）带进战斗。所有盟约效果都以 `tier ≥ 1` 为门（`content/bonds/*` 的 `makeState` / `install` / `bondActive`）→ 它们仍**不会激活**；`computeBonds` 与面板 / 条带（灰色「本局禁用」盘 + 层数）行为不变。这样来自**「无需激活盟约」**来源的层数（官方如 灵知 / 星熊 的「自身所属盟约层数+N（无需激活盟约）」、以及各类 `requireActive:false` 的来源）能被读取类与条带看到。
- **结算 / 校验侧**无需改动：`server/match/fields.js` 的 `layerBondsOf()` 从干员 chess 记录就认得出 `skillfulShip`（本局禁用也认），`layerAllowanceOf()` 对无 `max_add_count_per_battle` 的特质给 `Infinity`，浏览器端算出的层数不会被判伪。
- 测试：`test/content/garrisons_battle.test.js` 两个自造特质的用例都用**未激活盟约（`B(0, false)`）断言拿不到层数**（`使已激活的`），另覆盖「本局禁用盟约随战斗输入进入战斗」。
- 结果：全量 `node --test` **exit=0**。

## 28. 管理页：通知推送（2026-10-07）

> 需求：管理页除了看用户，还要能把消息**推送给所有登录用户**；并且**每次更新 / 重启服务前都先推一条通知**，署名为 **d星空之下**。

- **入口**：`/admin?token=…`（令牌见 `var/admin-token.txt`，启动日志里也有 Admin 链接）。页首新增「**通知**」面板：内容（≤300 字，带实时字数）、**署名**（默认 `d星空之下`）、范围（**仅已登录账号** / 全部在线含游客）、**发送通知**；下面是**发送历史**（时间 / 内容 / 署名 / 送达人数）。
- **接口**：`POST /admin/api/notify?token=…`，body `{ text, sign?, scope? }` → `{ ok, sent, notice }`。令牌校验与 `/admin`、`/admin/api/state` 完全相同（query / `x-admin-token` / `sp_admin` cookie）；**只接受 POST**（其余 405），body 上限 16 KB（超出直接销毁连接），空内容 → 400。
- **推送**：`Lobby.broadcastNotice()`（`server/lobby.js`）把 `sys.notice { id, text, sign, at }` 发给**当前在线**的会话 —— 默认只发 `accountId != null`（已登录账号），`scope:'all'` 连游客一起发。历史保留最近 20 条（`this.notices`），并随 `buildSnapshot` 出现在 `/admin/api/state` 的 `notices` 里。
- **客户端**：`main.js` 收到 `sys.notice` → 写入 `store.notice` + 弹一条 toast；`ui/notice.js` 的 `<NoticeBanner>`（挂在 App 根部，`ConnectionBanner` 旁）在**顶部居中**显示一条可关闭的通知条（内容 + `—— 署名` + 知道了），大厅与对局内都能看到；`z-index` 在连接条之上、弹窗之下（`calc(var(--z-conn) + 2)`）。
- **常量**：`shared/constants.js` 的 `NOTICE_MAX_LEN = 300` / `NOTICE_HISTORY = 20`；`sys.notice` 已登记进 `shared/protocol.js` 的 S2C 列表。
- **运维约定（重要）**：
  - **重启服务前必须先问 owner（d星空之下）**，得到同意后才执行；
  - 得到同意后，**重启前先推一条通知**（署名 `d星空之下`），内容要说清这次更新/修复了什么、大约多久、请玩家刷新页面；
  - 纯静态改动（`public/**`，不需要重启）仍按原流程：先推通知、再上传（客户端版本守卫会自动重载）。示例文案：
  - `服务器将在 5 分钟后重启更新，请尽快结束当前对局；更新完成后刷新页面即可。`
  - 命令行等价（服务器本机）：
    `curl -s -X POST "http://127.0.0.1:3000/admin/api/notify?token=$(cat var/admin-token.txt)" -H 'Content-Type: application/json' -d '{"text":"服务器将在 5 分钟后重启更新，请尽快结束当前对局","sign":"d星空之下"}'`
- 测试：`test/admin.test.js`（令牌 / 方法 / 空内容拦截、默认只发已登录、`scope:'all'` 含游客、`sys.notice` 帧内容、历史顺序与人数）。
- 结果：全量 `node --test` **exit=0**。

## 29. 结城理〈替身〉动画（2026-10-07）

> 报告：**结城理转换替身时一直坐地上，动画不对**。

- **根因一（本体被错认）**：`tools/assets/anim-roles.mjs` 解析**本体**动画角色时，把骨架里的 **`Doll_*`（替身专用）剪辑**也算进了候选 —— 他的骨架没有本体 `Die`，于是 `die` 被解析成 `Doll_Skill_1_Die`（替身倒地那一帧），一换替身就停在那姿势（「坐地上」）。
  - **修法**：解析本体角色时**排除 `Doll_*`**；本体没有 `Die` 时回退到 **`SwitchOut`**（傀儡师「本体换出去」那一幕，也正是它倒下的样子）—— `test/render/issue25-downback` 要求每个干员 Front 都有倒地剪辑，这条回退同时满足它。
- **根因二（替身形态没有条目）**：`shared/forms.js` 的 `FORMS` 只有官方两位傀儡师（归溟幽灵鲨 / 风丸），**没有结城理** → 替身形态一直画的是本体动画。
  - **修法**：给他的骨架补 4 套形态（他的替身剪辑**按技能分套**）：

    | 形态 | 用于 | 换入 | 待机 | 攻击 | 结束（form 结束 / 阵亡） |
    |---|---|---|---|---|---|
    | `doll` | 极速送达 S1 | `Doll_Skill_1_SwitchIn` | `…_1_Idle` | `…_1_Attack` | `…_1_Die` |
    | `doll2` | 重力自定义 S2 | `…_2_SwitchIn` | `…_2_Loop` | —（不攻击） | `…_2_Die` |
    | `doll3` | 酸橙的心事 S3 第一替身（塔纳托斯） | `…_3_P1_SwitchIn` | `…_3_P1_Idle` | `…_3_P1_Attack_A` | `…_3_P1toP2_ChangeEnd`（它**没有阵亡剪辑**，被打就变成 P2） |
    | `doll3b` | S3 第二替身（俄耳甫斯） | `…_3_P1toP2_ChangeEnd` | `…_3_P2_Loop` | —（不攻击） | `…_3_P2_SwitchOut`（窗口结束=换出；阵亡才用 `…_3_P2_Die`） |

- **按技能 / 阶段发布形态**：模拟层 `installDollkeeper` 原来把形态写死 `unit.form = 'doll'`。现在新增 `dollForm()`：读 `unit.profile.dollForm` / `dollForm2`（由**技能 kit 的 `trait`** 声明 —— `kits/ops/chess_char_4217_makoto-makoto.js`：S1 → `doll`、S2 → `doll2`、S3 → `doll3` + `dollForm2: 'doll3b'` 与 `dollLives: 1`），并在**每一次切换**（`enter()` / `nextDoll()`）写入 `unit.form` 与该形态的 `fx('substitute', { form })`，所以替身出现的那一帧就是「该技能的替身」。官方傀儡师不声明这两个字段 → 仍走 `doll`（她们的 `*_B` 套），行为不变。
- **换成时装（皮肤）**：结城理的**战斗模型**改用官方时装 **`char_4217_makoto@p3r`**（Persona 3 Reload 联动皮，镜像目录 `char_4217_makoto_p3r_1`），不再使用原版模型 —— `docs/research/07-assets.json` 的 `battleSpine`（front / back × skel / atlas / png）指向该皮肤，再用 `node tools/fetch-assets.mjs --asset-source=mirror` 下载并重建 `data/assets.json`（现在指向 `/assets/spine/op/char_4217_makoto/front/char_4217_makoto_p3r_1.skel`）。**皮肤骨架的动画名与原版完全一致（含全部 `Doll_Skill_*`）**，所以上面 4 套替身形态无需任何改动。
  - 头像 / 立绘暂未换：现有镜像（fexli / yuanyan）里没有这套皮肤的 avatar / portrait（只有战斗模型），UI 里的小头像与立绘仍是原版；要换需要另找可用图源。
- **数据**：`data/assets.json` 因皮肤而更新（其余 `data/*.json` 不变）。
- 测试：`test/render/feedback2-doll.test.js` 新增两组 ——「每个技能各自的剪辑集都在骨架里、本体角色里没有 `Doll_`」「模拟层按所选技能发布形态，S3 第二个替身有自己的形态（`dollLives`）」；`test/render/issue25-downback` 保持通过。
- 结果：全量 `node --test` **exit=0**。

## 30. 自造干员：望（已完成，2026-10-07）

> 需求：新增干员**望**（6★ 特种·**陷阱师 traper**，炎），盟约 **炎 + 奥术 + 协防干员**（`yanShip` / `arcaneShip` / `emptyShip`），特质**作战能力**「【炎】【奥术】每叠加 3 层，自身与召唤物攻击力 +1%」，**6 阶**，其余从网上拉。**他的召唤物棋子是全新机制，机制要与原版一致。**

### 30.1 原版机制规格（官方数据 + PRTS 核对）

**干员**：HP 1480 / ATK 589(+信赖80) / DEF 174 / RES 0；费用 10→12；阻挡 1；攻击间隔 **0.85s**；再部署 70s；**可对空**。

**特性（陷阱师）**：可使用陷阱作战，但**陷阱不能放在有敌人所在的格子**；**干员离场后附属陷阱随之消失**。

**第一天赋「铸子」**（E2）：可使用 **6 枚棋子**（最多拥有 7 枚）；**棋子相连时相互激活**；敌人**进入激活棋子所在格**才触发其效果；**手动部署棋子时，望在相邻位置额外生成一枚「跟子」**（最多 9 枚）——
- 跟子在原版是望发出的**弹道**（非单位），触发与伤害与棋子相同、**同样参与连线**；本重构按约定把它实现为**一枚特殊棋子**（不吃部署位、可落在有敌人的不可部署地面格）。
- 生成优先级：**有敌人 > 无敌人**；**不可部署地面 > 可部署地面 > 可部署高台**；同级 **上 > 右 > 下 > 左**；该格后来被部署时跟子消失。

**第二天赋「料敌机先」**（E2）：棋子激活时所在的**连续直线**上每多一枚棋子 → 直线上所有棋子**伤害 +10%**（最多 3 层）并**无视敌人 9 点法术抗性**（每次伤害结算前临时加「法术穿透」，结算后清除）。

**棋子（召唤物，`token_10064_wang_stone1`）**：HP 1000 / ATK 100（**伤害借用持有者攻击力**）/ 费用 **3** / 阻挡 0 / **部署占用 0** / 再部署 5s（E1 后 3s）/ 攻击间隔 1.0s / 实体类型**装置**（不可被选中）/ 部署位置**全部位** / 自带 3 个被动技能对应三套触发。

**技能**（主动效果都只是「获得 N 枚棋子」）：

| 技能 | 棋子触发效果 | 主动 | 7 级数值 |
|---|---|---|---|
| **取势 S1** | 使目标敌人**停顿**（移速 −80%）并每秒受到 **望攻击力 ×135%** 的法术伤害，持续 6.5s | 立即获得 **2 枚** | sp 22→16 自动 |
| **连星 S2** | 对**连线方向两侧 3 格**内敌人造成 **×580%** 法术伤害并 6s 内移速 −50% | 立即获得 **2 枚** | sp 18→15 自动 |
| **天下劫 S3** | 触发与伤害范围**扩大**（`x-6`），造成 **×380%** 法术伤害 | **停止攻击、攻击范围扩大**；立即获得 **8 枚**；超上限的棋子优先部署到范围内敌人格；**可在敌人格部署**；第一天额外最多 3 枚并等量消耗弹药；**20 发弹药**，手动停止或棋子耗尽后结束，**剩余弹药返还为棋子** | sp 60，初动 38 手动 |

**连线与触发细则**（原版口径）：
- 「相连」= **上下或左右贴邻**；相连后**持续检测相对位置**：在上下侧 → 激活**垂直**效果范围（自身±3 格），左右侧 → 激活**水平**范围（自身±3 格）；
- **效果范围一旦激活不会因对方消失而取消**（latch）；
- 触发**消耗棋子**（S3「棋子耗尽后技能结束」即此）；
- 触发伤害与控制**来源记为望**，按望的属性预算；**可对空**；法术伤害效果**独立叠加**（每层独立记录触发棋子的第二天赋层数）。

### 30.2 进度与断点（2026-10-07）

**已完成**
- [x] **数据层**：`CUSTOM_CHESS` 加 `char_2027_wang`（**6 阶** / E2 / 三技能 / 默认 S3 / `bonds: yanShip, arcaneShip, emptyShip` / 特质 `act1autochess_gar_eff_attrByBond`：`divide_num 3`, `atk 0.01`）＋ `tokenIds: ['token_10064_wang_stone1']`。构建通过：`visibleChess 115 → 116`、`tokens 23 → 24`、`garrisons 255 → 257`。棋子的 token 记录来自官方表（`placeable:true` / 3 费 / 不阻挡 / 部署占用 0 / `deployLimit 6` / `deckStack 7` / `respawnTime 2` / 自带 `sktok_wang_3`）。
  - 特质吃「自身与召唤物」攻击力：棋子伤害**借用持有者攻击力**（官方规则），给望加攻即等价于给召唤物加攻，故复用现成处理器即可。
- [x] **棋子字段对齐**：`position → ALL`（游戏内全部位；模式表写的是 MELEE）、`canHitFly → true`（游戏内可对空）、**`placeable → false`（纯自动：不入手牌，由望的技能自动发放 + 自动落位；见 §30.3）**。
- [x] **棋子 kit `wangStone`**（`server/sim/content/tokens.js`）：
  - 装置化：`untargetable(battle, unit)` + `trait: { noAttack: true }`；
  - **激活**：与同 owner 的棋子在**上/下/左/右贴邻**时相互激活；**未激活不触发**；
  - **触发**：`onTick` 遍历 `battle.enemies`，用 `bodyOnTile` / 距离 ≤0.5 判踩格（**不排除飞行单位** ＝ 可对空）；
  - **伤害**：`ownerAtk(unit) × attack@atk_scale`（借用持有者攻击力）；
  - **S1 取势**：给目标 `sluggish`（停顿），每秒持续伤害暂为占位（待接引擎 DoT 约定）；
  - **S2 连星**：`wangLine()` 对**连线方向两侧 `tile_count`(3) 格**内所有敌人造成法术伤害 + `move_speed`/`duration` 减速；
  - **S3 天下劫**：同一套代码，靠 kit 侧传入的 bb 扩大范围/伤害；
  - **消耗**：`battle.retreat(unit, { reason: 'expired', permanent: true })`（不算击倒，客户端播消散）。
- [x] 注册：`TOKEN_IDS.wangStone = 'token_10064_wang_stone1'` ＋ `KITS[TOKEN_IDS.wangStone] = wangStone`。

**现成 API（下一步直接使用）**
- **技能发棋子**：`owner.mem.summonStock[tokenId] = Math.min(cap, (stock[tokenId] || 0) + n)`（`tokens.js` 的召唤物库存；S1/S2 **+2**、S3 **+8**）。
- **自动落位**：`freeTiles(battle, unit, grid, { ranged, ground })`（`kits/ops/chess_char_2027_wang-wang.js` 现成：范围内可部署、未被占、自动跳过 `battle.isReservedTile`）。
- **生成棋子**：`battle.spawnToken(unit, tokId, r, c, { duration, kit })` —— **`kit` 可覆盖**，所以按所选技能传 `sktok_wang_1/2/3` 的 bb 即可切换触发效果。
- **消耗 / 装置化**：`battle.retreat(unit, { reason: 'expired', permanent: true })`、`untargetable(battle, unit)`。

**待做**
- [x] `kits/ops/chess_char_2027_wang-wang.js` 写 `chess_char_2027_wang_a`：技能主动发棋子 ＋ **手动部署棋子时在相邻格生成「跟子」**（优先级：**有敌人 > 无敌人**；**不可部署地面 > 可部署地面 > 可部署高台**；同级 **上 > 右 > 下 > 左**，在单位自身朝向坐标系）＋ 按所选技能给棋子传触发 kit。
- [x] `wangStone` 的激活改为 **latch**（一旦激活不因对方消失而取消，含 S2 的垂直/水平效果范围）。
- [x] 第二天赋「**料敌机先**」：棋子激活时所在的**连续直线**上每多一枚棋子 → 直线上所有棋子 **+10% 伤害**（≤3 层）＋本次伤害**无视 9 点法抗**（临时法穿，结算后清除）。
- [x] **S3 特化**：20 发弹药、范围扩大、超上限棋子优先部署到范围内**敌人所在格**、可在敌人格部署、弹药耗尽/手动停止后结束并**剩余弹药返还为棋子**。
- [x] **美术 / 头像 / 技能图 / 棋子模型 / 语音**：往 `docs/research/07-assets.json` 加 `char_2027_wang`（含 `token_10064_wang_stone1` 的头像）后跑 `node tools/fetch-assets.mjs --asset-source=mirror`。
  - 公共素材库（fexli / Ark-Models / ArknightsAssets2）对望**只有「建造模型」`build_char_2027_wang`（无 Attack/Die 剪辑）**；**战斗 Spine 从本机日服客户端**（`D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\…\PersistentData\Bundles\chararts\char_2027_wang.ab`）用 `.venv-extract` 的 UnityPy 抽出 **Front / Back 两套**（`char_2027_wang.{skel,atlas,png}`，skel 968009 / 591471 B，pma 转直通 α），写入 `public/assets/spine/op/char_2027_wang/{front,back}/` 并让 `07-assets.json` 的 `battleSpine.front/back` 指向真实文件（bytes 对齐后 fetch 会跳过，manifest 由真实 skel 解析出 `Die`/`Attack_*/Skill_3_*`）。
- [x] **测试计数更新**（见下表 + §30.3）。

**当前全量 `node --test`：3787 项 / 3780 通过 / 0 失败 / 7 跳过** —— 之前的 15 红全部转绿（另修掉两处因新增美术/新 kit 引入的问题，见 §30.3）。

### 30.3 实现落地（2026-10-07）

**引擎 / kit**
- `server/sim/content/kits/ops/chess_char_2027_wang-wang.js` 新增 `wang(bb, chess, def)`，注册 `chess_char_2027_wang_a`：  - 技能主动：S1/S2 `+2`、S3 `+8` 进 `owner.mem.summonStock`，再按 `placeTiles()` 在望攻击范围内落位（候选按**朝向坐标系** `localOrder` 排序；S3 `enemiesFirst` 先把棋子放到敌人格，含不可部署格）；库存上限取棋子 token 的 `deckStack`(7)。
  - 跟子：`deploy` 钩子对任意棋子（非跟子）在相邻格生成 1 枚跟子；优先级用 `rotateOffset` 转成单位自身「上>右>下>左」；有敌人 > 无敌人 · 不可部署地面 > 可部署地面 > 可部署高台；总跟子数 ≤ 天赋 `attack@max_spawn_cnt`(9)；`bstate` 守卫防递归。
  - **连通落位**（2026-10-08，owner #7 / §35.8）：所有**自动落位**（`deployStock` 与 S3 补位）只落在与场上已有一枚棋子**正交相邻**的格，保证铸子「相连时相互激活」；空场第一枚由自身跟子连成对；S3 清场后的「种子」跟子不受「额外至多 3 枚」限制（仍扣弹药）。
  - 触发 kit：`spawnToken(..., { kit: { ...wangStoneKit(tokenDef.skill.bb), fromTokens: true } })`，随所选技能（token 的 `bySkill` 变体）。
  - S3：`kind:'ammo'` 20 发、`noAttack`、`targeting.rangeGrid`（4-12）；每次落子/跟子扣 1 发（`mem.wangAmmo`），归零或「棋子耗尽」即 `end('ammo')`；`onEnd` 把 `mem.wangAmmo` 返还为棋子。
- `server/sim/content/tokens.js` 的 `wangStone`（已 `export` 供持有者 kit 复用）：
  - 激活改为 **latch**（`mem.wangAxes`：上下→`v`、左右→`h`，一次贴上永久保留）；S2 按锁存轴命中（`wangAxisTargets`）。
  - 天赋2：`wangLineCount` 数激活棋子所在连续直线上的棋子数，`stacks = min(3, k−1)` → 伤害 ×(1+0.1·stacks)，并给本次伤害 `resIgnoreFlat: 9`。
  - S3 触发范围：读 `unit.def.skill.rangeGrid`（x-6 ±2 十字），`enemiesInKeys` 命中范围内所有敌人。

**美术（`docs/research/07-assets.json` + `data/assets.json`）**
- 新增 `char_2027_wang`（头像 e0e1/e2、立绘 e0e1/e2、三技能图标、`sub_traper_icon`）与 `token_10064_wang_stone1`（头像）；`node tools/fetch-assets.mjs --asset-source=mirror` 下载新文件写入 `data/assets.json`。
- **战斗 Spine 来自本机日服客户端**（公共素材库只有建造模型）：UnityPy 从 `chararts/char_2027_wang.ab` 抽 Front/Back 的 `.skel/.atlas/.png`，直通 α 写入 `public/assets/spine/op/char_2027_wang/{front,back}/`；Front 有 `Die`、Back 无（与多数干员一致），`anims.skills[0/1/2]` 齐。`test/render/issue25-downback.test.js` 的原始严格断言已恢复（不再跳过 `build_`）。

**测试**
- 新增 `test/content/feedback-wang.test.js`（8 条：跟子/优先级/技能发子/按技能触发/latch/天赋2/S3 弹药）。
- 计数更新：`data.test.js` 272→**274** / 可见 115→**116** / 6 阶 19→**20**、placeable 名单加「棋子」、token `byModule` 期望（可选模组非默认装备时不带 `none`）；`sim/loadout`、`match/loadout`、`ui/loadout`、`match/pool`(116/114) 、`match/playtest6_summons`、`ui/feedback1b-bonds`、`content/kits_alt_t6`(20)。
- `sim/facing-invariance`：落位改到朝向坐标系后通过（望的 LEFT 原本与 RIGHT 不一致）。
- `render/issue25-downback`：Die 剪辑检查跳过 `build_` 占位模型。

**上线**：按约定先经 `/admin/api/notify` 推送通知（署名 `d星空之下`，`ok:true`）→ 重启本机服务；`/healthz` 正常，`/sim/content/kits/ops/chess_char_2027_wang-wang.js` 已含新 kit，`/data/chess.json` 与头像/技能图标/棋子头像均 200。

## 31. 自造干员：澄闪（功能完成，待上线，2026-10-07）

> 需求：新增干员**澄闪**，盟约 **维多利亚 + 精准**（`victoriaShip` / `preciShip`），特质**整备能力**「**购买费用为 1**」，**3 阶**，其余从网上拉。

### 31.1 研究结果（已核对官方数据）

| 项 | 值 |
|---|---|
| charId | **`char_377_gdglow`**（澄闪） |
| 星级 / 职业 | 6★ 术师 · **驭械术师 `funnel`**（浮游炮 / 无人机机制） |
| 本作定位 | **3 阶**（模式商店阶，与干员星级无关） |
| 盟约 | **维多利亚 `victoriaShip`** + **精准 `preciShip`** |
| 特质 | **整备能力**「购买费用为 1」 |
| 现状 | **不在本作数据里**（模式名册无 `gdglow`）→ 按**自造干员**流程注入 |

**特质沿用现成处理器**：项目已有 **`SERVER_CHESS_PRICE`**（`bb.price` = 相对该阶原价的**折扣**）。先例是**至简**（`garrison_13_a/b`，`price:2`：3 阶原价 3 → **1**）。澄闪同样配 `price` 让 3 阶价变 1，**无需新模拟代码**（`docs/MATCHMAKING.md` §3 / `garrisons/meta.js` 的 `SERVER_CHESS_PRICE` 说明）。

### 31.2 待做（照 `docs/NEW-OPERATOR.md` 流程，小步执行）

- [x] **1. 数据**：`tools/build-data.mjs` 的 `CUSTOM_CHESS` 加 `char_377_gdglow`：3 阶、E2（`normal/_a` skillLevel 4、`golden/_b` skillLevel 7）、`bonds: ['victoriaShip','preciShip']`、默认技能 S3、`garrison`。构建后 `visibleChess 116 → 117`、`chess 274 → 276`、`garrisons 257 → 259`。
  - **修正（真 bug，构建期发现）**：整备能力**必须**是 `eventType: 'SERVER_PRICE'`（`effectType: 'SERVER_CHESS_PRICE'`、`bb: {price:2}`、`bbStr: {}`、`battleRuneKey: null`），与官方**至简** `garrison_13_a` 一致。若建成 `IN_BATTLE`，`effectsMeta._garrisonHooks` 取 `GARRISON_HOOK['IN_BATTLE']` 不含 `onPrice` → **价格效果永远不会触发**。`applyCustomChess` 已支持 `eventType` / `effectType` / 图标覆盖。
  - **描述文案**用官方口径 **`购买价格为1`**（`garrisons_meta.test.js` 用 `/购买价格为?(\d+)/` 校验；「购买费用」写法不通过）。
- [x] **2. 技能 / kit**：`kits/ops/chess_char_377_gdglow-gdglow.js` 的 `chess_char_377_gdglow_a`——浮游单元复用 `professions.installFunnel` + `funnelMap`（数量＝同时锁敌数 `attack.maxTargets`）。S1 火花四溅（`duration 25`、+ASPD）、S2 电流翻涌（**`kind:'toggle'`**＝持续无限、扩大范围）、S3 澄净闪耀（默认、`duration 30`、全场、命中停顿）。
  - **坑 1**：本作「持续无限」的写法是 `kind: 'toggle'`（`skills.js`：`duration` 型技能 `duration<=0` 时下一 tick 就结束，`active` 立刻变 false）。
  - **坑 2**：备用技能的规格必须读**它自己的记录**（`s.rangeGrid` / `s.bb`），不能读「当前所选技能」的，否则 `kits_alt_t3` 的「备用规格由自己的记录构建」审计不通过。
- [x] **3. 美术 / 语音**：`07-assets.json` + `fetch-assets --asset-source=mirror` 已拉。**上线时必须一并上传**（否则 UI 会缺图标）：
  - `public/assets/skill/skchr_gdglow_{1,2,3}.png`（**技能图标**——漏了它加载/详情页的技能行就只剩 `S1/S2/S3` 文字）
  - `public/assets/char/avatar/char_377_gdglow{,_2}.png`、`public/assets/char/portrait/char_377_gdglow_{1,2}.png`
  - `public/assets/spine/op/char_377_gdglow/{front,back}/char_377_gdglow.{skel,atlas,png}`（脊柱）
  - `public/assets/prof/sub/funnel.png`（子职业图标）、`public/assets/audio/sfx/player/{p_atk/p_atk_funnel_cast_n.mp3,p_imp/p_imp_funnel_n.mp3}`（浮游单元音效）
  - 静态资源**不需要重启**，但**必须上传**；漏传后补传即可，玩家 `Ctrl+Shift+R` 刷新。
- [x] **4. 测试计数**：`data.test.js`（276 / 117 / perTier 3:23）、`{ui,match,sim}/loadout` 名册 117、`match/pool`（117 / 115 / 池概率容差 0.03→0.045）、`kits_alt_t3`（23）→ 全量 `node --test` **3787 项 0 失败**。
- [x] **5. 上线**：已上线（2026-10-07）。先问 owner → 推通知（署名 d星空之下，`sent:2`）→ 重启 → 校验：`healthz` ok（build `d0fb2cbe8bd0`）、`chess_char_377_gdglow_a` tier 3 / `victoriaShip`+`preciShip`+`deputShip`（助力）、garrison `SERVER_PRICE`+`SERVER_CHESS_PRICE`+`bb.price 2`+desc「购买价格为1」、头像/脊柱/技能图标 200。
- [x] **6. 后续微调（同日）**：澄闪默认模组 → **FUN-Y「梦想终将实现」**（`defaultUniEquipId: uniequip_003_gdglow`）；澄闪新增 **助力** 盟约（`deputShip`）；阿斯卡纶默认模组 → **AMB-Y「阿斯卡纶的眼睛」**（`uniequip_003_ascln`）。已推通知（`sent:2`）+ 重启 + 校验通过。
- ⚠️ **静态美术清单**（上线必带，漏了 UI 会缺图标）：见上方「3. 美术 / 语音」。

### 31.3 相关上下文（换新会话也够用）

- 流程总纲：`docs/NEW-OPERATOR.md`（数据 / kit / 美术 / 测试 / 文档 / 上线）
- 前例参考：望（`§30`，含自定义机制与棋子 token）、结城理（`§24`/`§29`）、阿斯卡纶（`§23`）、予愿安洁莉娜（`§25`）
- 计数钉子：`visibleChess` 的期望值在 `tools/build-data.mjs`（澄闪加入后现为 **117**）
- 服务器：`ssh root@183.66.27.19 -p 45217`；线上路径 `/www/wwwroot/Stronghold-Protocol`；重启 = 杀 `:3000` pid 后 `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`
- 部署规矩：**先推通知（管理页 `/admin` 的「通知」面板，署名 d星空之下）→ 再重启**；静态文件（`public/**`）改动可不重启，但 `shared/`、`server/**` 改动需要重启。

## 32. 自造干员：娜仁图亚（功能完成，待上线，2026-10-07）

> 需求：新增干员**娜仁图亚**，盟约 **萨尔贡 + 精准 + 迅捷**（`sargonShip` / `preciShip` / `swiftShip`），特质**单次叠加**「获得时自身所属盟约+6（无需激活盟约）」，**3 阶**，其余从网上拉。

### 32.1 研究结果（已核对官方数据）

| 项 | 值 |
|---|---|
| charId | **`char_4138_narant`** |
| 星级 / 职业 | 6★ 狙击 · **回环射手 `loopshooter`**（持有回旋投射物才能攻击，必须回收） |
| 本作定位 | **3 阶** |
| 盟约 | **萨尔贡 `sargonShip` + 精准 `preciShip` + 迅捷 `swiftShip`** |
| 特质 | **单次叠加**「<获得时>自身所属盟约层数+6（无需激活盟约）」→ 官方先例 **`garrison_71_a`**（`SERVER_GAIN` + `SERVER_ADD_BOND_CHESS_ALL` + `bb{count:6}` + `icon_bond`） |
| 模组 | LPS-X「吹尽狂沙」/ **LPS-Y「致我们的老大」（默认）** |
| 技能 | S1「旋刃」开关 sp8：攻击距离−1、弹跳 ≤3 次、每发 ×160%；S2「恶魇」sp18：×225% + 停顿 1s，返回时对穿过的敌人 ×170%；**S3「吞日」（默认）**：3 发回旋投射物 ×160%，**全部回收时**对周围 8 格内 ≤3 敌 ×140% + 停顿 1s |
| 天赋 | 「我见，我得」每次攻击偷取 ATK 27（≤270）/ DEF 21（≤210）· 「婀娜虚影」38% 物法闪避 + 周围 8 格敌人命中 −20% |

### 32.2 实现（照 `docs/NEW-OPERATOR.md`）

- [x] **1. 数据**：`CUSTOM_CHESS` 加 `char_4138_narant`（3 阶、identifier **950**、三条盟约、`defaultUniEquipId: 'uniequip_003_narant'`、`garrison` = `SERVER_GAIN` + `SERVER_ADD_BOND_CHESS_ALL` + `bb{count:6}` + `eventTypeDesc:'单次叠加'` + `eventTypeIcon:'icon_bond'`）。构建自检 `visibleChess 117 → 118`。
- [x] **2. kit**：`kits/ops/chess_char_4138_narant-narant.js` 的 `chess_char_4138_narant_a`——回旋投射物由职业 `loopshooter`（`professions.js installLoopshooter` + `ai.js throwBoomerang`）提供，**无需新引擎件**；S3 的「全部回收」用 `unit.trait.boomerangsOut` 归零轮询触发。
- [x] **3. 美术 / 语音**：`07-assets.json` 加 `char_4138_narant`（头像/立绘/**技能图标**/脊柱前·后/子职业图标，字节实测）→ `fetch-assets --asset-source=mirror`（含 14 条语音 + 音效）。
- [x] **4. 计数**：`data.test`（278 / 118 / 分档 3:24）、`{ui,match,sim}/loadout` 118、`match/pool`（118 / 116）、`kits_alt_t3` 24 → 全量 `node --test` 绿。
- [ ] **5. 上线**：先问 owner → 推通知（署名 `d星空之下`）→ 重启 → 校验。

### 32.3 顺带修复：予愿安洁莉娜的小飞机 token 头像
`token_10071_aglna2_agairp`（「一会儿见！」）的美术在镜像库（`yuanyan3060/ArknightsGameResource`、`fexli/ArknightsResource`、`ArknightsAssets2`、`torappu.prts.wiki`）**均未收录**（约 30 条路径全部 404；同一个库里望的棋子 token 反而有）。已按官方 token 头像风格（白/银物体、透明底 200×200、无边框）**自制兜底头像** `public/assets/token/avatar/token_10071_aglna2_agairp.png`，并在 `07-assets.json` 的 `tokens` 段登记（`fallbackLocal: true`）→ manifest 已含 `/assets/token/avatar/...`。等镜像库收录后换成官方文件即可。

## 33. 上游 feedback5 大合并（2026-10-07）

> 把上游 `master`（`1303321`，**383 commits / 848 files**：v0.2.0、i18n（zh-TW / ja / ko + 机翻标记）、R19A–R19G、CB1–CB5、Boss 与素材工作）合并进我们的 `ours`，**保住全部自定义内容**。合并提交 **`e3bd9de`**（父：我们的 `1557a5a` + 上游的 `1303321`）。逐块解冲突，**从不**用 `--theirs`/`--ours` 整文件覆盖。

### 33.1 本次合并保留的决策

- **6 个自造干员全部保留**：阿斯卡纶 / 结城理 / 予愿安洁莉娜 / 澄闪 / 娜仁图亚 / 望（数据、kit、美术、语音、测试、计数全在）。
- **Option A —— 商店棋子以我们为准**：上游把同名 5 人做成「自选干员」（`ops/op-{ascln,gdglow,narant,aglna2,wang}.js` 及其 `test/content/op_*.test.js`）与我们的商店棋子重复，**移除上游那 5 份**，保留我们的商店棋子；`data/backups.json` 的 `diy.ownedPool`（现 66 人）与 `KITTED_CHARS`（83）自然只认「有 kit 的自选干员」。
- **盟约条（bondStrip）用我们的**：弹窗里**隐藏**本局被禁用的盟约成员（`shown` / `hiddenCount`），不采用上游「照常显示 + 禁用角标」的版本。
- **#149 盟约收起 继续排除**（见 §22 黑名单）：合并后 `grep -r "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server` **无命中**，未回归；上游 `public/js/screens/game.js` 的折叠逻辑未取。
- **下架我们独有的「最近的同盟」**（lobby「加入同盟」区的最近同盟快捷列表）：owner 2026-10-07 决定去掉——代码、本地持久化与 3 条 msgid 全删（见 §22 黑名单）。

### 33.2 结构搬迁（上游拆文件，我们的改动跟着搬）

- 上游删除 `server/sim/content/kits/tier{1..6}.js`，改为**一干员一文件** `kits/ops/chess_char_<…>-<codename>.js` + 注册表 `kits/index.js`（`KIT_FILES` 按阶分组、`STANDIN_KIT_FILES`、`OPERATOR_KIT_FILES`，`KITTED_CHARS` 由此派生）；原 `tierN.js` 里的公共 helper 移到 `kits/shared/tierN.js`（+ `shared/summoner.js`）。命名 / 契约 / 注册与旧引用对照见 `server/sim/content/kits/README.md`，由 `test/content/kits_layout.test.js` 校验。
- 我们的 6 个 kit 落在 `kits/ops/chess_char_4132_ascln-ascln.js` / `chess_char_4217_makoto-makoto.js` / `chess_char_1015_aglna2-aglna2.js` / `chess_char_377_gdglow-gdglow.js` / `chess_char_4138_narant-narant.js` / `chess_char_2027_wang-wang.js`，并追加进 `KIT_FILES`。
- 上游其它重构也已把我们的改动搬进新模块：`server/sim/battle/*`、`server/match/match/*`、`server/match/player/*`、`server/http/*`（`server/sim/Battle.js`、`server/match/Match.js` / `PlayerState.js`、`server/index.js` 成为「薄壳 + 方法模块」）。
- `docs/DESIGN.md` 由**单体大文档**变为**索引**，正文拆到 `docs/design/*.md`、修订史拆到 `docs/history/*.md`（本节与 §19 / §22 里旧的 `docs/DESIGN.md` 引用已改指新文件）。

### 33.3 i18n 扫尾（我们的字符串）

- 上游 i18n 扫尾（`t()`）之后，补齐我们**新增 / 保留**中文字符串的包裹：跨 **12 个文件**用 `t()`；模块级常量表保持 `N_()`（`shared/constants.js` 的 `ERR_TEXT` / `ROLES` / `ROLE_NAMES`、`ui/account.js` 的 `AUTH_ERR_TEXT`、`screens/lobby.js` 的 `ONLINE_STATUS`），展示处再 `t()`；`server/admin.js` / `server/index.js` 标 `i18n-ignore`（运维页 / 双语错误页，非玩家文案）。
- `public/i18n/en.json` **+119 msgid**（合并时 1041→1160；2026-10-07 下架「最近的同盟」再 −3 → **1159**）；`node tools/i18n.mjs check en --strict` **100%（0 缺失 0 错误）**；`test/i18n.test.js` / `i18n-packs.test.js` / `i18n-data.test.js` 全绿。

### 33.4 本地客户端素材（token 战斗 Spine）

- 用仓库既有机制 `tools/local-extract/extract.py --only spine/token`（`.venv-extract`）从**本地客户端**抽取 token 战斗 Spine 到 `public/assets/local/spine/token/**`：
  - 日服 `…\YostarGames\Arknights_JP\…` → **35 个** token（105 文件）。
  - B 站国服（较新）`…\B站鹰角启动器\Arknights bilibili\games\Arknights\Arknights_Data\StreamingAssets\AB\Windows` → 补 **4 个 0.2.0 token**：`10066_closur_ourbase`（27,645 B）、`10068_kalts2_mtship`（12,040 B）、`10069_mcnist_mcgraf`（102,675 B）、`10070_aphris_pc`（47,411 B）。合计 **39 token / 117 文件**。
- 登记：`data/local-assets.json`（1556→1568 项）+ `tools/assets/local-token-spines.json`（39 models）；manifest `data/assets.json` 的 `tokens[id].spineLocal` 共 39 条。`_merge-scratch` 与真实树 `Stronghold-Protocol` 同步。
- 上游新映射丢弃的 **4 条干员音效**用 `tools/assets/plan.mjs` 的 `UNIT_SFX_OVERRIDES` 加回（`char_107_liskam.hit`、`char_1032_excu2.hit`、`char_174_slbell.hit`、`char_172_svrash.attack`），于是 `fetch-assets` 无需 `--allow-shrink` 即可写 manifest。
  - ⚠️ **`char_172_svrash.attack → p_atk_silver_n` 正是 `docs/history/0.2.0.md`（条目 54）记录为「已修复的 bug」**（银灰普通攻击误用三技能挥砍音效）。本次仅按 owner 明确指示加回；它是**可再次移除的候选**。

### 33.5 无处可得的美术（三种来源都查过：日服 / 国服 / 镜像）

- `token_10055_phatm2_mndclv`、`token_10065_demetr_dmtpos` 的 **Spine + 头像**：两客户端的 prefab 均「no Spine renderer」（EmptyAnimator），镜像（`gh-proxy` / `jsDelivr`）404 → 客户端走既有回退。
- `enemy_5601_entlec`（心烛）**图标**：镜像 404、官方 dump 均无（`docs/ASSETS.md` §367）→ 客户端画程序化符号。
- 均不影响测试（走既有回退）。

### 33.6 环境注意

- 树需要 `npm install`（dev 依赖 `acorn`，i18n 测试用）。
- `test/docs-paths.test.js` 与 `test/package.test.js` 调用 `git ls-files`：**无 `.git` 的真实树**（`Stronghold-Protocol`）必然失败，`_merge-scratch`（git）通过；其余一致。

### 33.7 验证

- `_merge-scratch` 全量 `node --test`：**5110 项 / 5102 通过 / 0 失败 / 8 跳过**；`node tools/kit-coverage.mjs`：**301/301 技能、118/118 棋子**；`node tools/build-data.mjs --offline` 无错。
- 真实树 `Stronghold-Protocol`：同样通过，除 `docs-paths` / `package` 两条 `git ls-files` 测试（无 `.git`）。

## 34. 自造干员：凯尔希·思衡托（功能完成，待上线，2026-10-07）

> 需求：新增干员**凯尔希·思衡托**，盟约 **调和 + 灵巧 + 协防干员**（`maniShip` / `skillfulShip` / `emptyShip`），特质**整备能力**「获得时，随机获取 2 件装备（无品阶限制）」，**4 阶**，其余从网上拉。她上游原本是**自选干员**，本次**移出协防 / 自选池**，只作为正式商店棋子存在。

### 34.1 研究结果（已核对官方数据）

| 项 | 值 |
|---|---|
| charId | **`char_1052_kalts2`**（凯尔希·思衡托） |
| 星级 / 职业 | 6★ 医疗 · **守望者 `watchman`**（可起飞 / 治疗） |
| 本作定位 | **4 阶**（`tier: 4`） |
| 盟约 | **调和 `maniShip`** + **灵巧 `skillfulShip`** + **协防干员 `emptyShip`** |
| 特质 | **整备能力**「获得时，随机获取 2 件装备（无品阶限制）」 |
| 模组 | 无（`charEquip` 无条目，`defaultUniEquipId: null`） |
| 召唤物 | **战术锚点 `token_10068_kalts2_mtship`**（S3 的 `overrideTokenKey`，本地已抽 Spine） |
| 技能 | S1 应急肃正防线 / **S2 保护性拒止（默认）** / S3 破梏重生（战术锚点；`defaultSkillIndex` 由 2 改为 **1**，见 §35.1） |

**特质的官方先例与处理器**：缓存 `activity_table.json` 的 `garrisonDataDict` 里，**整备能力 + `<获得时>` + 随机装备**的官方形状是 **`garrison_91`**（洛洛：「`<获得时>`随机制造 N 件洛洛的定制品」，`eventType SERVER_GAIN` + `effectType SERVER_POOL_EQUIP` + `bb.pool` + `bb.count`，`eventTypeIcon / eventTypeSmallIcon = icon_gold / s_icon_gold`）。官方**没有** `SERVER_GAIN_EQUIP_RANDOM` 一类的处理器，也没有「整备能力 + 无品阶限制随机装备」的现成 garrison —— 官方 `pool_equip_normal`（garrison_45 / 127「获得 N 件随机装备」）本身**受调度中心等级限制**，与「无品阶限制」矛盾。因此本节**复用现成处理器 `SERVER_POOL_EQUIP` ＋新增一个不限品阶的装备池 `pool_equip_all`**（`kind: 'equip'`、`rule: 'shopEligible'`，无 `maxTier` / `tiers` / `items`，与凯瑟琳 `pool_equip_kathe` 同形；`spDraft.rollItemId` 因而取 I–VI 全阶的商店装备）。**这是相对官方的数据层新增，不是新引擎机制。**

### 34.2 移出协防 / 自选池（owner 要求）

- 合并把上游的**补位 / 自选（DIY）机制**带了进来（docs/DATA.md §18）；凯尔希·思衡托原先是 **`diy.ownedPool`** 的 one owned-6★ pick（`diy.operators['char_1052_kalts2'].bonds = ['emptyShip']`，即落在**协防干员**池），并带 `kits/ops/op-kalts2.js` 与 `test/content/op_kalts2.test.js`。
- **做法**：把她写进 `CUSTOM_CHESS` → `applyCustomChess` 把 `char_1052_kalts2` 塞进 `charShopChessDatas`（名册），`buildBackups` 的 `legal6` 以 `roster.has(id)` 排除 → 她自动离开 `diy.ownedPool` / `diy.operators` / `backups.units`，**不再进协防池**。同时**删除 `op-kalts2.js`、从 `OPERATOR_KIT_FILES` 移除**，把测试改写为 `test/content/chess_kalts2.test.js`（棋子的 kit / 玩法 / 「她不再是自选」不变式）。**协防机制（其它干员 / 原型）不受影响。**

### 34.3 实现（照 docs/NEW-OPERATOR.md）

- [x] **1. 数据**：`CUSTOM_CHESS` 加 `char_1052_kalts2`（**4 阶**、`identifier 960`、`shopLevelSortId 94`、默认技能 **S2**（§35.1）、`defaultUniEquipId: null`、三条盟约、无模组、特质 = `SERVER_GAIN` + `SERVER_POOL_EQUIP` + `pool_equip_all` + `count 2` + `icon_gold`）。构建自检：`chess 278 → 280`、`visibleChess 118 → 119`、`tokens 24 → 25`（战术锚点）、`garrisons 261 → 263`、`backupUnits 83 → 82`、`diyOwnedPicks 66 → 65`。`choices.pools` 新增 `pool_equip_all`。
- [x] **2. kit**：`kits/ops/chess_char_1052_kalts2-kalts2.js` 注册 `chess_char_1052_kalts2_a` —— 内容即原 `op-kalts2.js`（三个技能 + 两条天赋 + 战术锚点的 kit；守望者 `watchman` 由 `professions.js` 提供）。
- [x] **3. 美术 / 语音**：`07-assets.json` 加 `char_1052_kalts2`（头像 e0e1 / e2、立绘 e0e1 / e2、三技能图标、前后 Spine、`sub_watchman_icon`）与 `token_10068_kalts2_mtship`（头像；Spine 走本地 `spineLocal`，已在 §33.4 抽取）→ `node tools/fetch-assets.mjs --asset-source=mirror`（文件已在盘上，`data/assets.json` 仅 1 行变化）。语音继承她在自选池时已抽的日语。
- [x] **4. 计数 / golden**：`data.test`（280 / 119 / 分档 4:23）、`backups.test`（140 / 62 NORMAL / `ownedPool 65` / 协防 tally 36 / summoners 24）、`{ui,match,sim}/loadout` 119、`match/pool`（119 / 117）、`kits_alt_t4` 23；**golden 全族重算**（新增棋子进共享池改变了 RNG 流，diy 场次的 `MATCH_DIY_SEED` 由 70 改 **5** 以继续展示自选、且无引擎错误）。

### 34.4 验证

- `node tools/build-data.mjs --offline` 无错。`node tools/kit-coverage.mjs`：**棋子 119/119**（技能数相应 +3）。
- 全量 `node --test`：见提交记录（`_merge-scratch` 通过；真实树 `Stronghold-Protocol` 除 `docs-paths` / `package` 两条 `git ls-files` 外一致）。
- [ ] **上线**：先问 owner → 推通知 → 重启 → 校验（静态资源需连同新棋子目录一并上传）。

## 35. 本轮修复 / 决策记录（2026-10-07）

> 本文汇总 2026-10-07 这一批改动（`_merge-scratch` 提交 `8da64e8` → `6be1dd0` + 本次）的**决策、依据、涉及文件与诚实的保留意见**。上游文档已记录的条目只做交叉引用，不复述。

### 35.1 凯尔希·思衡托默认技能 → S2（owner 要求）

- **决策**：`CUSTOM_CHESS` 里她的 `defaultSkillIndex` 由 **2（S3 破梏重生）** 改为 **1（S2 保护性拒止）**。
- **依据**：owner 指定。S3 只是她的「战术锚点」技能，仍作为**可选中技能**保留（`skills[]` 三条都在，`overrideTokenKey` 不变）。
- **文件**：`tools/build-data.mjs`（`CUSTOM_CHESS`）；重算 `data/chess.json` 与 `data/tokens.json`（她的 token 变体的默认与 `bySkill` 跟随 owner 的默认技能：`token_10068_kalts2_mtship` 默认变 `sktok_mtship_2`）。测试：`test/content/chess_kalts2.test.js` 新增「默认技能 S2」用例、`field()` 默认不传 `skillIndex`（即走生产默认）；`test/match/feedback5-we2-placement.test.js` 的战术锚点用例改为**显式选 S3**（默认已不是 S3，否则战术锚点不进手牌）。
- **验证**：`chess_char_1052_kalts2_a` / `_b` 的 `skill.skillId = skchr_kalts2_2`，`skills[]` 恰好一个 `isDefault` 且等于它（`build-data.mjs` 自检）。
- **golden 归属证明**：本改动使 roster 4 / bonds 13 / fields 5 / matches 12 个场次移动（她以默认技能上场时换了技能）。按老办法：**只回退本改动**（保留 §35.6 的修）重算 golden = **零差异**；恢复后恰为上述差异 → 全部归因于默认技能改变。`diy` / `standins` 不变（它们走自选 kit / 补位，不读商店默认技能）。
- **诚实保留**：默认技能改变会牵动 bot 的上场 / 时序，`coop3-ABYSS-5`、`coop4-ABYSS-7` 的最终阵容因此**才首次出现她**；这是级联，不是新机制。

### 35.2 澄闪「驭械术师」浮游单元：全部锁定同一敌人、各打满攻击力

- **决策**：浮游单元（无人机）**同时锁定同一个敌人**，每个各造成**澄闪的满额攻击力**（不摊分），只有该敌人死亡后才换目标 —— 参照**异格拉普兰德（荒芜拉普兰德）**的浮游单元规则。
- **实现**：`server/sim/content/kits/ops/chess_char_377_gdglow-gdglow.js`：无人机数量写入 `attack.hits`（＝无人机数），`maxTargets` 保持 1（原来错用 `maxTargets` 会把齐射**分散**到多个敌人）；`server/sim/professions.js` 的 `funnel` 分支用 `funnelTarget` 记「同一目标」以叠 `funnelScale`（换目标即从头叠）。
- **投影修正**：`server/sim/professions.js resolveProfile`（`sub === 'funnel' && attack === 'ranged'`）把 `projectile` 还原成 `'drone'` —— 数据里的通用 `'bolt'` 默认值此前一直盖掉它，导致**没有任何一局画出浮游炮**。
- **诚实保留**：客户端浮游单元是**手绘 2D 浮游舱**（`public/assets`），因为官方浮游炮是 3D 效果绑定，其贴图位于**无法解析的外部 CAB** 内。锁敌与数值由模拟层保证，视觉是自绘近似。
- **交叉引用**：基础（价格特质、技能、美术）见 §31；分支特性表 `funnel` 一行见 `docs/SIM.md`。

### 35.3 结城理〈替身〉攻击动画（FORM）

- **决策**：每个技能的〈替身〉形态各自映射骨架的 `Doll_Skill_*` 剪辑（`shared/forms.js FORMS`）。**重力自定义 S2（塔纳托斯）**那一套**没有独立的 Idle / Attack**，只有一个 `Doll_Skill_2_Loop`，所以把该 Loop **同时**注册为 `idle` 与 `attack`；此前它只有 `idle`，于是技能期间（人格在场、kit 的 `max_target` / 恐惧 / 斩杀命中）角色**停在待机**、看不到挥击。
- **机制**：per-form 剪辑角色（`dollRoles(idle, die, attack)`，`via: 'attackAny'` 让攻击按攻击间隔驱动）；形态由 kit 的 `trait.dollForm` / `dollForm2` 声明、`professions.js` 在每次切换时发布。与上游 `tools/assets/spine.mjs PREFAB_SPINE_ROLES`（按 prefab 修正角色的同族机制）一致；`dollKeepSkill` 让「人格就是技能窗口」的技能在切换时**不结束技能**（`professions.js startSwitch`）。
- **文件**：`shared/forms.js`；`server/sim/content/kits/ops/chess_char_4217_makoto-makoto.js`（`dollKeepSkill` / `dollForm`）；`test/render/feedback2-doll.test.js`（S1 / S2 / S3-P1 的攻击剪辑，以及被缴械的 S3 第二〈替身〉不进入攻击）。
- **交叉引用**：结城理基础（数据 / kit / 双替身）见 §24，〈替身〉动画根因与 4 套形态见 §29。
- **诚实保留**：只动结城理；官方两位傀儡师（风丸 / 归溟幽灵鲨）的 FORM 不变。

### 35.4 联防（unite）战场：改回本回合自己的整张竞技场（撤销上游 #41）

- **决策**（owner）：联防要在**本回合玩家作战的那张完整地图**上打，而不是 #41 引入的「逃逸地图」（一条窄道）。
- **实现**：`server/match/match/unitePhase.js` 的 `_uniteOpts.stageId` 改回 `this.stageId`；删除 `server/match/unite.js uniteStageId`；客户端 / mock 去掉「在自有地图上开战」的覆盖（`public/js/screens/game.js`、`public/js/battle/runner.js`、`public/dev/game-mock.js`）。
- **逃逸记录保留为数据**：`data/stages.json` 的两条 escaped 记录（`act1autochess_escaped_single` / `_multi`）**只作数据**（`weight 0 / active false / modes []`，永不作为比赛地图）；逃逸模板**仍提供联防的波次 / 路线**（`server/match/waves.js buildUniteWave`），已在本回合整张竞技场上验证**会出生、穿场、漏怪**。
- **SIM / CLIENT 一致**：`_uniteOpts` 的 `stageId` 同时进 field meta 与客户端跑的 spec，双方画同一张图；`test/match/feedback5-unite-map.test.js`、`test/render/unite-board.test.js` 钉死「本回合地图 + 逃逸波次 + 联防能画到的每个 glyph / tileKey 都能解析到美术」。
- **交叉引用**：`docs/DATA.md` §12、`docs/META.md` §4、`docs/design/geometry-time.md`、`docs/PLAYING.md`，以及 `docs/history/0.2.0.md` §25.6.4 记录的这次**撤销**。

### 35.5 掉线 / 离开座位规则（owner 规则）

- **决策**：运行中的比赛里，一名**人类**离开、而房里**还有至少一名其他人**时，把该座位**交给一个全新 AI**（比赛继续，这一方仍被 bot 带着打）；**所有人类都走了**才真正解散房间（比赛结束、纯 AI 局被销毁，绝不留着跑）。**显式离开**（`room.leave` / `g.leave`）立即交接；**短暂掉线**不交接 —— 沿用既有的**重连宽限**（这期间座位自动打上一套阵容），只有**宽限过期**才把座位交给 AI，**此前重连即把座位还回人类**。
- **实现**：`server/lobby.js removeMember` 在比赛中且还有别的人类时调 `handSeatToAI`（`Match.aiTakeOver`：整份 `PlayerState`（棋盘 / 金币 / 配装）转成 AI，休整期中途还要让 bot 打完这一次 prep）；`server/match/match/watch.js aiTakeOver` / `_seatToAI` 与 `releaseSeat` 共用重新挂靠；`StubMatch` 实现该可选钩子，`Match.js` / `StubMatch.js` 注明（无钩子时回退到 `onLeave`）。
- **诚实保留**：主客 `takeOver` / `releaseSeat` / `_rekeyPlayer` 未动。测试：`test/lobby.test.js`、`test/match/connection.test.js`。

### 35.6 「余音」受击脉冲不再对反伤 / 反弹回震（为保持 golden 全绿而必须修的既有内容 bug）

- **背景**：§35.1 的默认技能改变使 `coop4-FUNNY-6` 的时序首次把**泡泡（`chess_char_2_08_b`）**放到**「余音」（假想敌：管的召唤物 `enemy_9023_acdums`）**的脉冲半径内：泡泡的「挨打」反伤（tag `counter`）命中余音 → 余音的 `taken`（「受到伤害时以自身为中心造成一次范围伤害」）再脉冲 → 又打中泡泡 → 再反伤 …… **无休止**，直到引擎 32 层嵌套护栏报 `hookDepth:*`，而 golden 的「任何存储场次 0 报错」断言会因此转红。
- **依据**：`docs/SIM.md` §5 的**重入规则**明确写着「从 `hit` / `damaged` 里造成伤害的处理器**不得**对自身输出或别的**反应性伤害**再反应……tag 自己的伤害并跳过被打 tag 的伤害，或用 per-unit 标志」，且「护栏被触发**永远是内容 bug，绝不去调高上限**」；官方 ON_TAKE_DAMAGE 反伤本身也已跳过 `counter` / `reflect`（`kits/shared/tier1.js byEnemyAttack`）。
- **修法**：`server/sim/content/bosses.js` `kitEcho` 的 `taken` 在脉冲前**跳过带 `counter` / `reflect` tag 的来伤**（普通我方命中照旧脉冲，只是**不再对反伤回震**）。
- **验证**：`test/content/enemies_bosses.test.js` 新增回归用例（合成「挨打反伤」靠住余音；修前 `hookDepth` 报错、修后 0 错）；`node tools/golden.mjs` 相对改动前**只**清掉 `coop4-FUNNY-6` 的 5 条报错（`.errors.logged` / `.sim`: `5 → 0`），其余数字一字不变 —— 即修的是**报错**，不是玩法。
- **诚实保留**：这是被 §35.1 的时序改动**暴露**的既有内容 bug（基线任何场次都没同时凑齐「泡泡 + 余音脉冲」），不是本次改动引入的引擎缺陷。修在内容层（余音），符合 SIM.md 的重入规则；未动嵌套护栏。

### 35.7 凯尔希·思衡托「守望者」治疗核实（owner 报告「她不治疗」的核查，2026-10-08）

- **报告**：owner 称她不治疗（守望者），怀疑 `server/sim/professions.js` 的 `watchman` 档位没有把她做成治疗者。
- **核实结论：不成立（假警报）**。`watchman: P({ heal: { mode: 'single' } })` 已生效 —— 她的**普通攻击就是单体治疗**，且**永远不会**打她本可选择的敌人。此前一次核查把测试友军放在了她 y-6 攻击范围**之外**（她朝右站 `(10,4)`，友军放 `(10,7)`，超出 `[0,2]`），于是看到「0 次治疗、血量不变」的假象。
- **官方语义（证据）**：缓存官方 `character_table.json` 的 `char_1052_kalts2` 为 `profession: MEDIC`、`subProfessionId: watchman`，trait `overrideDescripton`「恢复友方单位生命，并且可以起飞」。分支特性只比医师多了**起飞**（kit T1 的 `flags.liftoff` / `blockFly`），**治疗部分与 `physician` 完全相同**（单体、每次 100 % 攻击力）；`data/chess.json` 两个形态的 `dmgType` / `attackKind` 都是 `heal`。她的治疗黑板书：S2 `attack@heal_scale` 1.35（rank4）/ 1.7（rank7）在 1.5 半径内治疗；S3「额外治疗 1 个目标」（2 目标）；T2 `hp_recovery_per_sec` 50（罗德岛 ×2）是**生命回复速度 buff（hpRegen）**、不是直接治疗。与同科的差别：`healer` 远距 ×0.8、`wandermedic` 元素治疗、`ringhealer` / `chainhealer` 多目标 —— 守望者只取**单体**。
- **结论 / 变更**：`server/sim/professions.js` 的 `watchman` 条目**无需改动**（已是最小正确形状）。本次只补**回归测试**：`test/content/chess_kalts2.test.js` 新增「守望者 heals」用例 —— 用**生产默认技能 S2** 上场（`field()` 不传 `skillIndex`），她 y-6 内有一个受伤的角峰、且一个她**可选中**的敌人（0 攻 / 0 速）也在范围内；断言治疗只落在角峰、每次 100 % 攻击力、她对敌人 **0 伤害**、所有攻击都指向友军。实测（4 s）：普攻 408 → 角峰 `886.4 → 1902.4`；精英 476 → `886.4 → 2038.4`（每次 100 % ATK 的两次普攻 ＋ 天赋 50/s 生命回复速度）；敌人受伤 0、每次攻击目标全为友军。另加一条「默认技能 S2」用例（`skill.skillId = skchr_kalts2_2`，`skills[]` 恰一条 `isDefault` = S2，三个技能仍可自选）。
- **诚实保留**：她的 **S2 会主动打敌人**（「优先选择敌人」＋真实伤害），所以她是**带进攻性的治疗者**，不能按「纯治疗」加进 `test/sim/feedback1e-healers.test.js` 的纯治疗审计（该审计要求对阻挡的敌人 0 伤害）；本条目只核实**普攻 / 分支特性**的治疗，未改 `feedback1e` 的分支集合。

### 35.8 望的棋子「总有一个不爆炸」＋自动下棋子（owner 报告 #7，2026-10-08）

- **报告**（owner）：①「总有一个棋子不爆炸」；②「自动下棋子的功能也不对」。
- **根因（无头复现）**：铸子「棋子相连时相互激活」，「相连」= 上下/左右**贴邻**。自动落位（S1/S2/S3 发子与 S3「有空地就不断下棋子」补位）只按攻击范围优先级选格，**不看是否贴邻**。于是当某枚棋子的「跟子」被 **S3「额外至多 3 枚」**或**场上 6 枚上限**挡下、或它唯一的邻居在**同一 tick** 先被连锁引爆时，这枚棋子从未激活（`mem.wangAxes` 全 `false`）—— 敌人踩上去也不触发，正是 owner 看到的「总有一个不爆炸」。实测（S3 补位循环）：出现 `(9,6) (9,8) (10,5)` 三枚 `follow=false`、无 axis 的孤立棋子。
- **依据**：官方铸子文本「手动部署棋子时，望在相邻位置额外部署一枚棋子」；玩家手动落子必然连成一片，所以**自动落位必须模仿这条链**。
- **实现**：
  - `server/sim/content/kits/ops/chess_char_2027_wang-wang.js`：`deployStock` 与 S3 补位**只落在与场上已有一枚棋子正交相邻的格**（空场第一枚由自身跟子连成对）；S3 清场后的「种子」跟子**不受「额外至多 3 枚」限制**（仍扣 1 发弹药），使清场后能重新连成对；跟子优先级（有敌人 > 无敌人 · 不可部署地面 > 可部署地面 > 可部署高台 · 上>右>下>左）**不变**；6 枚场上上限与弹药记账不变。
  - `server/sim/content/tokens.js` 的 `wangStone`：在 `deploy` 钩子里**立即**锁存相连（`wangAxes`），而不是等第一次 `onTick` —— 同一 tick 的连锁引爆不会再把刚落地的棋子变成永久死子。相邻 / latch 规则本身**不变**（未动触发/连线逻辑）。
- **验证**：`test/content/feedback-wang.test.js` 新增 3 条：每次施放（S1/S2/S3）后棋子全相连、S3 补位穿爆后仍全相连、敌人进入后 `x-6` 十字范围内所有相连棋子爆炸。全量 `node --test`：**5150 项 / 5142 通过 / 0 失败 / 8 跳过**。
- **golden 归属证明**：本次只移动**含望的 18 个场次** —— `roster` 015/019/020、`bonds`（arcaneShip / emptyShip / maniShip / yanShip 的 low/high）、`fields`（boss_1/3/5/7-pair、hidden-boss_9-pair）、`matches`（coop4-FUNNY-6、coop2-NORMAL-8-serverrun）；其余零差异 → 全部归因于本改动。
- **诚实保留**：S3 空场「种子」跟子仍扣 1 发弹药（与官方「消耗等量弹药」一致）；只是不再让「额外 3 枚」上限把清场后的重连也一起挡死（否则补位必然产出死子）。跟子仍是**一枚特殊棋子**（§30.1 的约定），不是原版的弹道单位。

### 35.9 凯尔希·思衡托 S2「保护性拒止」的可见反馈（owner 报告「看不出在治疗还是在打人」，2026-10-08）

- **报告**：S2 的 医疗单元 命中时**看不出**谁被治疗、谁被伤害 —— 技能自己只画了一对通用的 `aoe`（橙）＋ `healAoe`（绿），都落在一个落点上，红绿混在一起。
- **官方效果（客户端实证）**：CN 客户端 `battle/prefabs/effects/kalts2.ab` 里 S2 的效果 prefab 是**成对**的：`kalts2_skill_02_range_heal_01` / `_range_damage_01`（1.5 范围域）、`..._indicator_heal_01` / `..._indicator_damage_01`（落点指示）、`..._start_heal_01` / `..._start_damage_01`（命中起手）、`..._trail_heal_01` / `..._trail_damage_01`（弹道尾迹），另有 `kalts2_skill_02_buff_01`（治疗 buff）。颜色取自该 bundle 自带的材质 tint：治疗侧 `char_kalts2_43` 的 `_TintColor` ≈ (0.11, 0.56, 0.04)（**绿**）、伤害侧 `char_kalts2_41` / `char_kalts2_42` 的 `_TintColor` ≈ (0.86, 0.15, 0.15) / (0.75, 0.09, 0.09)（**红**）；绿波贴图 `flow_332*`、红波 `flow_331_2`、绿黑医疗单元 `char_kalts2_01` 也都对得上。该 bundle 的 Texture2D 是**可解析**的（本次用 `tools/local-extract` 的 UnityPy 直接导出了 38 张），即官方效果贴图**在本例中可提取**；`docs/ASSETS.md`「per-character effects 的贴图位于其他 bundle」的旧描述至少对 `kalts2.ab` 不准确。
- **决策 / 实现**：客户端战斗特效**保持程序化**（`docs/ASSETS.md`：好友端没有本地素材也要看得到），所以**不引入官方贴图**，而是按官方配色**手绘最接近的近似** —— kit 在 `s2Burst` 里对**每个实际受伤的敌人**发一条红 `kalts2Damage`、对**每个实际被治疗的友军**发一条绿 `kalts2Heal`（治疗绿沿用项目既有 `heal` 绿 `0x62f08a`，保持全项目一致）。颜色 / 形状写在 `public/js/render/fx/kinds.js`：`kalts2Damage` = 红 blast r 1.5、`kalts2Heal` = 绿 healAoe r 1.5。**（§35.11 取代：现为每次爆发**一颗**红球 / **一颗**绿球，都落在落点；行为与数值不变。）**
- **文件**：`server/sim/content/kits/ops/chess_char_1052_kalts2-kalts2.js`；`public/js/render/fx/kinds.js`。
- **测试**：`test/content/chess_kalts2.test.js`（S2 用例新增：角峰拿到 `kalts2Heal`、1.5 内的假人拿到 `kalts2Damage`，后续打飞机时飞机也拿到 `kalts2Damage`）；`test/render/fx-kalts2.test.js`（两个 kind 的 archetype / 颜色 / 半径，以及 `FxSystem` 真的会绘制）。
- **golden 归属证明**：本改动只进 fx 事件直方图。在**干净工作树**（HEAD ＋ 本改动）重算：只回退本改动 → **零差异**；恢复后恰为 `roster` / `bonds` / `fields` 的 fx 计数差（`aoe` / `healAoe` 减少、`kalts2Damage` / `kalts2Heal` 出现）；`matches` / `diy` / `standins` 不变。全部归因于本改动。
- **诚实保留**：官方 S2 的 3D 粒子 prefab / 贴图**未导出使用**，视觉是**程序化近似**，只保证三个官方可读特征：治疗=绿、伤害=红、各自落在**实际受益单位**上。

### 35.10 战斗特效的「双层」规则：程序化兜底 + 可选的本地官方贴图（owner 规则，2026-10-08）

- **规则**：每个 fx kind **两层** —— **程序化层**（必选、运行时绘制、始终可用、离线、无本地客户端也能画，是保底）＋ **可选本地层**（客户端本地提取的官方贴图；`data/local-assets.json` 列出**且已加载**才用）。**按客户端**解析：没有本地素材的连接端看到程序化版本 —— owner 的类比「Minecraft 光影设置：按能力优雅降级」。绝不出现空白/黑帧，兜底也绝不依赖网络。顺序沿用项目既有的**本地 → 镜像 → 中性**（特效没有镜像 raster 副本，故为 本地 → 程序化）。
- **机制**：`public/js/render/fx/kinds.js` 的 `local` 描述（`{ group, layers: [{ name, scale? }], tint?, dur? }`）→ `public/js/render/fx/localart.js` 解析（`fxLocalLayers` / `fxLocalSource`，复用 `assets.js` 的 `localUrl` / `imageNow` / `image`；列出未加载的层做预取，未列出的层**不联网**）→ `public/js/render/fx/simfx.js` 在本地层齐全且已加载时绘制为地面 field 并**跳过**程序化 archetype，否则走程序化。`render/fx/rings.js` 的 `ring()` 现可接收 PIXI 纹理（按纹理自身尺寸缩放）。`settings.localFx === false` 可像画质档一样关闭本地层（默认开，无强制用户设置）。
- **kalts2 落地**：`tools/local-extract/extract.py` 新增 `battle/prefabs/effects/kalts2.ab → fx/kalts2` 任务（38 张 Texture2D）；`kalts2Heal` 用官方 `flow_332_3` + `star_118_7`，官方绿 tint `0x1c8f09`；`kalts2Damage` 用官方 `flow_331_2` + `star_118_7`，官方红 tint `0xdc2828`；程序化 ring / explosion 为兜底。这**扩展**了 §35.9（不再「一律不引入官方贴图」，而是按规则做成**可选本地层**；没有本地素材的客户端 / 好友 join 仍看程序化近似）。
- **契约（`PROJ.drone` 浮游单元）保持程序化**：其贴图位于无法解析的外部 CAB，客户端也没有独立 sprite/spine，**无物可抽**（`render/textures.js` `drone`），如实保留。
- **测试**：`test/render/fx-local.test.js`（缺本地素材→程序化且不崩、有→本地层取代程序化、列出未加载→本次程序化/下次本地、`localFx:false` 关闭、kalts2 各层在 `fx/kalts2` 组且落盘）；`test/local-extract.test.js`（新增 `fx/kalts2` 任务断言）。
- **诚实保留**：官方 S2 效果本体是 3D 粒子 + 网格 core（绿/红为**网格材质** color，无独立主贴图），本层用**同一 prefab 引用的官方 flow/ray 贴图**做地面 field 近似，**非逐粒子还原**；`star_118_7` 自身含红/绿两条光线，两层均再套官方 tint；提取依赖各机本地客户端，manifest 为 per-machine（`data/local-assets.json` 不入 git）。

### 35.11 凯尔希·思衡托 S2「医疗单元」改为**每次爆发一颗球**（owner 报告「有大量图片显示」，2026-10-09）

- **报告**：owner 附官方截图指出：S2 施放时**满屏大量特效图片**；官方的 S2 是**每次爆发一颗干净的球** —— 治疗处**绿**、伤害处**红**，落点一颗大球罩住整簇目标。
- **根因**：§35.9 的实现让 kit 在 `s2Burst` 里**对每个实际受伤的敌人**发一条红 `kalts2Damage`、**对每个实际被治疗的友军**发一条绿 `kalts2Heal`；每个事件是一张 256×256、`scale 1.5` 的贴图（`kinds.js`，组 `fx/kalts2`），密集敌群里就叠成一大摞球。
- **修法**（`server/sim/content/kits/ops/chess_char_1052_kalts2-kalts2.js` `s2Burst`）：**每次爆发至多一颗红球 + 一颗绿球**，都锚定在**落点**（`target.x, target.y` —— 即 `foesInRadius` / `alliesInRadius` 用的中心）；只有当本次爆发**确有**敌人吃到伤害 / 友军吃到治疗时才各发一条。伤害 / 治疗 / 停顿的行为与数值**一字未动**（伤害数字来自 `render/fx/numbers.js`，不受影响），仅改 fx 事件；敌方目标仍「伤害先、治疗后」，友方目标仍「治疗先、伤害后」。
- **球的大小**：本地官方层的半径 = `r × layer.scale`（`render/fx/simfx.js` `_fxLocal` → `render/fx/rings.js` `ring`，量出来都是**半径**，不是直径）。`r` = kind 的 `1.5`（＝ S2 命中半径 `S2_RADIUS`）。原来的外层 `flow_331_2` / `flow_332_3` `scale 1.5` → 半径 **2.25**（比命中半径大 50 %）；现改为外层 `scale 1`（半径 **1.5**，**恰好罩住爆发**），内层 `star_118_7` 按原比例 **0.8**（半径 1.2）。程序化兜底本来就是 `r 1.5`（`blast` 的爆炸环 / `healAoe` 的治疗环都是半径 1.5），保持一致；未用逐事件 `r` 覆盖来 hack。
- **别的 fx 事件排查**：同 kit 的 `shield`（T2 天赋，**每个进门友军**一条）落在**各自身上**、不是同一点堆叠，是「每个受益单位各自的护盾提示」，属于正确反馈，**不动**；`teleport`（S3 落地）/ `disappear`（起飞）/ `takeoff`（部署）本来就是**每次一次**，无 per-unit 问题。
- **文件**：`server/sim/content/kits/ops/chess_char_1052_kalts2-kalts2.js`；`public/js/render/fx/kinds.js`；测试 `test/content/chess_kalts2.test.js`、`test/render/fx-kalts2.test.js`。
- **测试**：新增「一次爆发打中多个敌人 / 多个友军 → 仍只有一颗红球 + 一颗绿球，都在落点、不带 `id`」与「一次爆发既没伤害也没治疗 → 一颗都不发（护盾整段吸收 + 1.5 内无友军）」两条；既有 S2 用例改为断言**恰好一条** `kalts2Damage` / `kalts2Heal`（落点在角峰、无 `id`），并断言后续打飞机只**多**一颗红球。
- **golden 归属证明**：本改动只进 fx 事件直方图。全量 `node tools/golden.mjs` 相对改动前**逐字段枚举**：全部差异只有 `.events.fx`（总计数）与 `.fx.kalts2Damage` / `.fx.kalts2Heal`，**只落在含她的 13 个场次**（`roster-008`/`012`、`bonds` 5、`fields` 5、`matches`、`diy`——见 `golden:update` 后的文件 diff）；`snaps` / `players` / `units` / `enemies` / `hooks` / `errors` / `rngDraws` **零变化** —— 即伤害 / 治疗 / 结果一字未动。`node tools/golden.mjs --update` 只更新这些 fx 计数。
- **诚实保留**：官方 S2 的 3D 粒子本体仍未使用（沿用 §35.10 的本地贴图近似）；本次只把**事件数量 / 落点 / 尺寸**对齐官方「每次一颗球」的观感，不逐粒子还原。

### 35.12 官方本地贴图特效**限尺寸 / 限贴图 / 限 kind** + 一把总开关（owner 报告「很多干员攻击特效出现大片图片」，2026-10-10）

- **报告**：owner 在看 `90b748be`（去掉翻页动画 / 攻击类 kind）后仍看到**很多干员**的攻击 / 技能特效在棋盘上**糊一大片图片**。
- **根因**：生成的官方表（`render/fx/official.js`）给每个干员挑了**签名贴图**，`render/fx/simfx.js` `_fxLocal` 把每层画成半径 `r × layer.scale` 的**地面 field**（`render/fx/rings.js` `ring`）。表里 `scale 1.5`，而 archetype 自身面积半径不小（`tide` r=2、技能 `aoe` 的 r 更大），乘出来就是半径 2–3 格的「整张贴图」；贴图本身还常是 `char_*` / `special_object_*` / `bg_*` / `pattern_*` 这类**物件 / 图案**图，看起来就是「一张大图」。`hits.js` 头部早已记录同一根因（地面锚点 + ~2.4 格）而弃用。
- **修法一：限尺寸（运行时）**。`render/fx/localart.js` 导出 `LOCAL_FX_MAX_R = 1.1`（≈ 一个身位）；`simfx.js` `_fxLocal` 把**整层集合**的半径 `r × layer.scale` **一起等比缩小**，使**最大值 ≤ `LOCAL_FX_MAX_R`**（保留各层原有比例，不压平），`hits.js` `_opHitLocal` 的手绘命中闪光同样按它封顶（≤ ~一个身位）。窄 kind 保持自己的小半径（这是**上限**不是固定值）；手写的 `aoe` / `s2` / `champagneBomb` / `takeoff` 等地面 field 一并受此上限约束（保留其手绘，不再可能糊满棋盘）。修前最大有效半径 **3.0 格**（skadi2 `tide` r=2 × 1.5），修后 **≤ 1.1 格**。
- **修法二：限贴图（生成器）**。`tools/build-fx-official.mjs` 只认**柔和、就地**的特效图族 —— `flow` / `ray` / `glow` / `ring` / `star` / `light` / `smoke` / `aura` / `halo`（`EFFECT_TEX`）；墙 / 贴花 / 图案 / 物件图案（`char_*`、`special_object_*`、`bg_*`、`pattern_*`、`water_*` …）一律不选；bundle 里没有合格图就**不发条目**（走程序化）。手写 pin 同样过这道筛（`fx-official-overrides.json` 的澄闪由物件图 `char_gdglow_04` 改为 `flow_91_C_1` + `star_05`）。
- **修法三：限 kind（生成器）**。只挂到**就地发生的 area / self** kind：archetype `blast` / `zone` / `healAoe` / `wave`（落在一片）＋ `buff` / `shield` / `shatter` / `summon` / `vanish` / `lift` / `sleep` / `heal` / `down` / `counter` / `dodge` / `dp` / `coin` / `sp`（落在单位身上）（`KIND_ARCH`）；**逐目标 / 逐击 / 瞬时 / 黏在单位上**的 archetype（`volley` / `shell` / `move` / `blink` / `mark` / `reticle` / `flame` / `wall` / `chill` / `telegraph`，以及既有的 `crit` / `strike` / `slash` / `beam` / `bolt` / `hit`）一律走程序化 —— 把地面 field 挂在这些上只会在战斗里**铺满一地板**。两项都只影响生成表；手写 kind 不动。
- **修法四：一把总开关**。`render/fx/localart.js` 导出 `LOCAL_ART_ENABLED`（默认 `true`）；改成 `false` 一处即可让整个本地官方层失效（`fxLocalFor` / `fxLocalSource` 直接返回 null，生成表 / 手写层 / 自研干员命中闪光**全部**回退程序化，且不解析不联网）。与 `settings.localFx === false`（按客户端的运行时开关）区分。
- **表统计**：operator 86 → **56**，layer 167 → **90**，distinct kind 106 → **71**；最大层 `scale` 1.5 → **0.9**，最大**有效**半径 3.0 → **1.1（运行时封顶）**。离开的干员 = 贴图不合规（如 德克萨斯 `jian_01`、临光 `meat_01`、望 `char_wang_05`、烈夏整包是一张 `flipbook` 动画网格）+ 只发射被拒 kind（`char_126_shotst`、`char_4145_ulpia`、`char_264_f12yin`）；它们的程序化兜底与手绘命中特效保持不变。
- **测试**：`test/render/fx-local.test.js` 新增「贴图只许九族」「kind 只在 `KIND_ARCH` 内且不含 `IMPACT_KINDS`」「宽 kind 画出的 `r1 ≤ LOCAL_FX_MAX_R`、窄 kind 保持小半径」「手写 `aoe`（1.6）与 kalts2 S2（1.5）也被封顶」「`LOCAL_ART_ENABLED === true` 默认」；`test/render/fx-gdglow.test.js` 改钉新的 `flow_91_C_1` + `star_05`；`test/local-extract.test.js` 的 `--check` 仍保证表不过期。
- **诚实保留**：这是**观感**修复（尺寸 / 贴图 / kind），不是逐粒子还原；被拒 kind 与不合格贴图的干员仍只有程序化近似。

## 36. 大厅社区功能：更新日志 / bug 提交 / 公开房间（2026-10-09）

需求（owner）：大厅社区功能「更新日志」「bug提交」「公开房间」（后二者曾同列大厅左侧；见 §36.4 的顶栏调整），数据落 SQLite；「玩家留言」不做（owner 明确放弃）。截图中列出的四个按钮里，玩家留言被删除——本仓库此前的代码里从未实现过它，因此没有可删除的实现，本次只保证不新增（`grep` 与 `git log -S` 均无记录）。

### 36.1 存储（server/db.mjs，user_version 3）

- `changelog(id, version, released_at, title, body, published, created_at)` + `idx_changelog_order`；v4 追加 `summary`（默认展示的一行概要）、`source`（`release` 种子 / `notice` 通知）、`minor_seq`（通知条目的单调序号，种子为 NULL）；
- `bug_reports(id, title, body, account_id→accounts, submitter, status, created_at, updated_at)` + `idx_bug_reports_status`（status: `new` / `triaged` / `fixed`）；
- `bug_uploads(id, report_id→bug_reports, path, mime, bytes, account_id→accounts, created_at)` + `idx_bug_uploads_report`。
- 迁移沿用 `PRAGMA user_version`；新的服务类 `CommunityService`（server/community.js）与 `AuthService` 同风格：单句柄、预编译语句、同步方法，测试用 `openMemoryDb()`。
- bug 报告**只有文字 + 图片**，不附带 seed / replay / room（owner 2026-10-09 修正）。

### 36.2 更新日志（只读 + 一次性导入 + 每次通知记一小版本）

- 首次启动（`changelog` 表为空时）由 `CommunityService.importChangelogMarkdown()` 解析仓库自己的 `CHANGELOG.md` 一次：`## <版本> — <YYYY-MM-DD>` 为一条，body 为到下一个 `##` 的 markdown（`source: 'release'`）。表非空时不重复导入。
- **概要**：每条都有一条**一行概要** `summary`（`summarizeChangelog()`：取正文第一条有意义的行，跳过标题行、去掉列表 / 引用前缀，截到第一个句末标点，压平空白并截断到 `CHANGELOG_SUMMARY_MAX` = 120 字，超出加省略号）。种子导入时由正文派生（也接受显式 `summary`）；旧的 v3 行没有该列值，读取时按同一函数即时派生。
- 公开只读接口 `GET /community/api/changelog` → `{ now, changelog: [{ id, version, released_at, title, body, summary, source, minor_seq }] }`，最新在前（与 `/online/api` 同风格、免令牌）。旧字段（`id / version / released_at / title / body`）保持不变，只是**新增** `summary / source`。
- 客户端 `public/js/ui/community.js` 的 `ChangelogOverlay` 默认只渲染 **版本 · 日期 · 概要**；一条正文比概要长时带一个「详情 / 收起」toggle（`ChangelogItem` 的局部 state）在原位展开完整正文，**默认不再打印整段多段正文**。「详情」「收起」复用既有 msgid，无需新增语言键。
- **入口**（§36.4）：更新日志 / 公开房间 由 `screens/lobby.js` 的 `.topbar__left` 打开；**bug提交 自 2026-10-11 起移入「设置」对话框**（与玩法说明同列，见 §36.8）。`ui/community.js` 不再导出 `CommunityBar` / `COMMUNITY_PANELS`，左侧社区列（`.lobby-tools`）已删除，左侧现在从 `01 模拟方式` 开始。三块面板（changelog / bug / rooms）功能不变。
- 管理页的写入入口留作可选（服务端已提供 `addChangelog()`）。

### 36.2.1 每次推送通知 = 下一小版本（来源 notice）

- owner：「每次小更新推送通知也要记录进来（小版本）」。`Lobby.broadcastNotice()`（§28）在**推送成功之后**调用 `CommunityService.recordNotice()`，把这条通知**追加**为更新日志的一条**小版本**：内容同时作为 `body` 与 `summary`，`released_at` = 推送时间，`source: 'notice'`。
- **版本号**：`_nextMinorVersion()` = `<APP_VERSION 的 major.minor>.<seq>`（如 `0.2.1`、`0.2.2`…，`package.json` / `shared/constants.js` 的 `APP_VERSION` 为 `0.2.0`）。`seq` = 已存 `minor_seq` 的最大值 + 1（**单调、绝不重编号**）；若算出的版本已被某条种子发布占用，则继续 +1 直到不冲突（`never collide with a seeded release version`）。
- **失败隔离**：写入包在 try/catch 里（`this.community.recordNotice` 抛错只 `log.warn`），**推送永远先发出、绝不被日志写入阻断或破坏**；返回体带 `changelog: { id, version, minor_seq } | null`。
- **接口**：`POST /admin/api/notify` 的响应新增 `changelog`（创建的小版本，写入失败为 `null`）；管理页「通知」表单下方提示「发送后……记入大厅「更新日志」的下一小版本」，成功提示里显示「记入日志 0.2.N」。

### 36.3 bug 提交（文字 + 图片）

- 消息：`shared/protocol.js` `bug.report { title, body?, images? }`；结构校验 title ≤ 80、body ≤ 2000、images ≤ 4 个 id，语义校验在 `CommunityService`。
- 图片走 HTTP：`POST /community/api/bug/upload`（原始字节，`Content-Type` 仅作提示）。**真实类型从字节嗅探**（magic bytes）——仅 `image/png`、`image/jpeg`、`image/webp`；svg / html 及其它一律拒绝；单张上限 4 MiB。文件落盘 `var/bug-uploads/<time>-<rand>.<ext>`（git-ignored、不被静态服务），DB 只存相对路径 + mime + 字节数 + 上传者 + 时间。
- 报告提交走 WebSocket `bug.report`：绑定账号时 `account_id` = 账号、`submitter` = 账号名；游客 `account_id` = NULL、`submitter` = 当前代号。图片归属：上传与提交必须是同一个 key（`account:<id>` 或 `net:<客户端网络 key>`），未认领的图片不能挂到别人的报告。
- 限流（内存滑动窗口，按 key）：提交 **5 次 / 30 分钟**，上传 **20 张 / 30 分钟**；未提交的孤儿图片 24 小时后由 `pruneUploads()` 清理。长度上限见 `shared/constants.js`。
- 客户端 `BugReportOverlay`：标题、描述、最多 4 张图片（本地预览、逐张上传）、提交；文案全部 i18n。管理页 `/admin` 的「玩家反馈」面板列出报告、正文、缩略图与状态按钮（待处理 / 已受理 / 已修复）。
- 管理接口（令牌见 `var/admin-token.txt`）：`GET /admin/api/state` 新增 `bugs` 与 `bugCounts`（各状态计数）；`bugStatus`（`new` / `triaged` / `fixed`，缺省为全部）与 `bugSort`（`status` 缺省 = 未处理优先 + 新→旧；另有 `newest` / `oldest`）两个查询参数在**服务端**过滤与排序，作用于全集而非前 100 行；`POST /admin/api/bug/status { id, status }`；`GET /admin/api/bug/image/<id>`（`X-Content-Type-Options: nosniff`、`Cache-Control: private, no-store`）。
- 导出（令牌门禁）：`GET /admin/api/bug/export?format=json|csv&status=&sort=` 返回当前筛选 / 排序的**全集**（最多 500 行）。CSV 为 RFC 4180、**带 UTF-8 BOM**（Excel 正确显示中文）、字段按需以 `"` 包裹并把 `"` 加倍，且对以 `= + - @` 开头的玩家文本加 `'` 前缀以防公式注入；JSON 为 `{ status, sort, count, reports[] }`。两者每行只含 id / status / submitter / created(ISO) / title / body / 图片数——**不含 accountId / 账户表 / 图片字节**。

### 36.4 公开房间（独立界面 + 席位方块，2026-10-09 改版）

owner 要求（截图 + 消息）：点「公开房间」要**跳转到独立界面**（像游戏其它界面那样整屏、自带顶栏与「返回」，不是浮动弹窗卡片）；每个房间是一条**横向长条**（像「加入同盟」的琥珀色面板行），不是小卡片；一条长条显示难度图标 + 难度名 + 房间码（等宽）+ 模式 / 回合 / 人数、该房的 **4 个席位方块**、状态标签（组队中 / 对局中）与唯一的操作按钮。

后续三项（owner 2026-10-09）：①「全都分色」——每个状态都要一眼可辨；②「优先显示人不满的，满的显示观战」；③「位置调一下，放上边，公开房间放在线后边」。

- **界面而非路由**：`public/js/screens/rooms.js` 的 `PublicRoomsScreen`；由 `screens/lobby.js` 在 `showCommunity === 'rooms'` 时**整体替换大厅主体**（同一个 `LobbyScreen`、同一套路由）。这样不新增 `SCREENS` / `selectRoute` 分支，房间恢复（`room.state` 仍会接管路由）与 `?room=` 深链流程完全不动；加入 / 观战仍复用大厅自己的 `join()` / `spectate()` 处理函数（点按钮先关界面、写入密钥再走原路径）。顶栏复用 `.topbar` + `Button` + `MicroLabel`，主体是 `.screen__scroll` 的 `rooms-body`（`public/css/screens/lobby.css` 的 `.rooms-*`，全部用主题令牌，无一次性颜色）。
- **入口（顶栏，③）**：**公开房间 · 更新日志** 两个社区入口在 `screens/lobby.js` 的 `.topbar__left` 内、**紧接 `<OnlineBadge>` 之后**（`users` / `book` 图标，复用 `.online-badge` 观感，小顶栏下仍清晰），顺序为 **返回 · ping · 在线N · 公开房间 · 更新日志**，点击分别 `setShowCommunity('rooms' | 'changelog')`。**bug提交 已移入「设置」对话框**（§36.8），不再在顶栏。`ui/community.js` 不再有 `CommunityBar` / `COMMUNITY_PANELS`，大厅左侧社区列（`.lobby-tools`）已删除。公开房间界面**自己的**顶栏（返回 / PUBLIC ROOMS / 实时·刷新）保持不变。
- **数据**（`server/admin.js buildPublicSnapshot` → `GET /online/api`）：`openRooms`（手建公开同盟 → 组队中）与 `playRooms`（进行中 → 对局中 → 「观战」）每个条目新增 `seats`：按席位顺序的 `MAX_SEATS`（=4）个元素，空席 / 已离开的席位为 `null`，否则 `{ name, role, guest, isBot, isHost }`。**隐私**：只暴露游戏内已经可见的信息（名字 / 身份 / AI / 房主），绝不带 `playerId`、`accountId`、IP 或 token；`guest` 由账号绑定推导，但不暴露绑定本身。旧字段（`code / difficulty / difficultyName / host / hostRole / humans`，及 `playRooms` 的 `bots / auto`）保持不变。
- **排序 / 满房显示观战（②）**：`openRooms` 现在也包含**大厅已满**（无空席）的公开同盟房，每条新增 `full: <boolean>` 与 `freeSeats`（空席数）。排序为**未满在前、已满在后**，组内保持人数降序（`(a.full - b.full) || (b.humans - a.humans)`），上限仍为 12。`playRooms` 语义不变（已开局 → 观战，上限 4）。客户端 `screens/rooms.js` 的 `roomIsFull()` 用 `full` → `freeSeats` → 席位数判定；组队中区 `01` 的 `openRooms` 未满在前，操作按钮 **有空席＝「加入」、已满＝「观战」**；`02 对局中`（`playRooms`）恒为「观战」。大厅内联的 `PublicAlliances` 密钥 chips **跳过 `full` 房**，因此仍只显示可加入的。
- **席位方块**：owner 的「4 squares」读作「每房 4 个合作席位各画成一个方块」——占用席位为实心方块（首次字形 = 名字首字，房主金冠、游客角标、AI 角标；用游戏自带的 `AvatarFrame`，空席位即其虚线 `is-empty` 样式），空席位为虚线方块 + 「空席位」。每方块下带截断的名字（`title` 为全名），席位区带 `席位` 无障碍标签。满房照常画出 4 个实心方块。
- **分色（①）**：全部取自主题令牌（`.rooms-tag.is-open` 薄荷 `--mint-400` / `.is-play` 琥珀 `--amber`，并加同色描边 + 底色；两段区标题 `01 组队中` 薄荷、`02 对局中` 琥珀，序号块与英文 `micro` 同色）。在线玩家浮层的每个状态各有其色（`OnlineOverlay` 的 `ONLINE_STATUS` 映射到 `.online-row__status.is-*`）：在线 `--mint-400` / 组队中 `--ice` / 野排排队 `--gold` / 野排游玩 `--amber` / 同盟游玩 `#b28cff` / 单人游玩 `--tier-3` / 离线 `--text-dim`——`在线`↔`单人游玩`、`野排排队`↔`野排游玩` 不再同色。
- 客户端每 4 秒轮询 `/online/api`（保留上一次快照、加载态与「暂无公开房间」空态）；房间历史未额外持久化（需求只要求展示）。
- **公开房间加入后的返回来源（owner 2026-10-09）**：从 公开房间 界面点「加入 / 观战」进入房间时记下来源（store 的 `ui.roomsReturn`，一次性、非持久）。此后**主动离开**（房间等待室的 `room.leave`、对局里的「放弃模拟 / 离开观战」`g.leave` → `room.leave`）回到大厅时，`LobbyScreen` 挂载即重新打开 公开房间 界面并重新轮询 `/online/api`（`consumeRoomsReturn()` 一次性消费并清除）。其它入口——「创建同盟」、密钥输入框、大厅内联的 `公开同盟 / 正在模拟` chips、`?room=` 深链——**不记来源**，离开仍回普通大厅（内联 chips 与 公开房间 界面是两个入口，按普通大厅处理）。若房间**被解散 / 被踢 / 会话重置**（`room.closed`、`onRoomState` 落座检查、`backToLobby`）则清除该标记，**不强行**打开 公开房间——强制行为只绑定「主动离开」；`store.reset()`（返回标题 / 重置）同样清除。来源放在 store 的 `ui.*`（不是随组件卸载丢失的局部 state）；`setRoomsReturn` / `consumeRoomsReturn` 见 `public/js/store.js`。

### 36.5 安全 / 不变量

- 图片不在 `data/`（被静态服务）下；只有令牌门禁的 `/admin/api/bug/image/<id>` 能取到。
- 标题 / 正文在服务端清洗控制字符与零宽 / 双向字符；客户端与管理页均以文本渲染（不全信 HTML）。
- 不新增任何秘密到仓库；上传目录 `var/` 已在 `.gitignore`。

### 36.6 测试

`test/community.test.js`：markdown 解析、文本清洗、图片嗅探、迁移 v4（表 + `summary / source / minor_seq` 列）、增删查、**概要派生（`summarizeChangelog`）**、**通知→小版本日志（`recordNotice`：单调版本、跳过种子版本、`source: 'notice'`）**、**写入失败不阻断推送（`broadcastNotice`）**、状态、限流、图片落盘 / 归属 / 清理、协议校验、HTTP（公开日志 + 上传 + `bug.report` + 管理列表 / 状态 / 图片 + 通知记日志与 API 形状）；服务端筛选 / 排序作用于全集（含 >100 行的用例）、`bugReportCounts()`、`bugReportsToCsv` / `bugReportsExport`（BOM / 引号 / 公式前缀 / 字段白名单）与令牌门禁的导出接口 + 管理页控件。

`test/ui/rooms.test.js`：公开房间目录的纯数据映射（席位归一 / 满房判定 / 排序）；`test/ui/room-origin.test.js`：公开房间来源标记的生命周期（`ui.roomsReturn` 默认关、公开房间 加入后置位并被大厅消费一次、加入失败清除、`store.reset()` 清除、只有 公开房间 入口置位——`remembersRoomOrigin`）。

### 36.7 管理页「玩家反馈」面板（筛选 / 排序 / 导出 / 图片放大）

- 状态筛选 chips：全部 / 待处理（带未处理计数）/ 已受理 / 已修复。切换后请求带 `bugStatus`，由服务端过滤全集（不受 100 行上限影响），并显示「显示 N / 共 M 条」。
- 排序 chips：未处理优先（缺省，保持历史行为）/ 新→旧 / 旧→新。请求带 `bugSort`，服务端排序全集。
- 点击缩略图打开全屏 viewer（lightbox）：仍是令牌门禁的 `/admin/api/bug/image/<id>`，图片按自然尺寸并适配视口；「关闭」按钮 / `Esc` / 点击背景关闭，多图时用 ‹ › 按钮或 `←` `→` 翻页。
- 「导出 JSON」「导出 CSV」按钮：以 `<a download>` 打开上面的令牌门禁导出接口，导出**当前筛选 / 排序的全集**（不是只看得到的一页）。
- 安全不变：玩家文本一律经 `esc()` 文本渲染（无 innerHTML 注入）；筛选 / 排序的取值只做白名单映射（`BUG_STATUSES` / `BUG_SORTS`），绝不拼接进 SQL；导出与状态接口只走服务端的字段白名单。

### 36.8 玩法说明 / bug提交 移入「设置」对话框（2026-10-11）

- **动因**：玩法说明 与 bug提交 原先占着大厅 / 房间顶栏的位置；把它们收进每个界面都能打开的「设置」对话框，顶栏只留高频入口（公开房间 / 更新日志 / 统计 / 干员调配 / 设置 / 档案）。
- **入口**：`public/js/ui/settings.js` 的 `SettingsModal` 动作行 —— `玩法说明`（`.set-guide` → `openGuide(0)`，容器 `ui/guide.js GuideHost`）与 `bug提交`（`.set-bug` → `openBugReport`，容器 `ui/community.js BugReportHost`），都在 `完成` 左边。两处都复用既有 msgid，无新增语言键。
- **顶栏变化**：`screens/lobby.js` 的 `.topbar__left` 去掉 bug提交 按钮、`.topbar__right` 去掉玩法说明 按钮（保留 公开房间 · 更新日志 · 统计 · 干员调配 · 设置 · 档案）；`screens/room.js` 顶栏去掉玩法说明 按钮，其余控件不动。**对局内的** gear / 步骤头 玩法说明 按钮保持不变。
- **bug 弹层**：新增全局 `BugReportHost`（`main.js` 挂一次，dev mock harness 也挂），`openBugReport()` / `closeBugReport()` 驱动 store；弹层不重写表单，仍是 `BugReportOverlay`（`bug.report` + `/community/api/bug/upload` 图片上传，行为不变）。
- **层级 / 关闭**：`.bug-host`（`css/screens/lobby.css`）`z-index: calc(var(--z-modal) + 4)`，与 `.guide` 同层；`components.js` 的 `Modal` `topmost()` 也认 `.bug-host`，所以设置对话框在弹层打开时让出焦点与 `Esc`；弹层用背景点击 / ✕ 关闭，关掉后回到设置对话框。
- **测试**：`test/ui/settings-community-entries.test.js`（无浏览器：入口接线、`openBugReport` / `closeBugReport`、顶栏不再有按钮、层级与提交路径）；`test/ui/settings-entry.e2e.test.js`（真实浏览器：顶栏无按钮、设置里两个入口分别打开 guide / bug 弹层）。

## 37. 克莱门莎（2026-10-09 官方新 6★，自造干员）

2026-10-09 官方上线 6★ 近卫·**本源近卫** `primguard` 克莱门莎（`charId = char_4231_clemnt`，`appellation Clementia`，`displayNumber AE01`，阿戈尔）。她**不在本赛季名册**（`activity_table` 的 `charChessDataDict` 无 `char_4231_clemnt`，只有卫戍协议 band `band_clementia` 带她的名字），因此走**自造干员通道**（`tools/build-data.mjs CUSTOM_CHESS`），与阿斯卡纶（§23）同一套流程，**非 DIY / 正式商店干员**。

### 37.1 数据（最小合并，缓存过期）

- 本地 `.cache/gamedata/excel/character_table.json` / `skill_table.json` 早于她（缓存不入 git，`.gitignore`）。**最小合并**：只把她的 character_table 行 + 三条 `skchr_clemnt_1/2/3` skill_table 行插进缓存（不整表刷新，避免带上游对既有干员的平衡改动与 sortIndex 位移）；`uniequip_table` 无她的模组（`charEquip` 无 `char_4231_clemnt`），`range_table` 的 `4-1` / `3-2`、`uniequip.subProfDict.primguard` 都在。新克隆/CI 直接下载的当前上游已含她，无需此步。
- `CUSTOM_CHESS` 条目：`tier 6`、`identifier 970`、`shopLevelSortId 93`、`baseId chess_char_4231_clemnt_a` / `goldenId chess_char_4231_clemnt_b`、`defaultSkillIndex 2`（**与海为敌 S3**）、`defaultUniEquipId null`（无模组；精锐按 `equipLevel 1` 保留空模组选择表，同望）、`normal E2L1/skill 4`、`golden E2L60/skill 7`。名册因此**恰好 +1 名干员**（`chess=282 / visible=120`，tier 6: 20→21）。
- **归属盟约**：`egirShip`（阿戈尔）/ `indomShip`（不屈）/ `emptyShip`（协防干员）——三者本季均为真实 `bondId`，她的 `nationId egir` 使阿戈尔自动纳员。
- **特质（作战能力）**：`【阿戈尔】【不屈】每叠加3层，本干员防御力+1%` — 复用现成的 `act1autochess_gar_eff_attrByBond` 层数读取器（`bb.bond_id = 'egirShip,indomShip'`, `divide_num 3`, `def 0.01`），**无新 garrison 代码**。

### 37.2 分支 `primguard`（`server/sim/professions.js`）

- 数据 `blockCnt 2`（阻挡两个敌人）、近战物理。PRTS《分支特性信息》本源近卫：「**可以且优先攻击自身阻挡的单位（即使目标处于攻击范围外或为飞行单位）**」。
- 「优先攻击自身阻挡」= **引擎默认**（`ai.js acquireTargets` / `Battle.blockedTargets` 永远把阻挡者列为候选、优先，且不受朝向与自身攻击范围限制）；分支额外把 `canHitFly` 强制为 true（数据里的通用近战 `false` 会盖掉它），使**被它阻挡的飞行单位**也可被选中。官方特性文本「能够阻挡两个敌人，可以造成元素伤害」来自 character_table 的 `description`（缓存把分支特性放在该字段），`classifyAttack` 由职业 `WARRIOR` 判为物理。

### 37.3 技能 / 天赋（完整还原，补引擎）

`server/sim/content/kits/ops/chess_char_4231_clemnt-clemnt.js`（注册于 `kits/index.js`）。数字取 blackboard（普通 Lv4 / 精锐 Lv7），仅文本值用 `textNum` 抓（「移动 N 格」= 3）。

- **生死定夺**（天赋 1）：造成物理伤害时有 `prob_normal` 概率攻击力提升至 `t1_atk_scale`，目标防御力低于初始值时概率提升至 `prob_special` — 一个 `hit` 处理器（每次她造成的物理伤害实例）。
- **习得性防御**（天赋 2）：受到来自**自身前方单位**的物理 / 法术伤害降低 `damage_resistance_normal`，若来源带 `seamonster`（海怪）tag 则降低 `damage_resistance_seamonster`。
- **冲蚀 S1**（攻击回复 AUTO）：下次攻击 ×`atk_scale`，并造成相当于**物理伤害** `ep_damage_ratio` 的侵蚀损伤（`attack.onEachHit` 用实际 `dealt` 结算）。
- **风暴潮 S2**（16 s）：攻击范围扩大（`4-1`），攻速 +`attack_speed`，每次攻击对目标及其周围最多 `attack@max_target`−1 名**地面**敌人造成 ×`attack@aoe_atk_scale` 物理；向前方召唤**放逐舱**，使周围累计不超过 `attack@max_passenger_mass`（8）、最多 `attack@max_passenger_cnt`（15）名地面敌人不断向前移动，移动 **3** 格后消失并留下**漩涡**（半径 1.5，可命中空中）：处于漩涡的敌人移动速度 −70%（`attack@move_speed`）且每秒受到 `attack@water_element`（200）点侵蚀损伤 + ×`attack@physical_atk_scale` 物理。
- **与海为敌 S3**（默认；弹药 `trigger_time` 发）：攻击范围扩大（`3-2`），攻击目标数 +`attack@max_target`（3）；每次攻击对目标 ×`attack@atk_scale` 物理 + 相当于物理伤害 `attack@ep_damage_ratio` 的侵蚀损伤；**当全场有敌人侵蚀损伤爆发时**，消耗 1 发弹药，对爆发目标所在位置及其周围四格内所有地面敌人造成 `audio_trigger_cnt`（3）次 ×`s3_atk_scale` 物理与 ×`ep_damage_scale` 元素伤害；弹药打完结技。

**引擎补充**（`server/sim/buffs.js` / `server/sim/battle/displacement.js`，均带测试）：

- **【放逐】**：`STATUS.banish`（无敌 + 不可阻挡 + 不可移动）+ `Battle.banishEnemy(e,r,c)`（强制传送：目标格须在场上且地面可通行、`grid.findPath` 可达，否则 abort；解除阻挡、重规划路线、`teleport` fx）+ `Battle.banishGroup(enemies,r,c,{maxWeight,maxCount,duration})`（重量预算取 `blockWeight`，贪心取更轻者、超预算跳过、计数封顶）。放逐舱 3 格 / 15 名 / 8 重量由 kit 驱动，abort 时留下的漩涡在原位生成。
- **【漩涡】**：kit 侧地面持续区（`battle.every(1,…)` + `battle.enemiesInRadius` 刷新 `slow −70%`，每秒结算 200 侵蚀损伤 + ×物理），`fx('zone',{kind:'whirlpool'})`；是可选本地官方特效层与程序化层的既有双层规则之一（§35.10）。
- **【强制缴械】**：`FLAG_KEYS`/`STATUS` 新增 `disarmForce`（`ba.disarmedCombat`）——只阻止普通攻击（`ai.js` 与 `disarm` 并列判断），**不是异常状态**：不在 `RESIST_STATUSES` / `ABNORMAL`（不被抵抗缩短、不被流明净化），也无「缴械被无敌清除」的情况。放逐舱对被放逐的敌人同时挂 `banish` + `disarmForce`。
- **侵蚀损伤**：`server/sim/damage.js` 既有元素计量/爆发（`applyElement` / `elementBurst` / `elementHit` hook）已覆盖 `erosion`，**未重复实现**；S3 的爆发反应监听 `elementBurst`（`element === 'erosion'`，全场）。

### 37.4 美术 / 语音 / 特效（本地客户端优先）

- `docs/research/07-assets.json` 增条目（头像/立绘 E0E1+E2、全立绘、三技能图标、战斗脊柱 Front/Back、子职业图标 `sub_primguard_icon`）。`node tools/fetch-assets.mjs --asset-source=mirror` 下到除 **S3 技能图标**以外的全部（镜像 `skill_icon_skchr_clemnt_3.png` 首轮 404/校验失败）；S3 图标改经 `gh-proxy` 直下补齐后重跑离线，`data/assets.json` 三技能图标齐全。
- **语音**：本机 CN / JP 客户端**都没有**她的语音包（CN 客户端 `audio/sound_beta_2` 无 `voice*`，JP 客户端只有 `music`），按 owner 规则回退到 **PRTS CN 镜像**（`torappu.prts.wiki/assets/audio/voice/char_4231_clemnt/cn_019..032.mp3`）补齐 12 个战斗槽（`data/assets.json` 的 `audio.voice.char_4231_clemnt`）。
- **战斗特效**：本机 CN 客户端 `battle/prefabs/effects/clemnt.ab` 存在 → `tools/local-extract/extract.py --only fx/clemnt` 抽出 17 张贴图到 `public/assets/local/fx/clemnt`，`committed-manifest.mjs` 汇总进 `data/local-assets.committed.json`；`node tools/build-fx-official.mjs` 生成表由 90 → **91** 名干员（她的 `explode`/`zone` kinds）。
- **单位 SFX 与语音补全（2026-10-09，`fd9fab31`）**：此前「单位 SFX（普攻 / 命中 / 技能音）未取到」的如实保留项**已闭环**——从本地客户端 / 镜像补到普攻 `p_atk/p_atk_wtsdrvr_n.mp3`、命中 `p_imp/p_imp_wtsdrvr_n.mp3` 与她自己的技能音 `p_skill/p_skill_wtsdrvr_s.mp3`（对应 S3；S1/S2 仍走通用 `b_char_atkboost`），并把 **PRTS CN 的 12 条战斗语音重新编码**（体积更大、音质更好）。`data/assets.json` 的 `audio.sfx.char_4231_clemnt`（`attack` / `hit` / `skills`）与 `audio.voice.char_4231_clemnt` 同步更新，`docs/research/07-assets.json` 记录；`fx` 层的技能图标 / 立绘等**已齐**。

### 37.5 测试 + golden 归属

- `node tools/kit-coverage.mjs --missing` → **307/307** selectable skills、**120/120** chess fully covered。
- 计数：`build-data validateAll`（120 visible）、`test/data.test.js`、`test/backups.test.js`、`test/ui/loadout.test.js`、`test/match/{loadout,pool}.test.js`、`test/sim/loadout.test.js`、`test/content/kits_alt_t6.test.js` 及 §21.30 的 44→46 主动范围技能。
- **golden 归属证明**：先在干净工作树（把本次非 golden 源 + 数据 `git stash`）重算 `node tools/golden.mjs` → **全绿 / 零差异**，证明无既有漂移；恢复后 `--update`：移动 **`roster`（52→53 场，含她的所有 loadout）**、**`bonds`**（阿戈尔 high 场景成员含她）、**`fields`**、**`matches`**（卡池变化），`standins` / `diy` 不变——全部归因于本改动。
- 新增 `test/content/clemnt.test.js`（primguard / 两天赋 / S1 侵蚀 / S2 放逐舱+漩涡 / S3 弹药爆发 / `banishGroup` / `disarmForce` 共 7 条）。
- 交叉引用：分支表与引擎键见 `docs/SIM.md` §8；新干员流程见 `docs/NEW-OPERATOR.md`。

## 38. 同盟文字聊天（等待室 + 局内，2026-10-09）

等待室里此前没有文字聊天（只有局内 `g.emote` → `m.emote` 表情与 `m.ticker` 播报，都不是聊天）。本功能加一条**房间级**纯文本聊天：发送后，**发送者的座位 / 玩家行上方弹出一个语音气泡，几秒后自动消失**（临时性，没有消息列表、没有历史）。等待界面左下角 / 局内「交流」按钮旁各有一个紧凑的输入 + 发送。

### 38.1 协议（`shared/protocol.js`）

- **client → server**：`room.chat { text }`（`text` 必填、去空白后非空、≤ `CHAT_MAX`）。
- **server → client**：`m.chat { from, name, text, at }`，发给该房间**全部成员**——座位上的玩家**和**观战席——等待室与**局内**共用同一条消息（房间级：绝不外泄到别的房间，或玩家不在其中的对局）。`from` 是发送者的 playerId（客户端据此把气泡放到对应座位 / 行），`at` 是服务器时间戳。
- **没有历史帧**：服务器不缓存、不回放；后进入（含重连）的成员只会收到**之后**的新消息；房间一旦销毁，之前的消息无处可寻。

### 38.2 校验与限额（`server/lobby.js`）

- 长度：`CHAT_MAX`（100 字符，UTF-16）；协议层超长 → `BAD_MSG`；服务端清洗后为空或只剩无意义字符 → 新的 `ERR.BAD_CHAT`。
- 控制字符 / 双向 / 零宽字符与孤立代理项在服务端剥离，空白折叠，NFC 归一。转义不够：**绝不发送 HTML**，客户端也只按纯文本渲染（Preact 转义，不 `innerHTML`）。
- 每条按会话滑动窗口限流：每 `CHAT_RATE_WINDOW_MS`（10 s）最多 `CHAT_RATE_LIMIT`（5）条，超出 → `ERR.RATE`（客户端提示「已发送过快，请稍候」）。可用 `chatRateLimit` / `chatRateWindowMs` 选项调整。
- 观战席可以发言（`room.chat` 不是 `g.*`，不被 `SPECTATOR` 拒绝；只在不在房间时 `NOT_IN_ROOM`）。发送即广播给当前房间成员；离开房间（`memberSessions` 只路由当前成员、且要求 `session.roomCode === room.code`）后不再收到。
- 处理函数**只广播** `m.chat`：不写任何房间缓冲、不排队、不落盘（见 §38.4）。

### 38.3 客户端：临时气泡（`public/js/ui/chat.js`）

- 纯函数：`chatMessage(msg, seq, at)` 归一化入站帧；`activeChatBubbles(chat, now, ttl)` 返回「此刻活着的」气泡 `from → { text, name, seq, at }`（每位发送者取最新一条、未过 `CHAT_BUBBLE_MS` = 5000 ms 的）。`main.js` 把 `m.chat` 存成带 `seq` / 到达时间 `at` 的事件（与 `emotes` 同一套），组件据此渲染；超过 TTL 就不再被选中，自然消失。
- `ChatBubble`：一条临时气泡（文字，`is-own` 高亮），CSS 动画按 `--chat-ttl` 弹出→停留→淡出；由父组件按 `seq` 做 key，新消息重挂载并重新弹出。
- **等待室**（`screens/room.js`）：发送者若有座位，气泡浮在**该座位卡上方的空白条里**（P1–P4 四张卡上方各一个，排成一行，`.seat__chat` 用 `bottom: calc(100% + .08rem)` 并 **`justify-content: center` 水平居中于该卡片**）——不压住卡片自身的 `P1 SEAT 01` / 名字 / 内容，且一眼能看出它属于下面哪张卡。观战者没有座位 → 气泡落到 `观战席` 下拉里其名字那一行（`.specdock__chat`）。自己的消息同样出现在自己的座位 / 观战行。座位卡 / 难度 / 准备按钮不受影响。
- **局内**（`screens/game.js`）：气泡**绝对定位在发送者那一行的右侧并垂直居中于该行**（`TeamPanel` 的 `.team__chat`：`left: calc(100% + .06rem); top: 50%; transform: translateY(-50%)`）。因为 `.team` 的 `align-items: stretch` 让每行等宽，各行的 `left` 偏移一致，气泡排成一条清楚的纵列、明显属于各自那一行；既压不到该行的头像 / 等级 / 名字，也不在文档流里、不会推动战场。观战者同样落到 `观战席` 行的其名字处。表情面板与其精灵布局原样不动。
- **无移动特效（只淡入淡出）**：气泡出现 / 消失**只做透明度淡入淡出**——`@keyframes cbubble-life` 里只有 `opacity`，**没有** `transform` / `translate` / `scale` / `rotate`（没有弹出、滑动、缩放）。因此气泡**一出现就在最终锚点上**，不会漂移；`transform: translateY(-50%)`（局内垂直居中）是静态定位，不是动画。TTL 仍为 `CHAT_BUBBLE_MS` = 5000 ms。
- **不滚动**：气泡自动适应宽度并**换行**；文字过长时**按行截断**（`.cbubble` 的 `-webkit-line-clamp: 6` + `overflow: hidden`）而不是出现滚动条。气泡与聊天 dock / 输入区都显式 `overflow: visible|hidden`，绝无 `overflow: auto|scroll`。（`test/ui/chat.test.js` 有静态断言守住锚点、居中、无 transform 动画与不滚动。）
- **可折叠输入（两屏一致）**：等待室与局内用的是**同一个** `ChatDock`（`public/js/ui/chat.js`）——一行 `▸ 聊天` 标题（三角 + 聊天图标），点开才显示输入框 + `发送`，再点收起。等待室把它放在左下角（`.room-chat`），局内放在「交流」旁（`.gm-chat`），样式（`brackets`/pill、三角形、图标）与位置一致。**每次都默认收起、不记忆开关**：不读 / 不写 `localStorage`，因此返回玩家残留的旧 `sp.pref.chatOpen = true` 也不会让它在加载时自动展开。一次点击即可输入，Enter 仍然发送。
- 纯文本渲染（绝不 `innerHTML` 玩家文本）；换房间 / 离开时清空 store 的 `chat`。
- 旧客户端不知道 `m.chat`：客户端对未知类型的处理是**忽略**（`net.js` 只 `_emit(t, msg)`，无监听者即丢弃），不报错、不打断——确认向后兼容。

### 38.4 持久化：不入库、不落盘、不留历史

**聊天仅存于房间内存（且只是服务器转瞬的广播帧），不入库、不落盘，房间结束即清空。** 服务器**不保留任何聊天缓冲**：`server/lobby.js` 的 `chat()` 校验后直接广播 `m.chat`，房间 / 会话都不留副本；`disposeRoom()` 之后什么都查不到。**绝不写入 SQLite / `var/*.db`**：`server/db.mjs` 与 `CommunityService` 只保留 `changelog` / `bug_reports` / `bug_uploads` 三表，**不得新增聊天表**；聊天也不经过任何会持久化它的路径，也不写日记 / 快照。`test/lobby-chat.test.js` 用两条断言强制这一点：聊天在不带 DB 的服务器上工作，且 `server/db.mjs` / `server/community.js` 不含任何聊天 / 表引用、`server/lobby.js` 无 SQL / 落盘 / 房间聊天缓冲。

### 38.5 相关文件

- `shared/constants.js`（`CHAT_MAX` / `CHAT_RATE_WINDOW_MS` / `CHAT_RATE_LIMIT` / `CHAT_BUBBLE_MS`、`ERR.BAD_CHAT` + `ERR_TEXT`）
- `shared/protocol.js`（C2S `room.chat`；S2C `m.chat`）
- `server/lobby.js`（`chat()`、`LOBBY_DEFAULTS.chatRate*`）、`server/http/config.js`（选项透传）
- `public/js/ui/chat.js`、`public/js/screens/room.js`、`public/js/screens/game.js`、`public/js/ui/teamPanel.js`、`public/js/main.js`、`public/js/store.js`、`public/js/ui/components.js`（`chat` / `send` 图标）
- `public/css/screens/room.css`（`.room-chat` / `.seat__chat` / `.cbubble`）、`public/css/screens/game.css`（`.gm-chat` / `.team__chat`）
- 测试：`test/lobby-chat.test.js`（协议 / 长度 / 限流 / 广播范围 / 无历史 / 局内 / 不入库）、`test/ui/chat.test.js`（归一化 + 气泡生命周期）
- i18n（四语包）：`聊天` / `发送` / `说点什么…` / `已发送过快，请稍候` / `发言内容无效`

## 39. 上游 feedback6 / feedback7 合并且「永不合并」清单（2026-10-09/11；§39.2 另含 0.2.4-dev「道具牌库卡白给」一条）

本节是**索引**：合并的完整、逐批记录（上游提交范围 / HEAD、取用的提交、**跳过的提交与原因**、冲突与解法、每批的 golden 变动、产生的本地提交）统一写在 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)。此后**每并入一批都在那里新增一节**；本节只留决策与清单。

### 39.1 合并方式（选择性 cherry-pick）

- 不整分支 rebase：按上游提交逐一 triage（`OK` / `OKg`（会动 golden）/ `SKIP` + 原因），把 `OK` 的提交**保留作者与提交信息** cherry-pick 到 `ours`，再适配本分支；golden 先做**归属证明**、再在专门提交里重算（`docs/AI-WORKFLOW.md` §b）。
- 逐批：**feedback5**（整分支合并 `e3bd9de7`，§33）→ **feedback6 选择性**（R21A / R21E×3 / R21H / R21D，跳 R21B（本分支已有）/ R21C / R21F / R21G / R21P）→ **0.3.0**（我们的功能版，§36–§38）→ **Group A**（上游战斗修复）→ **feedback7 R22 批**（G-TOOLS / G-UI / G-SMALL / stats / UIBACK / GHSIM / OSIM / RENDER / HUD / FIELDS / LATE / VOICES / dober + 失衡 / 推拉滑动）→ **Group C / R23**（R23-TOAST / R23-TICK / R23-DRAGSNAP）。
- 适配落在我们文件的地方（`render/units.js`、`skills.js`、某个 kit、某个测试、打包）以**本分支实现为准**，上游对应提交记为 `SKIP`（原因见 UPSTREAM-MERGES §4）。

### 39.2 永不合并（owner 排除）

| 项 | 上游证据 | 说明 |
|---|---|---|
| **#149 盟约收起**（可折叠盟约条） | upstream `bondsCollapsed` / `bonds-toggle` / `gm__bond-list` / `match-bond-strip` | 盟约条**永久显示并居中**；见 §22。 |
| **最近的同盟**（recent-alliance chips） | 我们已下架的自有功能 | 不得回归；见 §22。 |
| **上游版克莱门莎（Clementia）** | `2e122873` / `0b0ce4fb` / `ba5b998a` | **保留我们的 `char_4231_clemnt`**（§37）；不取上游的官方数据版本。 |
| **R21P 满潜** | `806a0477` / 合并 `b05845f5` | 不采用「全员满潜能」；本分支自有权能规则。 |
| **R22-LOADOUT（潜能 / 练度）** | `7e09c63d`、`ec0a2fc6`、`96d9441f`、`7a0937e3`、`519f04e2`、`dc336f24`、`8e2b981e`、`4f8f5d2a`、`9f36db32`、`4d63e9d5`、`66297106` | **owner 排除**「干员调配」里每名干员的潜能 / 练度自选界面；本批未并入。 |
| **设置 → 问题反馈 / DIAGNOSTICS（复制诊断信息）** | `3f884412`（本分支 R22 port `2ef6339b`，UPSTREAM-MERGES §4） | **已下架**（`60e9eab8`）：我们设置里的「bug提交」（§36.8）已覆盖报 bug，重复的 section 不得回归（UPSTREAM-MERGES §6「Deliberate divergence」）；自检 `public/js/ui/settings.js` 不含 `ISSUES_URL` / `set-diag` / 「复制诊断信息」。 |
| **上游的 设置 按钮位置（在 玩法说明 左边）** | `911e4bff`（`a9a1592a`） | **我们把 设置 移到 档案 chip 旁**（顶栏右侧分组；房间在邀请码旁），不恢复上游的中间位置（UPSTREAM-MERGES §0/§6）。 |
| **本局禁用盟约被强制失效** | upstream `bondsMeta.js` `computeBonds` 里 `if (gd.modeInactiveBonds.has(id)) continue;`（`01a44cd2` 初始导入，`upstreamm/master` `1db8e510` 仍在）；本局禁用 UI `b4fa21a0` / `695ece26`、`offBondCounts` / 灰色盘 `c0cc1d61` | **owner 2026-10-11 决定：禁的只是「不被提供」（池 / 策略草稿 / bot），不得让本已激活的盟约失效**（「被 ban 的盟约即使被激活也无法生效」）。`computeBonds` 现在计算每一个盟约：达到阈值的本局禁用盟约 `active` 并**生效**；未达阈值仍不生效（层数照旧进入战斗，§27）。未激活时对话仍读「本局禁用」。**与 §22 的「盟约收起」不是同一改动家族**（那是可折叠盟约条）。自检：`computeBonds` 不含 `modeInactiveBonds.has(id)) continue`；`battleBonds` 不强制 `active: false`。详见 UPSTREAM-MERGES §0/§6。 |
| **上游道具牌库把「白给装备」也卡库存**（`6bfc08270c`，issue #488） | upstream `6bfc08270c`「0.2.4-dev: round-29 community fixes and the official shared card pool」：`server/match/player/acquire.js` 的 `acquireItem` 加 `this.m.itemPool.canGain`（**无 `requirePool` 出口**），`server/match/effectsMeta.js` 的 `grantItem` 只透传 source / toTemp / deferMerge，于是调用方已传的 `requirePool:false`（`bands/meta.js` 策略「变形者集群」R5/10/15、`garrisons/meta.js` `H.SERVER_GAIN_EQUIP` 缪尔赛思 `<获得时>` `garrison_76_a/b`）被丢掉；**#488**（saltwmc，2026-10-11）：池里只有 3 张「变形同构体」，缪缪 / 变形者集群发到第 3 张后不再发放（投资人 ×2 更早耗尽），弹「装备库存不足，未获得该装备」。 | **`<获得时>` / 策略的白给不是商店购买，官方文本没有库存前提。** 我们保持白给不受道具库存约束：本分支 `acquireItem` **没有 `itemPool` 检查**，缪尔赛思的特质与「变形者集群」每次都发「变形同构体」（特质累计可超过上游上限 3）。若日后并入道具牌库，必须把 `requirePool` 透传到 `acquireItem`，并让特质 / 策略发放传 `requirePool:false`。自检：`grep -rn "itemPool\|canGain" server` 为空（或上述发放传 `requirePool:false`）；`test/content/garrisons_meta.test.js` #488。详见 UPSTREAM-MERGES §0。 |

### 39.3 本批保留的决断（要点）

- **失衡（UNBALANCE）+ 推 / 拉滑动**：按官方在位移时间内禁锢（不走动 / 不普攻），静态刚体 0.1 s 下限，客户端滑动用同一段游戏时间；见 UPSTREAM-MERGES §4、`docs/SIM.md`（位移 / 失衡）。
- **整帧攻击间隔 / 时间技力**：整帧数取整整那么多帧（1 s = 30 帧），引擎与客户端显示常量同步。
- **日语语音**：新增 `audio.voiceJp` 与 设置 → 语音语言（我们独有的打包方式）；见 `docs/ASSETS.md`。
- **顶栏胶囊**：`已解决 = 击杀 + 漏怪`（只数本回合排定敌人）。
- **数据可复现**：`node tools/build-data.mjs --offline` 后 `git status` 为空（`data/enemies.json` 的漂移已修）。

## 40. 对局统计（服务器 SQLite，账号 / 游客；2026-10-11）

「统计数据」页（上游 PR #323 的本地版，见 §33 的合并记录）在本分支**同步到服务器**：每个打完的对局是**一条归一化记录**（`shared/stats.js`，与页面渲染的 schema 完全一致），存在账号 SQLite 的 `match_stats` 表里，并**归属到一个 owner**。

### 40.1 记录 schema

沿用上游 schema（**不改字段**）：`end`（`settled` / `quit`）、帧（`modeId` / `difficulty` / `seed` / `durationMs` / `victory` / `roundsPassed` / `hiddenReached` / `hiddenCleared` / `reason` / `roomMode` / `selfId`）、`players[]`（每名玩家的 `bandId` / `title{id}` / `lineup[]` / `bonds[]` / `stats{}` 与代号）。归一化在 `shared/stats.js normalizeRecord`（严格 schema：未知字段丢弃、每个字符串 / 列表有界）。

### 40.2 存储（`server/db.mjs` schema v5）

- 表 `match_stats (id, account_id, guest_id, record_id, mode, difficulty, seed, result, rounds, started_at, ended_at, payload_json, created_at)`。
- **owner 恰有一个非空**：已登录玩家 = `account_id`（外键，账号删除级联）；游客 = `guest_id`（见 §40.4）。`CHECK ((account_id IS NULL) <> (guest_id IS NULL))`。
- `record_id` = 记录自身的去重 id（`recordId` = seed + 历时 + 模式 + 回合 + 胜负 + 自己），`(owner, record_id)` 唯一 → 重复提交（重连重放）被 `INSERT OR IGNORE` 忽略。
- `payload_json` = 归一化记录本体；`mode` / `difficulty` / `seed` / `result` / `rounds` / `started_at` / `ended_at` 是用于排序 / 裁剪的帧字段。
- 索引：`(account_id, ended_at DESC, id DESC)`、`(guest_id, ended_at DESC, id DESC)`，以及两个 `(owner, record_id)` 唯一索引。

### 40.3 上限（上游规则，数量 2×，`shared/constants.js`）

`STATS_MAINLINE = { maxRecords: 1000, fullKeep: 30, maxChars: 800_000 }`，`STATS_SCALE = 2` →
`STATS_MAX_RECORDS = 2000` / `STATS_FULL_KEEP = 60` / `STATS_MAX_CHARS = 1_600_000`。
`server/stats.js StatsService` 按 owner 执行：只保留最新 2000 行；只有最新 60 行保留完整 `players`（更老的压成摘要 `compactRecord`）；所有行的 `payload_json` 合计超过 1.6M 字符时从**最旧**的行开始删（最新一行永远保留）。客户端 localStorage 用同一组值（离线回退）。

### 40.4 游客身份

游客没有账号，但有**会话身份**：`server/net.js` 每个 session 的 `playerId`（客户端持久化重连 token，重连窗口内 `hello` 复用同一 session），因此**游客记录跨对局、跨重连存活**，按 `playerId` 归属——复用仓库已有的身份，未新造 id。**边界**：会话被回收（空闲超时约 10 分钟 / 服务器重启）后游客拿到新的 `playerId`，旧记录不再归属新身份；`stats.view` 也只解析**当前在线**的 session（`net.js presenceOnline`，登录玩家还有 5 分钟 presence grace）。

### 40.5 协议（`shared/protocol.js` + `server/lobby.js`）

C2S：
- `stats.submit { record }` — 一条归一化记录（结构上限 `players ≤ 6`，其余由 `normalizeRecord` 严格裁剪）。归属到 session 的 owner；按 `record_id` 去重；记录无法抢救 → `BAD_STATS`。
- `stats.list { limit? }` — 自己的记录，最新在前，上限 `STATS_LIST_LIMIT`（= 2000）。
- `stats.clear {}` — 删除自己的全部记录。
- `stats.view { name }` — 按**公开代号**读取另一个**在线**玩家的公开记录；解析不到 / 同名多人 → `BAD_TARGET`。

S2C：`stats.records { scope: 'self' | 'other', owner: { name, role, guest }, records: [...] }`（`stats.list` / `stats.view` 的应答，带请求 `rid`；`stats.submit` / `stats.clear` 回 `ok`）。

### 40.6 客户端

- 每打完一局（`recordResult` / `recordQuit`）先写本机 localStorage，再由 `ui/statsSync.js` **上传**（按 `record_id` 去重，成功后在本机 `sp.pref.statsSync` 标记）。
- **登录时把本地积压一次性补传**（去重），归入账号；游客照常上传（归属游客身份）。两条路径都只依赖 `welcome` / `auth.ok` 触发。
- 统计页**登录 / 游客都优先读服务器**（`stats.list`），断网回退 localStorage；`stats.view` 读他人。
- 导出 / 导入仍针对本机（导入的新记录随后补传）。
- 大厅「在线玩家」里**已登录玩家**的行可点开其公开记录（只读：隐藏导出 / 导入 / 清空）。

### 40.7 隐私

- `stats.records` 只含**游戏内已公开字段**（记录本体）；`owner` 只有 `name` / `role` / `guest`。
- **绝不**跨网传账号 id、email、token 或会话密钥；`stats.view` 也只按当前在线 session 解析，不按账号名录遍历。
- 记录里本就有的队友代号（结算界面已向同局展示）随记录保存；本地导出文件同理。

> **与主线的设计差异（本分支独有）**：服务端账号体系与「对局统计迁到服务端」都是**本分支在主线之外的偏离**——主线是纯本机、无账号，其统计页是上游 PR #323 的本地版。本节记录的归属键、2× 上限、`localStorage` 离线兜底与「只暴露游戏内已公开字段」的隐私取舍，加上「做成可选后端」的上游建议，汇总在 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)「账号与统计：与主线的设计差异」一节。

## 41. 本局禁用盟约：只禁「提供」，不禁「生效」（owner 决定，2026-10-11）

> 报告（附截图）：局内 **附加盟约** 详情对**本局禁用**的盟约（如**灵巧**）显示「层数 0 · 本局禁用」与提示「本模式下该盟约不会激活（其干员仍可能因所属的其他盟约出现）」。owner：**「被 ban 的盟约即使被激活也无法生效」是错的** —— ban 只针对它**不被提供 / 不通过常规途径激活**，不该让一个**本来会激活**的盟约**失效**。

- **根因（上游行为，非本次合并引入）**：`server/match/bondsMeta.js` 的 `computeBonds` 里 `if (gd.modeInactiveBonds.has(id)) continue;` 跳过模式的静态 `inactiveBondIds`（初始导入 `01a44cd2`，`upstreamm/master` `1db8e510` 仍在）；由此进入战斗的 `PlayerState.battleBonds` 还把这类盟约当**未激活条目**带进战斗（0.1.3 §27 的层数修复）。我们的每一次合并（feedback5 / Group A / R22 / R23）都**原样保留**了它 —— **不是我们引入的回归**，是长期沿用的上游规则；owner 现在决定改掉。
- **修法**：`computeBonds` **计算每一个盟约**（含静态禁用表）。达到阈值的本局禁用盟约 `active: true`，战斗输入即 `active: true`，`sim/content/bonds/*` 的效果照常生效（所有效果都以 `tier ≥ 1` 为门）。未达阈值者仍 `active: false`、不生效；其层数照旧随战斗输入带入（§27 不变）。`battleBonds` 不再强制 `active: false`，只是 `bondSnapshot(computeBonds)`。
- **ban 的正当作用不变**：`server/match/pool.js` 仍把静态禁用盟约排除出每局禁用抽样与「仅剩禁用盟约的干员」的下架判定；`server/match/bot.js` 仍不选围绕它的策略；策略草稿仍标「本局禁用」（仍可选）。
- **视图**：`bondList` 对**未激活**的本局禁用盟约仍标 `off: true`（灰色带 ✕ 盘 + 层数）；**已激活**者按普通激活盟约显示。盟约详情弹窗未激活时仍读「本局禁用」；已激活时读「已激活」并给出「当前效果」，提示语改为「本模式下该盟约不会通过常规途径激活，但已被激活，其效果生效」。干员卡 / 盟约标签对**已激活**的本局禁用盟约不再置灰（`BondChips` 以 `e.active` 优先）。
- **测试**：`test/match/feedback3-off-bonds.test.js`（达到阈值 → `active` + 战斗输入 `active: true` + `bond:skillfulShip` buff 真的生效；未达阈值 → 不生效且层数照旧进入战斗；`bondList` 的 `off` 标记；BOARD_AND_DECK 计数不变），`test/match/bonds.test.js`（FUNNY 的静态禁用盟约现被计算、未达阈值 `active: false`），`test/ui/feedback1b-bonds.test.js`（三名奥术**激活**该盟约、标签不再是本局禁用；一名仍为本局禁用；弹窗已激活时给出当前效果与新提示语）。
- **golden 归属证明与变动**：先**只回退这一份源码**（`git stash push -- server/match/bondsMeta.js server/match/player/round.js public/js/ui/bondStrip.js public/js/ui/detailPanel.js`）→ `node tools/golden.mjs` **零差异**（roster 53 / bonds 46 / fields 22 / matches 18 / standins 10 / diy 129 全部 match）；恢复后 `node tools/golden.mjs --update`，变动恰为**本局禁用盟约激活**所及：**roster 9**（005、011、017、023、029、035、041、047、053）、**matches 3**（solo-FUNNY-1、solo-FUNNY-2、coop4-FUNNY-6；`m.public` 的盟约表出现 `arcaneShip` / `soloShip` 等本局禁用项，层数与结果随之变）、**standins 2**（standin-03、standin-09）；bonds / fields / diy 不变（bond-* 场景本就取该盟约可用的模式，见 `tools/golden.mjs` 的模式选择）。无任何引擎 guard 被放宽。
- **合并黑名单**：见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 与本文档 §39.2；自检 —— `computeBonds` 不得含 `modeInactiveBonds.has(id)) continue`，`battleBonds` 不得强制 `active: false`。
