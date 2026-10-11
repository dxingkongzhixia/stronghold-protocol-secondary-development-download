# 坚守协议中转站（STRONGHOLD RELAY）接入说明

> **我们独有，非上游。** 本文记录一个**外部目录站**（不是我们部署的一部分）与我们线上服的关系：
> 它是干什么的、它的 API 长什么样、我们的服务器怎么被收录、以及**改条目说明需要什么口令**。
>
> 核实时间：**2026-10-11**；对象：<http://118.178.132.54:4100/>（站长自己的阿里云杭州机器）。
> 相关：线上地址与部署见 [`PROJECT-STATE.md`](PROJECT-STATE.md) §3；我们的对外名字是「**卫戍协议：盟约**」。

---

## 1. 它是什么

「坚守协议中转站」是**这份网页版《坚守协议：盟约》的服务器目录站**（不是官方，也不是我们）：

- **服务器列表**：收录各家的网页版地址；服务端每 **60 s** 探测各服的 `GET /healthz` 判在线（在线状态、`app`/`build`、在线人数、房间数、延迟），列表每 **10 s** 同步一次（带 `rev` 做增量，没变就回一个极小的 `unchanged` 帧）。
- **上传 / 改备注**：玩家可以自己提交服务器；上传者拿到一个**编辑令牌**，之后只能用它改自己那条。
- **快速匹配（QUICK MATCH）**：4 人房 / 8 人房排队——房间不在中转站上开，而是挑一台**在线且支持该人数**的收录服，由房主在那台服建房、回报 4 位房间码。
- **意见反馈**：玩家给站长留言（服务端按 IP 限流）。
- **管理后台**（`?admin=1`）：站长用 `relay.config.json` 的 `adminToken` 管理条目（新增/编辑/删除/置顶/隐藏/重探/导出导入）与查看意见。

> 中转站**自己**没有 JSON 健康检查：对它请求 `/healthz` 只会拿到 SPA 首页的 HTML。别拿它当探针。

---

## 2. 我们的条目（已收录）

2026-10-11 核实：**我们的服务器已经在列表里**，由站长/owner 上传（名字里带 owner 的代号 `d星空之下`）。

| 字段 | 值 |
|---|---|
| `id` | `s_oxtba8qwhr` |
| `url` | `http://183.66.27.19:20522` |
| `name` | `d星空之下的测试服` |
| `maxPlayers` | `4` |
| `schedule` | `全天` |
| `contact` | `816461825`（我们的反馈群，见 [`PROJECT-STATE.md`](PROJECT-STATE.md) §4） |
| `tags` | `四人同盟` `长期开服` `娱乐局` `自建房` |
| `note` | `房间可公开，会不定时新增新干员，实验性质` |
| `probe`（实时） | `online:true · app:0.4.0 · protocol:1 · build:6db2bf9e5aa4 · maxSeats:4`（`seatsReported:false`，见 §6） |

它也会出现在**快速匹配**的候选里（`/api/match/state` 的 `targets["4"]`，如 `{"name":"d星空之下的测试服","latencyMs":74,"humans":19,"rooms":12,"score":246}`）。

> 列表接口里我们这条的完整形状（截断）见 §3 末的示例。

---

## 3. API（同源，前端 `BASE = ''`）

所有接口都在 `http://118.178.132.54:4100`，无路径前缀。非 2xx 时 body 形如 `{"ok":false,"error":"…"}`（如 `403 编辑口令不对` / `404 没有这条收录` / `400 校验失败`）。

| 方法 | 路径 | 用途 | 鉴权 | 请求 → 响应（要点） |
|---|---|---|---|---|
| GET | `/api/health` | 中转站自身状态 | 无 | → `{ok,app{id,name,version},web{version},relayUrl,syncSeconds,probeIntervalSec,stats{total,online,clicks1h,players},match{…},feedback{total,unread},serverTime}` |
| GET | `/api/version` | 网页 / 外壳版本、更新说明 | 无 | → `{ok,app,web{version,notes},shell,relayUrl}` |
| GET | `/api/servers?rev=N` | 拉全量列表；`rev` 未变回 `{ok,unchanged:true,rev,…}` | 无 | → `{ok,rev,serverTime,syncSeconds,stats,servers:[…]}` |
| **POST** | **`/api/servers`** | **上传收录（公开，无口令）** | **无** | body `{url,name,maxPlayers,schedule,contact,note,tags[]}` → `{ok,server:{id,…},token,probe}` |
| POST | `/api/servers/:id` | 改备注 / 字段（编辑） | **条目 `token`** | body = 上面的字段 + `token` → `{ok,server,probe}` |
| POST | `/api/servers/:id/click` | 记一次点击 | 无 | → `{ok,…}` |
| POST | `/api/admin` | 管理后台 | **站长 `adminToken`** | body `{token,action,…}`；`action`：`dump` / `import{data}` / `delete{id}` / `pin|unpin|hide|unhide{id}` / `probe{id}` / `probe-all` / `feedback-list` / `feedback-read{id\|all}` / `feedback-delete{id}` |
| POST | `/api/feedback` | 提交意见 | 无（按 IP 限流） | body `{text,contact,name}` → `{ok,thanks}`；`text` 必填 |
| GET | `/api/match/state?playerId=p_…&size=4\|8` | 匹配状态（轮询即心跳） | 无 | → `{ok,ticket,match,queues{4,8},mySize,capabilities{four,eight},targets{4,8},party,…}` |
| POST | `/api/match/join` | 排队 | 无 | `{playerId,name,size}` |
| POST | `/api/match/leave` | 离队 | 无 | `{playerId}` → `{ok,left}` |
| POST | `/api/match/code` | 房主回报 4 位房间码 | 无 | `{playerId,matchId,code}` |
| POST | `/api/match/requeue` | 换服重排 | 无 | `{playerId,matchId}` |
| POST | `/api/match/refresh` | 让中转站立刻重探一轮 | 无 | `{playerId}` |
| POST | `/api/match/party` | 组队房 | 无 | `{action:'create'\|'join'\|'leave'\|'size',playerId,name?,code?,size?}` |

**CORS**：中转站的 API 自己返回 `Access-Control-Allow-Origin: *`（方便它的 APK / 外壳跨源调）。**但它探测我们的 `/healthz` 是服务端行为**（由它自己的 Node 进程发起，带 `latencyMs`）——所以：**我们的 `/healthz` 不需要 CORS 头**（我们确实也没发 `ACAO`，仍然被探到 `online:true`）。

我们这条在 `/api/servers` 里的形状（`servers[]` 之一，已截断）：

```json
{"id":"s_oxtba8qwhr","url":"http://183.66.27.19:20522","host":"183.66.27.19",
 "name":"d星空之下的测试服","note":"房间可公开，会不定时新增新干员，实验性质",
 "tags":["四人同盟","长期开服","娱乐局","自建房"],"maxPlayers":4,"seats":null,
 "schedule":"全天","contact":"816461825","isPrivate":false,"pinned":false,"hidden":false,
 "createdAt":1791720655391,"updatedAt":1791720655391,
 "clicks":{"total":1,"h1":1,"h24":1,"last":1791720811785},
 "probe":{"at":1791721728204,"online":true,"app":"0.4.0","protocol":1,"build":"6db2bf9e5aa4",
          "humans":19,"rooms":12,"matches":11,"sockets":21,"maxSeats":4,"seatsReported":false,
          "cap":0,"latencyMs":74}}
```

---

## 4. 字段与限制

- **必填**：`url`、`name`、`note`。
- 长度（上传表单 / 后台）：`name` ≤ 24 / 30；`note` ≤ 200 / 300；`schedule` ≤ 40；`contact` ≤ 60；自定义标签 ≤ 12。
- `maxPlayers`：数字（我们填 `4`）。`seats`（单房座位数）**只有后台有**，用于「对方 `/healthz` 不报 `maxSeats` 时手填」。
- 上传表单的**快捷标签**来自一个固定建议集（`四人同盟` `长期开服` `娱乐局` `自建房` `有语音` `国内直连` …）；自定义标签只能在管理后台加。
- `url` 判重按 **主机 + 路径**（忽略协议 / 结尾斜杠 / 大小写 / `www.`）。
- 频率：列表每 10 s 同步；服务端每 60 s 探一次（`/api/health` 的 `probeIntervalSec`）。

---

## 5. ⚠️ 改条目说明需要口令（我们手上没有 → owner 补一步）

**上传（`POST /api/servers`）不校验任何口令**；但**编辑（`POST /api/servers/:id`）需要该条目上传时返回的 `token`**——前端把它存在浏览器 `localStorage` 的 `sprelay.tokens` 下（`{ "<id>": "<token>" }`）；站长也可以用 `adminToken`（`relay.config.json`，未公开）。

我们**没有**这个 `token`，也**不会去猜 / 绕过**它（规则：不猜、不绕过口令）。所以下面这一步请 **owner 本人**完成——两种任选其一：

**(a) 网页上改（最简单）**：在**当初上传这台的那台浏览器**里打开 <http://118.178.132.54:4100/>，找到「d星空之下的测试服」卡片（自己上传的会带「我上传的」/「改备注」按钮）→ 点「改备注」→ 把 §5.1 的备注粘进「服务器特性 / 备注」→ 保存。

**(b) 调一次 API**（需要编辑令牌或站长 `adminToken`）：

```bash
curl -X POST http://118.178.132.54:4100/api/servers/s_oxtba8qwhr \
  -H 'content-type: application/json' \
  -d '{
    "token": "<上传时返回的编辑令牌 或 站长 adminToken>",
    "url": "http://183.66.27.19:20522",
    "name": "d星空之下的测试服",
    "maxPlayers": 4,
    "schedule": "全天",
    "contact": "816461825",
    "note": "「卫戍协议：盟约」非官方网页复刻（本 fork）：中文/日配语音、服务端统计、8 名自造干员、账号+野排匹配、公开房间、观战/夺舍 AI。仅支持网页版（桌面浏览器）；手机端可能存在兼容问题。房间可公开，会不定时新增新干员，实验性质。",
    "tags": ["四人同盟", "长期开服", "娱乐局", "自建房", "有语音"]
  }'
```

成功返回 `{ok:true, server:{…}, probe:{…}}`。

### 5.1 建议的备注（≤200 字，含**我们故意打的一条广告**）

> 「卫戍协议：盟约」非官方网页复刻（本 fork）：中文/日配语音、服务端统计、8 名自造干员、账号+野排匹配、公开房间、观战/夺舍 AI。**仅支持网页版（桌面浏览器）；手机端可能存在兼容问题。** 房间可公开，会不定时新增新干员，实验性质。

**这条声明是我们有意对外写的**：中转站的卡片会把 `note` 原样显示给所有玩家，所以「仅支持网页版（桌面浏览器）；手机端可能存在兼容问题」就放在备注里，避免手机玩家进来才发现不兼容。中转站**没有单独的「要求 / 说明」字段**，能承载它的只有 `note`（以及可选的标签 `有语音`）。

> 万一将来是**从零收录**（`POST /api/servers` 无口令）：用**同一段 `note`**，并务必把响应里的 `token` 存好（只在返回时给一次）。

---

## 6. 健康检查 / 格式兼容（我们**不需要**改代码）

我们的 `GET /healthz`（`server/http/routes.js` 的 `healthReport` + `server/lobby.js` 的 `stats()`）：

```json
{"ok":true,"version":1,"app":"0.4.0","uptimeSec":20870,"build":"6db2bf9e5aa4",
 "sockets":21,"sessions":25,"rooms":12,"matches":11,"humans":19,"bots":9,"online":21,"spectators":0}
```

中转站读的字段与我们的对应关系：

| 中转站用的 | 我们提供 | 说明 |
|---|---|---|
| 判「是不是坚守协议服务器」 | `ok` / `version`(→`protocol`) / `app` | 缺 `version`/`app` 会被判成「不是坚守协议服务器」（见列表里 `game.xiaolubao.com` 那条） |
| 卡片上的在线信息 | `app` / `build` / `humans` / `rooms` / `matches` / `sockets` | 全部实时读取 |
| 单房座位数 | `maxSeats`（**我们没报**） | 缺它时中转站**保守按 4 座**算（`seatsReported:false`）——**我们本来就是 4 座，所以无需改**。将来若开 8 座，需要在这里（并配 `modes`）报 `maxSeats`，才会被标成「8 人房」并进 8 人匹配池。 |

结论：**当前 `/healthz` 完全够用，不需要加字段，也不需要 CORS 头**（探测在中转站服务端）。`build` / `app` 变化不影响收录（探测实时读）。

---

## 7. 变更 / 排障

- **换域名或端口**：owner 用 §5 的方式改 `url`（要口令）。改完中转站下一轮探测（≤60 s）就会按新地址探。
- **版本 / build 变了**：**什么都不用做**（在线卡片上的 `app`/`build` 是实时探测的，不写死）。
- **服务器长期离线**：条目**不会被自动删**，卡片显示「离线」。
- **条目被误删**：可**无口令**重新 `POST /api/servers` 收录；会拿到新的 `id` 与 `token`，**记得把 token 存好**（换设备就改不了了）。
- **想找站长**：中转站自己的「💬 意见反馈」提交即可（无口令）。

---

## 8. 我们这次做了什么 / 没做什么

- ✅ 调研并记录中转站的 API、鉴权与我们的条目（本文）。
- ❌ **没有改条目说明**：编辑需要条目 `token`（或站长 `adminToken`），我们手上没有，也不猜/不绕——已备好 §5 的请求等 owner 执行。
- ❌ **没有改代码**：`/healthz` 已被正确解析（在线、人数、房间都在），且探测是服务端发起的，**不需要 CORS**；本轮无兼容性缺口（见 §6）。
- ❌ **没有在客户端加「服务器列表 / 中转站」入口**：收录已由中转站侧完成、与客户端无关；且标题页与大厅正在被并行改造，动它们是高风险低收益，故跳过。

## 9. 调研记录（可复现）

- 抓取（2026-10-11）：`/index.html`、`/js/app.mjs`、`/js/api.mjs`、`/js/admin.mjs`、`/js/feedback.mjs`、`/js/match.mjs`。
- 只读实测：`GET /api/health`、`/api/version`、`/api/servers?rev=`、`/api/match/state`；`POST /api/servers`（空 body → `400 请填写服务器网址`）、`/api/servers/<不存在>`（→ `404`）、`/api/servers/<我们的 id>`（错 token → `403 编辑口令不对`）、`/api/admin`（无 token → `403`）、`/api/feedback`（空 → `400`）。
- 我们的 `GET http://183.66.27.19:20522/healthz` 实测见 §6。
