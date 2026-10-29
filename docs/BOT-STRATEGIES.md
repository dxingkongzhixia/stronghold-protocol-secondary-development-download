# Bot 策略（注册表、内置策略、每座位覆盖）

> 代码：`server/match/botStrategies.js`（注册表）、`botStrategyContract.js`（契约）、
> `bot.js`（内置 `legacy` 实现 + 备战生成器）、`botPrep.js`、`botFormationCandidates.js`、
> `botAdaptive.js`、`botIoleta.js`、`botIoletaPolicy.js`。
> 外部 AI 见 [`EXTERNAL-AI.md`](EXTERNAL-AI.md)；打法与顾问见 [`AI-STRATEGY.md`](AI-STRATEGY.md)。

## 1. 为什么有策略层

AI 座位原本直接调用 `bot.js` 里的函数。现在这些调用点统一走**策略对象**（`match.bot` / `match.botFor(ps)`），
于是可以：

- 不改对局代码就替换/组合打法（`ioleta`、`adaptive`）；
- 把某个座位的决策交给外部进程（`external`）；
- 在测试日志里记录“这局用的是哪个策略”，离线重放时复现同一局。

**默认不变**：不设置任何变量时 `legacy` 就是原先的 bot，函数引用与行为完全一致。

## 2. 契约

一个策略是一个**冻结对象**，最多五个钩子（外加 `id`）：

| 钩子 | 签名 | 缺失时 |
|---|---|---|
| `pickBand` | `(m, ps) => bandId` | 继承 `legacy` |
| `pickCard` | `(m, ps, cards, available) => idx` | 继承 `legacy` |
| `prepBegin` | `(m, ps, opts) => Iterator`（**同步**生成器） | 继承 `legacy` |
| `prepEnd` | `(m, ps, job) => Iterator` | 继承 `legacy` |
| `bountyKillChance` | `(m, ps, card) => number` | 继承 `legacy` |
| `decide`（可选） | `(m, ps, {kind, valid, complete, fallback}) => boolean` | 不参与异步决策 |

规则：

- **同步生成器**：`prepBegin`/`prepEnd` 必须返回同步迭代器。返回 Promise / async generator 会被拒绝并记录
  `Bot prep hooks must return a synchronous iterator`，随后走清理并让座位 Ready——绝不在虚拟调度器里空转。
- **`decide` 返回 `true`** 表示“我异步接管，稍后调用 `fallback()` 或完成状态”；返回 `false`/不存在时，
  调用方立刻执行内置实现。外部 AI 就是靠这个钩子接入乐队、机变、备战与插件 offer 的。
- **不可变**：策略对象与其注册表都 `Object.freeze`；派生用 `defineBotStrategy({ base })`，不修改基对象。
- 钩子只允许使用**玩家可见**的信息（自己的状态、商店、公共池剩余、队友羁绊条、本回合敌人预览）。

## 3. 内置策略

| ID | 内容 | 备注 |
|---|---|---|
| `legacy` | 原始 bot（`bot.js`） | 默认；未设置或空字符串都解析为它 |
| `ioleta` | Russell 式采购（`botIoletaPolicy`） | 站位仍用 `legacy` |
| `adaptive` | 几何候选站位搜索 | 采购与选乐队仍用 `legacy` |
| `ioleta-adaptive` | 上面两者组合（组合恰好一次） | `adaptive` 的站位 + `ioleta` 的采购 |
| `external` | 外部 AI 宿主（sp-ai/1） | **只在允许的构建里注册**；发布版会自动映射回 `legacy` |

注册表顺序固定为 `legacy, external, ioleta, adaptive, ioleta-adaptive`（`external` 缺失时依次顺延）。

```js
import { BOT_STRATEGIES, getBotStrategy } from './server/match/botStrategies.js';
getBotStrategy();          // legacy
getBotStrategy('ioleta');  // 冻结的策略对象
getBotStrategy('typo');    // throw: Unknown bot strategy: typo; available: legacy, ioleta, ...
```

## 4. 选择策略

```bash
# 所有 AI 座位
SP_BOT_STRATEGY=ioleta

# 每座位覆盖（座位 0–3）；未列出的座位用 SP_BOT_STRATEGY
SP_BOT_STRATEGY_SEATS='1:ioleta,3:adaptive'
```

代码里也可以直接传：

```js
new Match({ botStrategy: 'adaptive', botStrategySeats: { 2: 'ioleta' }, ... });
```

- 启动时校验：非法 ID、越界座位、重复座位、`external` 座位缺少传输配置 → **加载数据/监听端口之前**抛错。
- `SP_BOT_STRATEGY` 未设/为空 = `legacy`；`external` 在不含外部宿主的构建里映射为 `legacy`（并打印一行提示）。

## 5. 备战是分片执行的

一个 AI 座位的准备回合分三段，每段都在**独立的调度回调**里跑，并且每段按 `botSliceMs` 墙钟预算切片：

1. **经济 + 默认阵型**（`prepBegin`：买、卖、升级、摆默认阵型）；
2. **阵型演练**（`rehearsal`：用真实模拟比较候选阵型；可委派给房主浏览器，也可用服务器自己的池）；
3. **收尾**（`prepEnd`：应用选中的阵型、整理临时区、Ready）。

这样 4 个 bot 的比赛不会一次性阻塞事件循环；测试重放按日志记录的**步数**切片，而不是墙钟，所以在任何机器上
都复现同一局。

## 6. 测试日志与重放

`test-input` 日志的 `init.options` 会记录：

```json
{ "botStrategy": "legacy", "botStrategySeats": { "1": "adaptive" }, "externalAI": { "...": "配置形态" } }
```

- 没有座位覆盖时**不写** `botStrategySeats`（旧日志形状不变）；
- 旧日志没有 `botStrategy`：重放时按 `legacy` 处理；
- 重放**不读环境变量**、不连外网；未知策略 ID 会让重放直接报错，而不是静默降级。

## 7. 新增一个策略

```js
// server/match/myBot.js
import { defineBotStrategy } from './botStrategyContract.js';
import { LEGACY_BOT } from './botStrategyContract.js';

export const MY_BOT = defineBotStrategy({
  id: 'my-bot',
  base: LEGACY_BOT,                     // 其余钩子继承
  pickBand: (m, ps) => m.gd.bandIds()[0],
  *prepBegin(m, ps, opts) { yield* LEGACY_BOT.prepBegin(m, ps, opts); },
});
```

然后在 `botStrategies.js` 的 `createBotRegistry([...])` 里登记，并补测试：

- `test/match/bot-strategies.test.js`（契约、注册表、日志）；
- `test/match/bot-strategy-seats.test.js`（每座位覆盖）；
- `test/match/bot.test.js` / `bot-prior.test.js`（行为回归）。

> 改内置 `legacy` 的行为会影响 `test/golden/matches.json`：必须按“先归因（只回退该改动 → 零差异）→
> 单独提交重新生成”的流程处理。

## 8. 测试矩阵

| 文件 | 覆盖 |
|---|---|
| `test/match/bot-strategies.test.js` | 默认即原函数、日志/重放、非法注册、异步迭代器拒绝 |
| `test/match/bot-strategy-seats.test.js` | 每座位覆盖、日志记录、重放不读环境 |
| `test/match/bot-strategies-scenarios.test.js` | 各策略在真实对局中的行为边界 |
| `test/bot-strategy-startup.test.js` | 启动校验（策略 ID / 座位 / 外部传输）与真实房间 |
| `test/match/bot.test.js`、`bot-prior.test.js`、`bot-smarter.test.js` | 内置 bot 的经济、站位、演练、托管的回归 |
