# Agent 席位（内部接入：AI 通过房间接管 bot）

> **状态（2026-11-05）：P0 + 断线托管已实现**——任意真人玩家签发一次性邀请、入座、座位锁定、过期/重用拒绝、
> 对局中接管、断线 30 秒后交还内置 bot。运维开关/面板（P2）、示例客户端（P3）、端到端（P4）尚未做。
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
| `room.agentInvite { seat, ttlSec? }` | 房内任一真人玩家 → 服务器 | 为**一个 bot 座位**签发一次性邀请；不要求房主。仅当房间真人玩家 < `MAX_SEATS`（4）时允许；`ttlSec` 1–3600，默认 600。同一座位再签会作废旧 token |
| `agent.invite { token, seat, code, expiresAt }` | 服务器 → 签发者 | **仅推给签发者**。明文 token 只出现这一次；不进 `room.state`、不进日志 |
| `agent.claim { token }` | agent → 服务器 | 普通会话 `hello` 之后兑换邀请；成功后座位归该会话。一次性；失败返回 `BAD_TARGET`，已在房间内返回 `ALREADY` |
| `g.*` | agent → 服务器 | 全部现有游戏意图，校验与人类一致；**聊天 `room.chat` 和表情 `g.emote` 也可用** |
| `m.public` / `m.private` / `m.field` / … | 服务器 → agent | 该座位可见的视图，不新增信息 |
| `room.releaseSeat` | agent → 服务器 | 座位 `fromAi=true`，因此可把座位交还新 AI，自己回到观战席；断线 30 秒也会自动做 |

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
| 伪造邀请 | 只有房内的真人玩家可签发（观战者 / agent / bot 都不行） |
| 越权 | agent 只是普通玩家：`g.test`、管理帧、非本座位视图都按现有规则拒绝 |
| 刷屏/拖慢 | 沿用 40 msg/s 限流、阶段截止、按座位错误码 |
| 发布包误带 | 与 `EXTERNAL-AI` 相同的门控思路（P2 接入 `llmGate` / 打包排除） |

## 5. 代码位置

| 内容 | 文件 |
|---|---|
| 协议条目（C2S / S2C） | `shared/protocol.js`（`room.agentInvite`、`agent.claim`、`agent.invite`） |
| 邀请、兑换、座位锁定、过期、30 秒托管 | `server/lobby.js`（`inviteAgent`、`claimAgentSeat`、`agentInviteFor`、`startAgentGrace`、`handOverAgentSeat`、`Room.agentInvites`） |
| 会话标记 | `server/net.js`（`Session.agent` / `Session.agentSeat`） |
| 对局中换键 / 交还 | `server/match/match/watch.js`（`Match.takeOver` / `aiTakeOver`，复用现有实现） |
| 对局与结算里的 `agent` 字段 | `server/match/PlayerState.js`、`server/match/match/views.js`、`server/match/results.js`、`server/match/StubMatch.js` |
| 公开房间目录 | `server/admin.js`（`buildPublicSnapshot`：`seats[].agent`、`agents` 计数） |
| 前端 AGENT 标记 | `public/js/screens/{room,rooms,bandDraft,result,settle}.js`、`public/js/ui/gameComponents.js`、`public/css/screens/{room,lobby}.css` |
| 测试 | `test/match/agent-seat.test.js` |

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
8. 日志包含 `agent … claimed seat N` / `timed out; the AI took seat N`，**不包含**明文 token。

## 7. 后续（按优先级）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 剩余** | 连续非法意图熔断；`g.autoplay` 看门狗细化（当前断线托管已实现） | 连续失败后交还，不卡房 |
| **P2** | `SP_AGENT_SEATS=on/off`（默认 off）、房间开关、`/healthz` 的 `agents` 计数、`/admin` 面板、发布包排除 | 后台可见邀请/入座/交还/拒绝原因；关闭开关后 `room.agentInvite` 全部拒绝 |
| **P3** | `tools/agent/` 示例客户端（最小决策循环），可选 B′：本地 HTTP 桥（仍无 key、无出网） | 示例能从大厅入座并打完一局 |
| **P4** | 真实 coop 对局端到端回归（≥3 个 prep + 战斗） | 零 error，全量测试绿 |

### 7.1 仍需 owner 拍板的默认值

owner 已确认的规则（2026-11-05）：

1. **谁能发邀请**：不限制，房内任一真人玩家都可以；房间真人玩家 < 4 时才可邀请。
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
