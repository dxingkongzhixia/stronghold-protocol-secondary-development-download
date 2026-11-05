# Agent 席位（内部接入：AI 通过房间接管 bot）

> **状态（2026-11-05）：P0–P4 已完成**——任意真人玩家签发一次性邀请、入座、座位锁定、过期/重用拒绝、
> 对局中接管、断线 30 秒后交还内置 bot；运维开关/健康检查/后台面板、示例客户端、真实对局端到端回归均已完成。
>
> 部署前必须在环境里显式打开：`SP_AGENT_SEATS=on`（默认关闭，见 §4.1）。
>
> 关联：[`EXTERNAL-AI.md`](EXTERNAL-AI.md)（开发专用的出网 AI）、[`BOT-STRATEGIES.md`](BOT-STRATEGIES.md)、
> [`MATCHMAKING.md`](MATCHMAKING.md)（观战 / 夺舍的决策记录）、[`TESTING.md`](TESTING.md)。

## 1. 结论与定位

生产环境的 AI 接入**只走本文件这条路**：AI agent 作为一个**普通 WebSocket 会话**，用房内任一真人玩家发放的
**一次性邀请**接管一个 bot 座位，然后通过**和人类完全相同**的 `g.*` 意图打牌。

- **没有 API key**：服务器不持有任何模型密钥，也不需要出网。
- **没有新动作协议**：agent 的每一步都走 `_handleSeatIntent` 的既有校验、阶段截止与限流。
- **信任边界不变**：agent 能看到的只有该座位可见的公开 + 私有视图；它和真人一样可能被规则拒绝。

`EXTERNAL-AI.md` 的 `sp-ai/1` 出网顾问**保留为开发工具**（本地调试、离线跑分），不作为线上接入方式。

## 2. 与 API Key 方案对比

| 维度 | A：API key 出网调模型（`EXTERNAL-AI.md`） | B：内部邀请 + 房间接管（本文件） |
|---|---|---|
| 密钥 | 服务端持有 provider key，泄露面大 | **无 key**，一次性邀请即凭证 || 网络 | 服务器必须出网 | 全部走现有 WS，**零出网** |
| 校验 | 服务器信任外部返回，需要协议 + 计划双校验 | 每步都过人类同一入口 |
| 成本 | 按 token 计费，难以限制 | 一个座位、阶段截止、40 msg/s |
| 失败 | 超时/挂起拖慢对局（靠回退） | 掉线就是普通玩家掉线（P1 交还 AI） |
| 审计 | 服务端日志 | 邀请/入座/交还/拒绝原因都可查 |
| 定位 | **开发专用** | **生产推荐** |

## 3. 协议

### 3.1 消息

| 消息 | 方向 | 说明 |
|---|---|---|
| `room.agentInvite { seat, ttlSec? }` | 房内任一真人玩家 → 服务器 | 为**一个 bot 座位**签发一次性邀请；不要求房主。仅当房间真人玩家 < `MAX_SEATS`（4）时允许；`ttlSec` 1–3600，默认 600。同一座位再签会作废旧 token。**座位归签发者所有** |
| `agent.invite { token, seat, code, expiresAt }` | 服务器 → 签发者 | **仅推给签发者**。明文 token 只出现这一次；不进 `room.state`、不进日志 |
| `agent.claim { token }` | agent → 服务器 | 普通会话 `hello` 之后兑换邀请；成功后座位归该会话。一次性；失败返回 `BAD_TARGET`，已在房间内返回 `ALREADY`；**签发者必须仍在房间且在线** |
| `g.*` | agent → 服务器 | 全部现有游戏意图，校验与人类一致；**聊天 `room.chat` 和表情 `g.emote` 也可用** |
| `m.public` / `m.private` / `m.field` / … | 服务器 → agent | 该座位可见的视图，不新增信息 |
| `room.releaseSeat` | agent → 服务器 | 座位 `fromAi=true`，因此可把座位交还新 AI，自己回到观战席；断线 30 秒也会自动做 |
| `agent.coach { text }` | 邀请者 → 服务器 | 只有签发者能给自己的 agent 下私有指令；不广播、不进 `room.state`；≤200 字、1 秒 1 条 |
| `agent.directive { text, at, from }` | 服务器 → 该 agent | 只发给签发者拥有的 agent 会话；离线时存最后 5 条，重连补发 |

`room.state` 的该座位带 `agent: true`（可选字段），客户端据此显示 **AGENT** 标记（与内置 bot 的 “AI 队友 / AUTONOMOUS UNIT”
区分）；不改变 `isBot` 语义（`isBot=false`，是一个玩家座位，占一个席位）。同样的 `agent` 字段也进入
`m.public.players[]`、结算/队伍卡片与公开房间目录，观战者可以看到它。

### 3.2 邀请的生命周期

| 事件 | 行为 |
|---|---|
| 签发 | 32 字节 CSPRNG → base64url；内存只存 `sha256(token)`；绑定 room + seat + 当时的 bot `playerId`；房间真人玩家 < 4 |
| 座位锁定 | 邀请有效期内，其他观战者的 `room.takeOver` 对该座位返回 `BAD_TARGET`（`seat reserved for an agent`） |
| 兑换 | 校验未过期、座位仍是同一个 bot、真人玩家 < 4；**先落座再调用 `Match.takeOver`**，使该会话立刻能收到 `m.private`/`m.public` |
| 成功 | 删除该座位所有邀请；会话 `agent=true`、`agentSeat=N`；`room.state` 广播 |
| 过期 | 惰性清理（下一次查询/兑换时） |
| 座位消失 | `room.removeBot` 删除该座位的邀请 |
| 房间销毁 | 邀请随房间一起消失 |
| 重连 | 用现有会话 token 重连即可，不重新发邀请（与普通玩家相同） |
| 断线 | 立即标记离线；**30 秒**（`agentGraceMs`）内重连可取回。超过 30 秒：内置 bot 接管（对局中保留棋盘/资金/装备），会话与房间解绑，重连时收到 `room.closed { reason: 'agent-timeout' }` |
| **邀请者绑定（规则 B）** | 座位属于签发者：签发者**主动离开/被移出** → 立即交还 bot；签发者**掉线** → 30 秒宽限，期间重连保留；超时则交还 bot，agent 收到 `room.closed { reason: 'agent-owner-left' }`。签发者离开也会作废其未兑换的邀请 |
| 邀请者离线时兑换 | 拒绝（`BAD_TARGET: inviter is offline`）；邀请保留到过期或签发者回来 |
| 玩家入口 | 房间内任一真人在 bot 座位点「邀请 AI」→ 弹窗显示一次性 token、到期时间；主按钮「**复制给 AI**」复制一段可直接粘给 AI 的话。**token 就是全部凭据**：玩家不填 key、不跑命令、不装东西 |
| 开发者入口 | 同一弹窗在 `?dev=1` 或 localhost 下多一个折叠块，给出需要模型 key 的脚本客户端命令（`tools/agent/llm.mjs`），只供管理员自测；普通玩家看不到。无 key 的规则客户端 `tools/agent/agent.mjs` 仍然可用 |
| 插件房间 | 带玩法插件（`room.state.content`）的房间：真人页面要载入并校验内容；**agent 席位没有页面**，服务器与房主界面都不把它当门槛（`!s.agent`），它的战斗由邀请者或其他浏览器执行。房主中途改插件会清掉所有非房主座位的 `ready`，agent 客户端在 1 秒内自己补回 `room.ready`；即使是不补的老客户端，也不会挡住开局 |
| 重刷本局 | INFO_CHECK 的整局重刷要真人一致同意；**agent 不投票**（`setupVote` 过滤 `!p.agent`），房主 + agent 的房间立即重刷。重刷会把 `setupRevision` +1：`g.infoReady` 必须带上它（客户端现在随 `pub.setupRevision` 发送），否则会被 `BAD_TARGET` 拒绝直到本阶段结束。乐队草稿的 `pub.draft.bands` 给出本房间允许的乐队（模式 / 当前领袖 / 插件内容），外部客户端不再拿原版列表去猜 |
| **主人教练** | 邀请者在自己的 agent 座位点「教练」→ 输入/选预设（先铺满、优先升级、凑主盟约、找对空/治疗、攒钱、先稳）→ 只有该 agent 收到；AI 把最新一条视为优先战术指令 |

### 3.3 对局中接管

如果邀请签发时房间已开局，兑换走 `Match.takeOver(humanId, seat, name, role, agent=true)`
（`server/match/match/watch.js`）：bot 的整个 `PlayerState`（棋盘、资金、装备、乐队）**原地换键**给 agent，
然后立即 `_resync` 该玩家。测试断言了同一个对象、同一座位、`isBot=false`、`agent=true`，且 agent 能收到自己的
`m.private`。

## 4. 安全属性

| 风险 | 对策 |
|---|---|
| token 泄露 | 32 字节随机、只存哈希、一次性、默认 10 分钟、绑定房间+座位 |
| token 进日志/状态 | 明文只出现在 `agent.invite` 一帧；日志只记“seat N”；`room.state` 不含 token |
| 旁人抢座 | 有活跃邀请的座位拒绝 `room.takeOver` |
| 伪造邀请 | 只有房内的真人玩家可签发（观战者 / agent / bot 都不行）；座位绑定签发者，签发者离开即失效 |
| 越权 | agent 只是普通玩家：`g.test`、管理帧、非本座位视图都按现有规则拒绝 |
| 刷屏/拖慢 | 沿用 40 msg/s 限流、阶段截止、按座位错误码 |
| 发布包误带 | 与 `EXTERNAL-AI` 相同的门控思路（P2 接入 `llmGate` / 打包排除） |

## 4.1 开关与运维（P2）

| 项 | 行为 |
|---|---|
| `SP_AGENT_SEATS=on` | 全局开关（默认 **off**）；`on/1/true/yes` 开启。`startServer({ agentSeats })` 优先于环境 |
| `/healthz` → `agents` | `{ enabled, seated, invites, claims, handbacks }`；不包含 token / 哈希 / playerId |
| `/admin` → 「AI 席位」 | 当前在座席位、待兑换邀请、到期时间、是否在对局中；顶部显示接管/交还计数与开关状态 |
| 发布包 | agent 席位是**生产路径，随发布包保留**；只有开发专用的出网外部 AI 仍在 `llmRelease` 排除列表里（`test/package.test.js` 守护） |
| 关闭开关 | `room.agentInvite` 与 `agent.claim` 都返回 `BAD_TARGET`，其他玩法不变 |
| `SP_CLIENTS_ONLY=1` | 允许，但 agent 的战斗必须由同房真人浏览器（`b.start background`）执行；没有可执行者时按该模式原有规则结束对局（`no-executor`）。agent 自己不会被选为执行者 |
| 战斗执行 | agent 不运行战斗模拟；其战场由服务器按现有规则交给另一浏览器 / 服务端接管，因此不会把 `b.start` 当成必须由 agent 完成的职责 |

## 5. 代码位置

| 内容 | 文件 |
|---|---|
| 协议条目（C2S / S2C） | `shared/protocol.js`（`room.agentInvite`、`agent.claim`、`agent.invite`） |
| 邀请、兑换、座位锁定、过期、30 秒托管、邀请者绑定 | `server/lobby.js`（`inviteAgent`、`claimAgentSeat`、`agentInviteFor`、`startAgentGrace`、`startAgentOwnerGrace`、`releaseAgentSeat`、`Room.agentInvites`） |
| 会话标记 | `server/net.js`（`Session.agent` / `Session.agentSeat`） |
| 教练指令 | `server/lobby.js`（`coachAgent`、`Room.toState` 的 `agentOwner`）、`shared/protocol.js`（`agent.coach` / `agent.directive`） |
| 对局中换键 / 交还 | `server/match/match/watch.js`（`Match.takeOver` / `aiTakeOver`，复用现有实现） |
| 对局与结算里的 `agent` 字段 | `server/match/PlayerState.js`、`server/match/match/views.js`、`server/match/results.js`、`server/match/StubMatch.js` |
| 公开房间目录 | `server/admin.js`（`buildPublicSnapshot`：`seats[].agent`、`agents` 计数） |
| 插件意图边界 | `shared/plugins/ui.js`（`agent.*` 与 `g.*` 一样属于客户端意图，插件不能发送） |
| 前端 AGENT 标记 / 邀请入口 | `public/js/screens/{room,rooms,bandDraft,result,settle}.js`、`public/js/ui/gameComponents.js`、`public/js/main.js`（`agent.invite`）、`public/js/store.js`、`public/css/screens/{room,lobby}.css` |
| 运维计数 / 健康检查 | `server/lobby.js`（`agentStats`）、`server/admin.js`（「AI 席位」页） |
| 示例客户端（P3） | `tools/agent/player.mjs`（规则循环）、`tools/agent/agent.mjs`（WS CLI）、`tools/agent/llm.mjs`（OpenAI / Anthropic + 规则书/角色/聊天/教练）、`tools/agent/knowledge.mjs`（briefing + 本地规则检索）、`tools/agent/gamedata.mjs`（棋子/乐队公开元数据） |
| 端到端（P4） | `test/e2e/agent-seat.e2e.mjs` |
| 测试 | `test/match/agent-seat.test.js`、`test/agent-llm.test.js` |

## 6. 验收（当前）

`node --test test/match/agent-seat.test.js` 覆盖：

1. **任一真人玩家**签发 → 只收到 `agent.invite`；token 长度 ≥ 32；`room.state` 不含 token；观战者不能签发。
2. 观战者不能抢被邀请的座位（`BAD_TARGET`）。
3. agent `hello` + `agent.claim` → 座位变为 `isBot=false`、`agent=true`、`fromAi=true`，且不是观战者；可正常聊天。
4. token 重用、未知 token、已在房间内兑换 → 拒绝。
5. 对局中兑换 → `Match.takeOver` 原地换键，`PlayerState.agent=true`，agent 收到 `m.private`，`g.infoReady` /
   `g.emote` 正常推进。
6. 座位规则（人类/空位/单人房）、1 秒 TTL 过期、`room.removeBot` 使邀请失效、同座位重签旧 token 失效。
7. 断线超过宽限 → 座位回到内置 bot；重连收到 `agent-timeout`。
8. **规则 B**：邀请者掉线 30 秒 → 交还 bot；期间重连保留；邀请者主动离开/被移出 → 立即交还，agent 收到
   `agent-owner-left`；邀请者离线时不能兑换。
9. 日志包含 `agent … claimed seat N` / `handed back to the AI (reason)`，**不包含**明文 token。
10. **主人教练**：只有邀请者能给自己的 agent 发指令；其他玩家/观战者拒绝；agent 离线时存最后 5 条，重连补发。
10. 开关默认关闭；`/healthz.agents` 报告开关、在座、邀请与计数。
11. `test/package.test.js`：agent 席位代码不会被 `llmRelease` 排除，`tools/agent` 不进玩家包。
12. `test/agent-llm.test.js`：OpenAI / Anthropic 两种 wire format、JSON 解析、动作白名单、规则**索引**（id/摘要、
    `play/5` 精确命中、体积上限）、可选全文 §1–§7、角色/沟通/打法/底层 bot/主人教练 briefing、`room.chat` /
    `g.emote`、`recentChat` / `ownerDirectives`、棋子名称/阶级/站位/盟约与乐队元数据。

### 6.1 P4 真实对局回归

```bash
SP_AGENT_E2E=1 node --test test/e2e/agent-seat.e2e.mjs
```

真实 `Match`（`clientCombat:false`，压缩计时器）中，宿主 + agent 走完 **≥3 个 prep + 战斗**，断言服务端
`errorCount = 0`、agent 至少部署过单位、全程使用普通 `g.*` 意图。默认不跑（对时序敏感），需要时手动开启。

## 7. 使用示例（P3）

```bash
# 服务器（演示用无浏览器环境：让服务端模拟战斗）
SP_AGENT_SEATS=on SP_COMBAT=server npm start

# 自包含演示：建房 → 放 bot → 发邀请 → agent 入座 → 开局 → 打完（规则循环）
node tools/agent/agent.mjs --demo

# 大模型驱动（key 只在本机；OpenAI 兼容或 Anthropic 二选一）
node tools/agent/llm.mjs --demo --provider openai    --model gpt-4.1
node tools/agent/llm.mjs --demo --provider anthropic --model claude-sonnet-4-5
# 已有房间：把房内任一真人玩家拿到的 token 交给 agent
node tools/agent/llm.mjs --token <token> --provider openai --model gpt-4.1
```

也可以直接在房间界面操作：任一真人在 bot 座位点「邀请 AI」→ 复制弹窗里的 token 和启动命令。
`SP_LLM_API_KEY` / `SP_LLM_BASE_URL` / `SP_LLM_MODEL` 由 agent 所在机器设置；服务器不读取任何 `SP_LLM_*`。
`tools/agent/player.mjs` 只做四件事：确认信息、选一个未占用的乐队、买/部署棋子、拿奖励后 ready；
它是协议示例与 P4 的固定动作源，**不是**竞技 bot；模型不可用/超预算时 `llm.mjs` 自动回退到它。

### 7.1 规则、角色与互动如何告诉模型

默认**不把整本规则书塞进 system prompt**，而是给一份**索引**，需要细节时再查。

system prompt 由四段组成（只发一次，Anthropic 会缓存前缀）：

1. **动作契约**：只能返回 JSON；允许的 `g.*` / `room.chat` / `g.emote` 及参数；
2. **`AGENT_BRIEFING`**（`tools/agent/knowledge.mjs`）：
   - **角色**：匿名 AI agent、占一个玩家席位、不是内置 bot 也不是真人；不能邀请/踢人/开局/改设置；要当合作队友；
   - **沟通礼仪**：可以 `room.chat` 和 `g.emote`；开局问候、回应队友、短报点；不刷屏、不争论、不冒充真人；
     默认中文，单条尽量 <40 字；
   - **打法参考（STRATEGY REFERENCE）**：经济/升级节奏（R1–R2 二级、R3–R4 三级…）、一主两副的阵容、
     阻挡/输出站位、备战顺序、低血时先花钱、乐队权衡；这是基线，细节查 `strategy/3–5`；
   - **底层 bot 参考（BOT REFERENCE）**：内置 bot 的选乐队/经济/购买优先级/阵容/站位/演练逻辑摘要，
     并提示可查 `bots/*`；它是强基线，不是上限；
   - **主人教练（OWNER COACH）**：邀请者的私有指令是最新优先的战术指导；非法/不可行时做最接近的合法动作；
   - **阶段 playbook**：INFO_CHECK 确认、BAND_DRAFT 选乐队、PREP 买/部署/领奖/ready、COMBAT 只聊天或表情；
3. **RULE INDEX**：每节一行 `id · 标题 — 一句话摘要`，例如：

   ```
   - play/1 · 1. 一局的流程 — 确认本局信息 → 选择策略 → 协议启动 → …
   - play/2 · 2. 经济 — 每回合资金、刷新、出售、升级调度中心 …
   - play/5 · 5. 联防（同盟） — 有人漏怪、又有人完美作战时触发 …
   - strategy/3 · 3. 经济 — 先活下来、再滚雪球 …
   ```

   模型需要细节时回 `{"lookup":"play/5"}`；也可以按关键词查（`{"lookup":"联防 漏怪"}`）。
4. **状态字段说明**：每个字段怎么读。

**局面不是只有 id**：`tools/agent/gamedata.mjs` 会把商店/手牌/棋盘里的棋子补上
`name / tier / position / profession / bonds`（和商店卡片看到的一致），商店还带
`upgradePrice / refreshPrice / freeRefreshes`，乐队选项带 `name / totalHp / effect`，
另外附 `teamLp`、玩家 LP 和 `nextEnemies` 预览。敌方/隐藏数据仍然不下发。

只有显式要求时才注入全文：

```bash
--rules index        # 默认：索引（42 节，约几千字）
--rules full         # docs/PLAYING.md §1–§7 全文（最多 24 000 字符）
--rules <path>       # 另一份规则文件
--rules none         # 不附索引
```

每次请求的 user 消息是**该座位可见**的压缩局面（`m.public` + `m.private` 字段子集）外加 `recentChat`（最近 8 条
房间聊天）和 `ownerDirectives`（邀请者最近 3 条教练指令），所以模型能回应队友，也能听主人的战术安排。
邀请者在 agent 座位上点「教练」即可发送；指令只发给自己的 agent，离线时存最后 5 条、重连补发。

**知识查询**：客户端在本地搜索 `docs/PLAYING.md`、`RULES.md`、`AI-STRATEGY.md`、`BOT-STRATEGIES.md`；
`play/5` 这样的 id 精确命中，关键词走相关度排序。每次决策最多 2 次查询，整局默认最多 12 次；
也可以直接查：

```bash
node tools/agent/knowledge.mjs "联防 怎么打"
node tools/agent/knowledge.mjs --list
```

**发言节奏**：客户端强制 `room.chat` 至少间隔 8 秒、`g.emote` 至少 4 秒（可调），模型想刷屏时会跳过这句话继续打牌；
COMBAT/UNITE 只在队友真的说话后触发一次“社交回合”，不会每 150 ms 调模型。

### 7.1 里程碑（全部完成）

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 邀请、入座、座位锁定、过期/重用、对局中接管 | ✅ |
| P1 | 断线 30 秒托管、主动 `room.releaseSeat` 交还（连续失败熔断仍可后补） | ✅（熔断待补） |
| P2 | `SP_AGENT_SEATS`、`/healthz.agents`、`/admin`「AI 席位」、发布包守护 | ✅ |
| P3 | `tools/agent/` 示例客户端 | ✅ |
| P4 | 真实对局 3 prep + 战斗回归 | ✅（opt-in） |

### 7.2 已确认规则

owner 已确认的规则（2026-11-05）：

1. **谁能发邀请**：不限制，房内任一真人玩家都可以；房间真人玩家 < 4 时才可邀请。**座位归邀请者（规则 B）**：
   邀请者离开/被移出立即交还 bot；掉线 30 秒内重连保留，超时交还 bot。
2. **agent 身份**：匿名（只凭邀请；可审计事件，但无账号）。
3. **加入时机**：大厅与对局中都允许；agent 接管的是玩家席位，**占一个位置**，不算底层 bot。
4. **断线宽限**：超过 **30 秒**由底层 bot 接管（`agentGraceMs`）。
5. **可见性**：`room.state` / 公开房间目录显示 `agent: true`（目录与房间都有 AGENT 标记）；允许被观战。
6. **聊天/表情**：agent 可正常使用 `room.chat` 与 `g.emote`，与真人一致。
7. **标识**：agent 是“玩家席位”，但与底层 bot 明确区分：`isBot=false`、`agent=true`；UI 显示 **AGENT**，
   bot 仍显示“AI 队友 / AUTONOMOUS UNIT”。

## 8. 明确不做

- 不新增“AI 专用动作协议”，避免绕开人类校验。
- 不在服务端保存模型密钥；不做出网调用（那是 `EXTERNAL-AI.md` 的开发路径）。
- 不让 agent 获得 RNG、种子、其他玩家私有视图或数据表原文。
- 不把 agent 计入“真人玩家”统计；它不会成为房主，也不会被当成底层 bot。
- B′ HTTP 桥未实现（P3 的可选变体）；agent 直接使用 WebSocket。
