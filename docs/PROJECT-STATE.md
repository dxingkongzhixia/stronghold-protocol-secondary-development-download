# 项目现状一览（PROJECT-STATE）

> 给「新会话 / 新接手的人」看的一页纸。**最后更新：2026-10-06**。
> 功能细节与每次改动的来龙去脉见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)（§1–§20）。

---

## 1. 这是什么
「卫戍协议：盟约」的非官方同人**网页联机复刻**：Node 服务器 + 浏览器客户端，1–4 人合作塔防。
基线是**官方上游 v0.1.3**（`sganggs/Stronghold-Protocol`），本项目在它之上加了：账号体系、野排匹配、公开同盟、
在线状态与管理页、**观战 + 夺舍 AI**、启动体验与带宽治理。

## 2. 目录（都在 `D:\DOTK`）
| 路径 | 说明 |
|---|---|
| `Stronghold-Protocol\` | **工作项目**（唯一真源；无 `.git`，改动直接落盘） |
| `Stronghold-Protocol-github\` | 干净上游克隆（`master`；git proxy `127.0.0.1:31181`） |
| `_merge-scratch\` | 上次合并上游用的 **git worktree**（分支 `ours`，含合并历史）——⚠️ 它用 junction 引用工作项目的 `node_modules`/`public/assets`，**别单独删工作项目** |
| `_optim-backup-*\` | 每次改动前的备份（命名含日期+主题） |
| `_optim-backup-20261005-merge-v013\` | 合并 v0.1.3 前后的**完整源码快照**（`ours-pre-merge` / `merged`） |

## 3. 线上
| 项 | 值 |
|---|---|
| 地址 | **http://183.66.27.19:20522**（NAT：内网 3000 → 外网 20522） |
| 版本 | `app 0.1.3`；`build` 见 `/healthz` |
| 主机 | RainYun Debian KVM；SSH `root@183.66.27.19 -p 45217` |
| 面板 | 宝塔 `https://183.66.27.19:32467/rainy`（用户 `rainyun`） |
| 项目 | `/www/wwwroot/Stronghold-Protocol`，跑在 `www` 用户，`npm run start` |
| 管理页 | `/admin?token=<var/admin-token.txt>`（令牌+30 天 cookie）；公开只读 `/online/api` |
| 进程管理 | 宝塔「Node项目」脚本 `/www/server/nodejs/vhost/scripts/server.sh`（`setsid` 启动）；日志 `/www/wwwlogs/nodejs/server.log` |

**部署流程（当前做法）**
1. 本地 `node --test` 全绿；
2. 打包（不要带上超大/本机文件）：
   ```
   tar -czf sp-full.tgz --exclude=./node_modules --exclude=./public/assets --exclude=./public/vendor \
     --exclude=./public/fonts --exclude=./.cache --exclude=./var --exclude=./logs \
     --exclude=./test/e2e/out --exclude=./data/local-assets.json .
   ```
3. `scp` 到 `/root/sp-full.tgz`；服务器解包 → `chown -R www:www .` → 目录 755 / 文件 644；
4. 停旧进程（按 `ss -ltnp` 里 `:3000` 的 pid，`kill -TERM`）→
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`；
5. `curl http://127.0.0.1:3000/healthz` + 外网 `/healthz` 验证。

> 客户端改完**刷新即可**（`/js`、`/css` 是 `no-cache`；build 变了开着的老页面会自动重载）。
> ⚠️ **`SP_VERIFY=sample` 只在 Windows 的 `server-start.cmd` 里设**，Linux 上没设 → 线上**服务端抽检复算 = off**。

## 4. 本项目相对上游的改动（速查，详见 §11/§16）
- **账号**：内置 `node:sqlite` + scrypt；**代号 = 账号名**（2–12 字，大小写不敏感唯一）；**单账号单会话**（新登录踢旧 socket）；`auth.logout` 服务端解绑；游客可不登录直接进。
- **野排**：按难度分桶 / 30 s 窗口 / 满 4 人立即开局 / 不足 **AI 补位**；**需登录**；取消·离开大厅·建房·进房·断线·过期**全路径退池**。
- **同盟**：建房可选**公开 / 不公开**；大厅两行 —— 「**公开同盟**」= 还在大厅有空位的房（点击**加入**）、「**正在模拟**」= 正在打的房（**野排优先 → 有 AI 优先 → 人多优先，最多 4 个**，点击**观战**）。
- **观战 + 夺舍 AI**：`room.spectate` / `room.takeOver { seat }` / `room.releaseSeat`。「观战席」是**左侧队伍列表下方**的紧凑下拉（确认信息/选盟约等无队伍面板的阶段浮动在右下）；**夺舍 AI** 后接管它的棋盘·资金·调配；可**退出夺舍**回到观战席；**游玩者恒 ≤ 4**。
- **在线状态**：游客断线即离线；登录用户断线保留 **5 分钟**；大厅「在线 N」徽标 + 游戏内 `OnlineOverlay` + `/admin` 只读页。
- **启动体验**：进标题前**预加载全部美术**（scope `all` ≈1910 张 / 104 MB，**无跳过、无超时**）+ 自托管背景视频（**点击开声、无控件、标题出现即释放解码器**）；视频压到 **12.1 MB**（URL 带 `?v=2`）。
- **带宽治理**：`server/bootgate.js` **排队闸门**（同时只放一个客户端预加载；已缓存的返回访客不排队；断线/过期立即释放）。
- **界面打磨（2026-10-06，详见 §18）**：标题页左下角 **「反馈群 816461825」药丸 + 二维码卡**（含「服务器为个人免费服务器 · 容量较小」）；**盟约条横向居中 + 上移**（top 1.36→.80rem，不遮挡后排干员）+ **盟约详情弹窗固定居中**（不再随详情卡停靠跳位）；**点其他位置收起**（盟约弹窗 / 标题反馈卡 / 干员详情卡 / 本局信息·敌方情报抽屉）；**购买界面：干员/LEVEL/资金卡等宽 1.92rem**（`.scard`/`.lvcard`/`.funds`）+ **资金更醒目**（数字 .5rem 金色发光）+ 冻结/刷新按钮放大（1.5×.56rem）；**顶栏变扁**（`.gtop__center` .78→.52rem，内部胶囊/按钮/回合数/生命值同步缩小）；**盟约详情成员列表只列本局可用的干员**（禁用的隐藏，附「另有 N 名本局禁用」）+ **成员三态更明显**（在场=薄荷实框+角标/N 已拥有=白描边/未拥有=压暗，见 §18.9）；**官方质感打磨**（选中单位操作框 = 厚八角面板 + 键位胶囊 + 金币 hex / 购买栏卡片 = 稀有度描边 + 顶部色条 / 顶栏 = 薄荷描边 + 强调线；详见 §18.8）。
- **观战席断线释放（2026-10-06，详见 §19）**：对局进行中断线的观战者原来要等 10 分钟 reconnect 窗口才释放席位，2 席锁死 → 后来者「房间已满」。现观战者断线后按 `lobbyGraceMs`（60 s）释放（对局中同样释放），重连仍拿回席位。
- **弃局房间销毁（2026-10-06，详见 §20）**：合作房间原来会被「断线的真人席位」吊着最多 10 分钟（`activeHumans()` 不算在线状态）。现**一个房间只在还有在线真人时存在**：真人全离线 / 离开后最多 60 s grace 即销毁（观战者收 `room.closed {empty}`）；还有在线真人的派对仍保留掉线席位。solo 房间不受影响（24h 重连）。
- **保留的战斗/渲染审计修复**：见 §16.6（runner 未送达结果、PMREM RT 释放、纹理存活、裁剪单位衰减、`_pubTimer`、部署退 DP…）。

## 5. 环境开关 / 常量
| 项 | 值 | 位置 |
|---|---|---|
| `MM_WINDOW_MS` | `30000` | `shared/constants.js` |
| `AUTH_NAME_MAX` / `NAME_MAX_LEN` | `12` | `shared/constants.js` |
| `PRESENCE_GRACE_MS` | 5 分钟 | `shared/constants.js` |
| `LOBBY_DEFAULTS.bootSlots` / `bootHoldMs` | `1` / `180000` | `server/lobby.js` |
| `SP_VERIFY` | `sample`（**仅 Windows 启动脚本**） | `server-start.cmd` |
| 静态缓存 | `/assets|fonts|vendor` 7 天；带 `?v=` 1 年 immutable | `server/index.js` |

## 6. 常用命令
```powershell
# 测试（务必在 工作项目 目录；node --test 不接受末尾斜杠的目录参数）
cd D:\DOTK\Stronghold-Protocol; node --test
# 本地起服务（Windows）
.\server-start.cmd                                   # 或: $env:SP_VERIFY='sample'; node server/index.js
# 账号库
sqlite3 var/accounts.db                              # 表: accounts / sessions
# 资源：本地客户端抽美术 + 抽语音；远程镜像走 gh-proxy
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\Arknights_Data\StreamingAssets\AB\Windows"
.venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py   # 本地客户端补干员语音（默认日服 voice，可 --voice-dir 指 voice_cn）
node tools\fetch-assets.mjs --asset-source=mirror    # 直连被墙时用 gh-proxy 镜像（BGM/SFX 等）
```

## 7. 备份 / 回滚
- **服务器**：`/root/sp-backup-*.tgz`（每次部署前打包 `server shared public docs [data]`）
- **本地**：`D:\DOTK\_optim-backup-*\`（名字即「日期-主题」）
- **回滚**：把对应 tgz 解回项目 → 按 §3 重新部署并重启。

## 8. 已知问题 / 待办
- [ ] **`SP_VERIFY` 在 Linux 上没开**（线上不抽检战斗结果）。要开：在 BT 的 `server.sh` 加 `export SP_VERIFY=sample`（面板重建脚本会覆盖，注意）。
- [ ] **首屏带宽**：新访客仍要下 ~104 MB 美术（`scope all`）+ 12 MB 视频。可选：降到 `ui`（−30 MB）、或把 `public/assets` 迁 CDN/OSS。
- [ ] **观战席可见范围**：目前房间里**所有人**都能看到那个下拉；可改成「仅观战者可见」。
- [ ] **攻击前冲 / 浮空技能**：已按上游 v0.1.3（#61 / #23）实现，**待实机验手感**。
- [ ] 没有 CI，测试靠本地 `node --test`。
- [ ] B 站宣传视频：见 §10 产物。

## 9. 与上游的关系 / 下次怎么合并
- 上游：`https://github.com/sganggs/Stronghold-Protocol`；我们停在 **v0.1.3**（`master` @ `763e224`）。
- 合并方式：在 `_merge-scratch`（分支 `ours` = 我们的状态）里 `git fetch origin && git merge origin/master`，
  解冲突（思路见 `docs/MATCHMAKING.md` §15）→ 临时目录跑全量测试 → 才拷回工作项目。
- 冲突高发文件：`server/lobby.js`、`server/net.js`、`server/match/Match.js`、`server/sim/*`、
  `shared/{constants,protocol}.js`、`public/js/{main,store}.js`、`public/js/screens/*`、`public/js/render/*`。

## 10. 产物
- 文档：本文件、`docs/MATCHMAKING.md`（§0–§17 菜单）、`docs/DEPLOY.md`（上游的部署说明）。
- 宣传片：`docs/promo/`（B 站宣传视频脚本 + 成片，见该目录下的 README）。
