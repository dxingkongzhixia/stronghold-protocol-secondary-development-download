# 外部 AI 顾问（sp-ai/1）与 LLM 适配器

> **状态：** 已移植主线 0.3.3 的外部 AI 策略栈与主线 dev 的 LLM 适配器，**默认关闭**。
> 不设任何 `SP_EXTERNAL_AI_*` / `SP_LLM_*` / `SP_BOT_STRATEGY` 变量时，行为与之前完全一致（内置 bot）。
>
> 相关：[`BOT-STRATEGIES.md`](BOT-STRATEGIES.md)（策略注册表与内置策略）、
> [`AI-STRATEGY.md`](AI-STRATEGY.md)（顾问的打法、经济基准与证据来源）、
> [`QUERY-INDEX.md`](QUERY-INDEX.md)、[`PROJECT-STATE.md`](PROJECT-STATE.md)。

## 1. 它是什么

一个 AI 座位（`isBot` 的真机器人座位，或被“AI 托管”的人类座位）原本固定由内置 bot 打。
外部 AI 把**同一个座位的决策**交给一个外部进程/服务：服务器发送一份“它能看到的局面”（`sp-ai/1` 观察），
对方回一份“它想做的动作”（意图），服务器用**和人类完全相同的校验入口**执行。

```
Match ──(观察 sp-ai/1)──▶ 传输层 (http | stdio) ──▶ 外部顾问 / LLM 适配器
      ◀──(意图 sp-ai/1)──                       ◀──
        │
        └─ _handleSeatIntent()：与人类帧同一套 schema / 语义 / 权限校验 → 执行
```

- **只发可见信息**：公开视图 + 本座位私有视图 + 摘要（`aiDigest`）+ 静态知识包；不含 RNG、种子、
  其他玩家的私有视图、数据表原文。
- **不能越权**：外部意图只允许游戏动作（`g.band`/`g.buy`/`g.move`/…），管理、测试命令、表情、离开都不允许；
  语义校验和人类一致，错误以 `NO_FUNDS`、`BAD_TARGET`、`STALE_ACTION` 之类返回给它。
- **失败即回退**：超时、传输错误、非法回复、非法计划都会让**内置 bot 接管这一步**（或该阶段），
  不会卡住回合，也不会把非法局面写进对局。
- **可复现**：测试日志（`test-input` journal）记录 `botStrategy`、每座位覆盖与外部 AI 配置；
  离线 `replayTestMatch` 不连外网也能重放同一局。

## 2. 快速开始

### 2.1 外部 AI：HTTP

```bash
SP_BOT_STRATEGY=external \
SP_EXTERNAL_AI_TRANSPORT=http \
SP_EXTERNAL_AI_URL=http://127.0.0.1:8765 \
npm start
```

本地自带一个最小的示例顾问（按“第一个可用选项”行动，只为演示协议）：

```bash
node tools/ai/http.mjs 8765      # 打印实际端口
```

### 2.2 外部 AI：stdio 子进程

```bash
SP_BOT_STRATEGY=external \
SP_EXTERNAL_AI_TRANSPORT=stdio \
SP_EXTERNAL_AI_COMMAND='["node","tools/ai/stdio.mjs"]' \
npm start
```

`SP_EXTERNAL_AI_COMMAND` 必须是 **JSON 数组**（argv），不是 shell 字符串；服务器直接 `spawn`，不经过 shell。

### 2.3 LLM 适配器（外部大模型）

适配器本身就是一个 stdio 顾问：它把 `sp-ai/1` 观察转成模型请求，再把模型输出转回意图/计划。
支持 OpenAI 与 Anthropic 两种 wire format：

```bash
SP_BOT_STRATEGY=external \
SP_EXTERNAL_AI_TRANSPORT=stdio \
SP_EXTERNAL_AI_COMMAND='["node","tools/ai/llm-agent.mjs"]' \
SP_LLM_BASE_URL=https://api.example.com/v1 \
SP_LLM_MODEL=your-model \
SP_LLM_API_KEY=... \
SP_LLM_API_FORMAT=openai \
npm start
```

**默认先读规则。** 适配器发出的 system prompt 第一段就是：

> read `rulesBrief` … it is this game's own rule book (docs/PLAYING.md §1–§7); where it disagrees with anything you
> know about similar games, the brief wins; do not invent a rule that is absent from it.

`rulesBrief` 由 `server/ai/knowledge.js` 生成，取自 [`PLAYING.md`](PLAYING.md) §1–§7（截断到 16000 字符），
随知识包一起发送。这样外部模型不会拿“别的自走棋”的常识套到本作上。若部署镜像里没有 `PLAYING.md`
（精简镜像），知识包仍能构建，`rulesBrief` 为空，system prompt 也不会出现那条指示。

## 3. 配置项

### 3.1 外部 AI（`SP_EXTERNAL_AI_*`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SP_EXTERNAL_AI_TRANSPORT` | — | `http` 或 `stdio`；选择 `external` 策略时必填 |
| `SP_EXTERNAL_AI_URL` | — | HTTP 端点；仅 `http`/`https`，不接受 URL 里的账号、密码或 fragment |
| `SP_EXTERNAL_AI_TOKEN` | 空 | 可选的 Bearer token（只从环境读，绝不写进日志/日志回放） |
| `SP_EXTERNAL_AI_COMMAND` | — | stdio 的 argv JSON 数组（≤64 项） |
| `SP_EXTERNAL_AI_MODE` | `direct` | `direct`：逐步意图；`plan`：一次交一份计划，服务器按计划执行 |
| `SP_EXTERNAL_AI_SEATS` | 全部 | 只让这些座位（0–3，逗号分隔）走外部 AI |
| `SP_EXTERNAL_AI_LANGUAGE` | `zh-CN` | 知识包语言：`zh-CN`/`zh-TW`/`en`/`ja`/`ko` |
| `SP_EXTERNAL_AI_TIMEOUT_MS` | 60000 | 单次决策上限（1–300000）；同时最多占用阶段剩余时间的一半 |
| `SP_EXTERNAL_AI_MAX_INTENTS` | 64 | 单次观察允许的意图数上限（1–256） |
| `SP_EXTERNAL_AI_MAX_BYTES` | 524288 | 回复体积上限（1–1048576） |
| `SP_EXTERNAL_AI_FAILURES` | 5 | 连续失败上限（1–20），超过后本座位本次对局禁用外部 AI |
| `SP_EXTERNAL_AI_BACKOFF_MS` | 30000 | 失败后的退避（1–60000） |
| `SP_EXTERNAL_AI_MANUAL_WAIT` | 关闭 | 开发用人工座位：只有 `direct` 模式可用，无时限窗口可无限等 |

### 3.2 LLM 适配器（`SP_LLM_*`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SP_LLM_BASE_URL` | — | API 根地址 |
| `SP_LLM_MODEL` | — | 模型名 |
| `SP_LLM_API_KEY` | — | 密钥（仅环境变量） |
| `SP_LLM_API_FORMAT` | `openai` | `openai` 或 `anthropic` |
| `SP_LLM_MAX_TOKENS` | 16000 | 单次输出上限 |
| `SP_LLM_TIMEOUT_MS` | — | 单次模型请求超时 |
| `SP_LLM_RETRIES` | — | 传输重试次数 |
| `SP_LLM_TEMPERATURE` / `SP_LLM_TOP_P` / `SP_LLM_REASONING` | — | 采样与推理强度（按 provider 支持传入） |
| `SP_LLM_CACHE_SYSTEM` | `1` | 请求 provider 复用 system 前缀（prompt caching） |

完整的变量清单与默认值以 `server/match/externalConfig.js` 与 `tools/ai/llm-agent.mjs` 为准。

### 3.3 每座位策略（`SP_BOT_STRATEGY_SEATS`）

```bash
# 1 号座位用 ioleta，2 号座位走外部 AI，其余用 SP_BOT_STRATEGY（默认 legacy）
SP_BOT_STRATEGY_SEATS='1:ioleta,2:external'
```

合法格式是 `seat:id[,seat:id…]`，座位 0–3，ID 必须是已注册策略；启动时会校验：
非法 ID、越界座位、重复座位、`external` 座位缺少传输配置都会在**加载数据、监听端口之前**报错退出。

## 4. 两种模式

| 模式 | 每步发什么 | 回什么 | 适用 |
|---|---|---|---|
| `direct` | 一次观察 + 允许动作清单 | 若干意图（可 `done:false` 继续） | 简单脚本、逐动作策略 |
| `plan` | 一次观察（含知识包、连续性） | 一份计划（买/留/卖、阵型、经济） | LLM 顾问：一次想清楚，服务器执行 |

`plan` 模式下计划只在**本回合**有效；跨回合只保留“资金方向”（`saveForInterest`、`reserve`），
选择、站位、一次性等级目标都会丢弃——失败/迟到的准备回合不该把上一回合的约束带进来。

## 5. 安全边界

- 外部进程只能拿到**本座位可见**的信息；`aiObservation` 显式构造，不做 `PlayerState` 展开。
- 回复先做协议校验（版本、id、字段集合、体积、意图数量），再由 `_handleSeatIntent` 做与人类相同的语义校验。
- 计划校验（`validPlan`）拒绝未知键、超长列表、越界坐标、非有限数值。
- 传输层不把 URL、token、远端输出写进日志或日志回放；测试日志只记录**配置的形态**（`journalConfig()`）。
- 对局结束/销毁时关闭传输（`close()`），迟到的回复不会改动任何状态。
- **发布版**（没有外部 AI 源码的打包）会忽略这些配置并打印一行提示，继续用内置 bot；启动不会失败。

## 6. 调试与测量

```bash
# 单局：外部顾问跑满一局，打印每回合与策略指标
node tools/matchrun.mjs --mode solo --difficulty FUNNY --bot external --seed 7 --rehearsal 0 --json

# 批量：按策略汇总（calls / latency / fallbacks / 每座位结果）
node tools/botbench.mjs --configs solo:FUNNY --bot external --seeds 2 --rehearsal 0 --json -
```

两者的 `--json` 输出都带 `strategyMetrics`（每座位：`strategy`、`survivalRound`、`finalLP`、
`damageDealt`、`leaderDamage`、`wins`、`external`）。

## 7. 测试

| 文件 | 覆盖 |
|---|---|
| `test/match/external-ai.test.js` | 观察/意图协议、校验、超时回退、日志重放、真实 http/stdio 对局 |
| `test/match/external-advisor.test.js` | `plan` 模式：计划校验、经济延续、真实 IO 的顾问对局 |
| `test/match/external-knowledge.test.js` | 知识包：不可变、内容寻址、语言、插件记录、摘要不含对手私有数据 |
| `test/match/external-transports.test.js` | 传输：HTTP、stdio 子进程、断线重连、体积/超时上限 |
| `test/match/external-llm.test.js` / `external-anthropic.test.js` | LLM 适配器：两种 wire format、重试、`botbench`/`matchrun` 真实运行 |
| `test/match/external-llm-continuity.test.js` | 跨回合连续性：计划延续、失败保留方向 |
| `test/match/external-rules-brief.test.js` | **规则优先**：知识包携带 `PLAYING.md` 规则摘要，system prompt 要求先读 |
| `test/match/bot-strategies*.test.js` / `bot-strategy-seats.test.js` | 策略注册表、每座位覆盖、日志记录与重放 |

外部 AI 与 LLM 测试全部使用本地示例顾问 / 回环 mock，**不访问外网**。
