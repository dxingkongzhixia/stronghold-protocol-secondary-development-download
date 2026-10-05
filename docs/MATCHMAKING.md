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
- **野排**：`mm.join` 进池 → 匹配成功由 `createMatchedRoom` 建**临时房**（`room.auto=true`）。**不显示同盟密钥、不进「最近同盟」**（`room.js` 对 auto 房显示「野排队伍 · 对局结束后自动解散」而非 `InviteBox`；`main.js` 只对非 auto 房 `rememberRoom`）；对局结束**自动解散**，想再玩重新排队。
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
| `public/js/main.js` | `auth.ok/error`、`mm.state`、`room.closed{matched-end}` 接线；token 持久化；**重连/会话重置清排队态**；标题页临时 `hello`；**仅非 auto 房 `rememberRoom`** |
| `public/js/screens/title.js` | **重做**：博士代号=账号名；`AccountBox` 折叠登录/注册；空代号→游客随机代号进入 |
| `public/js/screens/lobby.js` | 「搜寻队友」按钮 + `MmOverlay`；游客徽标；**「在线 N」徽标 + 游戏内 `OnlineOverlay`**；**「公开同盟」`PublicAlliances`（4s 轮询 `/online/api` 的 `openRooms`，最多 3 个密钥、点击即加入）**；**建房 `公开 / 不公开` 二选一（`lobby.public`）**；账号弹窗；返回时退池 |
| `public/js/screens/room.js` | 野排房不再显示「同盟密钥」，改「野排队伍 · 对局结束后自动解散」；「同盟密钥」框显示 **公开 / 仅密钥** 徽标（`room.public`） |
| `public/js/screens/game.js` | `commitFacing` 定时器随卸载清理 |
| `public/js/battle/runner.js` | `clear()` 保留未送达的 `b.result`（可重发） |
| `public/js/render/spine.js` | 持续技能被眩晕/冰冻后仍回到技能循环（`_baseName`） |
| `public/js/render/units.js` | 被裁剪单位仍衰减闪光/抖动/血条残影 |
| `public/js/render/board3d/scene.js` `materials.js` | PMREM render target 随场景销毁；`_fitShadow` 空包围盒兜底 |
| `public/js/render/textures.js` | 缓存命中必须是**存活**纹理（被 GC 销毁的会重建） |
| `public/js/ui/account.js` | **新增**：`AccountForm`/`AccountWho`/`AccountDialog`；`logoutAccount` 通知服务端解绑 |
| `public/js/ui/components.js` | `TextField` 支持 `type`；新增 `eye`/`eyeOff`，「眼睛」切换明文/密文 |
| `public/js/preload.js` | **新增**：启动预加载（`collectArtUrls` 分 scope / `preloadImages` 并发+取消）+ `BOOT_VIDEO` 启动视频配置；`main.js` 在**进标题前**加载**全部美术图片**（scope `all` ≈1910 张 / 104MB），带进度条 / 跳过 / 180s 兜底 |
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

- **公开在线数据** `/online/api`（**免令牌**）：返回当前在线玩家（名字 / 是否登录 / 状态 / 房间）+ **可加入的同盟房间 `openRooms`**（`[{ code, difficulty, difficultyName, host, humans }]`，只含**房主设为公开**、**手建 coop、未开局、有空位**的房间，按人数降序、最多 12 条），**不含账号列表、IP、最后登录**；由大厅顶栏「在线 N」徽标的**游戏内浮层** `OnlineOverlay` 每 4s 拉取。**没有独立网页版**（数据来自 `server/admin.js` 的 `buildPublicSnapshot`）。
- **建房可见性（公开 / 不公开）**：大厅「创建同盟」按钮上方有 `公开 / 不公开` 二选一（`public/js/screens/lobby.js`，仅同盟模式显示，选择记忆在 `lobby.public`）；创建时作为 `room.create.public` 发送（`shared/protocol.js` 的**可选**布尔字段，**缺省＝公开**）。服务端存进 `room.public`（`server/lobby.js`：**单人房恒为 `false`**；野排房 `false`；`toState().public` 下发），房间屏「同盟密钥」框据此显示 **公开 / 仅密钥** 徽标（`public/js/screens/room.js`）。**只有 `public:true` 的手建同盟房才会进 `openRooms`。**
- **公开同盟（大厅「加入同盟」区）**：`public/js/screens/lobby.js` 的 `PublicAlliances` 同样 **4s 异步轮询** `/online/api`，把 `openRooms` 里**最多 3 个**密钥显示为 `code-chip`（悬停看「难度 · 人数/4 · 房主」），**点一下即填入密钥并加入**——与「最近的同盟」（本地记录）并列、互不影响；无公开房间时整行不渲染。
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
- `docs/DESIGN.md` / `META.md` 的对应英文规则段落。

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
