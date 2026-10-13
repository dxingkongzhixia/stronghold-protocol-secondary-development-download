# 项目现状一览（PROJECT-STATE）

> 给「新会话 / 新接手的人」看的一页纸。**最后更新：2026-10-13**。
> 功能细节与每次改动的来龙去脉见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)（§1–§41）。接手入口见 [`docs/HANDOVER.md`](HANDOVER.md)。

---

## 1. 这是什么
「卫戍协议：盟约」的非官方同人**网页联机复刻**：Node 服务器 + 浏览器客户端，1–4 人合作塔防。
基线是**官方上游**（`sganggs/Stronghold-Protocol`；已合并到 **feedback5**（含 **v0.2.0** + i18n，`docs/MATCHMAKING.md` §33），并选择性并入 **feedback6** 与 **feedback7 的 R22 / R23** 两批——完整记录见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)），
本项目在它之上加了：账号体系、野排匹配、公开同盟、在线状态与管理页、**观战 + 夺舍 AI**、**大厅社区（更新日志 / bug提交 / 公开房间）**、
启动体验与带宽治理、**8 名自造干员**（见 §4；`tools/build-data.mjs` 的 `CUSTOM_CHESS`）、**GitHub 主仓库 + Gitee 国内镜像**（§4 / §9）。

## 2. 目录（都在 `D:\DOTK`）
| 路径 | 说明 |
|---|---|
| `Stronghold-Protocol\` | **工作项目 / 运行目录**：没有 `.git`，是 git 仓库的**逐字节镜像**（**不是**真源；改动请在 `_merge-scratch` 提交，见下一行）。`node server/index.js` 在这里跑。 |
| `Stronghold-Protocol-github\` | 干净上游克隆（`master`；git proxy `127.0.0.1:31181`） |
| `_merge-scratch\` | **唯一的 git 仓库 / 完整历史 / 唯一真相**（分支 `ours`）——工作项目没有 `.git`，是它的镜像。用 `node tools/push-gitee.mjs` 提交已暂存的改动、把仓库 `HEAD` 推送到 **所有已配置的远程**（`github` 主仓库 → `gitee` 国内镜像 → 分支 `master`；快进、绝不强推；凭据不入库，见 `docs/AI-WORKFLOW.md` §c），再把仓库被跟踪的文件镜像回工作项目——**只单向 store → 远程 → 工作树，绝不用工作树覆盖仓库**；它还在用 junction 引用工作项目的 `node_modules`/`public/assets`，⚠️ **别单独删工作项目** |
| `_optim-backup-*\` | 每次改动前的备份（命名含日期+主题） |
| `_optim-backup-20261005-merge-v013\` | 合并 v0.1.3 前后的**完整源码快照**（`ours-pre-merge` / `merged`） |

## 3. 线上
| 项 | 值 |
|---|---|
| 地址 | **http://183.66.27.19:20522**（NAT：内网 3000 → 外网 20522） |
| 版本 | `app 0.4.0`；`build` 见 `/healthz` |
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
- **野排**：按难度分桶 / **5 分钟窗口**（`MM_WINDOW_MS`）/ 满 4 人立即开局 / 不足 **AI 补位**；**需登录**；取消·离开大厅·建房·进房·断线·过期**全路径退池**；**匹配中禁用创建房间**（`roomEntryPolicy`，加入 / 观战自动退池）。
- **同盟**：建房可选**公开 / 不公开**；大厅两行 —— 「**公开同盟**」= 还在大厅有空位的房（点击**加入**）、「**正在模拟**」= 正在打的房（**野排优先 → 有 AI 优先 → 人多优先，最多 4 个**，点击**观战**）。
- **观战 + 夺舍 AI**：`room.spectate` / `room.takeOver { seat }` / `room.releaseSeat`。「观战席」是**左侧队伍列表下方**的紧凑下拉（确认信息/选盟约等无队伍面板的阶段浮动在右下）；**夺舍 AI** 后接管它的棋盘·资金·调配；可**退出夺舍**回到观战席；**游玩者恒 ≤ 4**。**观战者不续命**：最后一名真人玩家离开 / 断线 / 被踢 / 退出夺舍 → 房间（含对局）立即销毁（`docs/MATCHMAKING.md` §20.5）。
- **在线状态**：游客断线即离线；登录用户断线保留 **5 分钟**；大厅「在线 N」徽标 + 游戏内 `OnlineOverlay` + `/admin` 只读页。
- **大厅社区（2026-10-09，详见 §36）**：账号同一个 SQLite（schema v4）上的三块功能 —— **更新日志**（首次启动从 `CHANGELOG.md` 导入一次，`source: release`；每条一行**概要**可展开；每次推送通知自动追加一条**小版本** `source: notice`）、**bug提交**（标题 + 描述 + ≤4 张图片，png/jpeg/webp 按字节嗅探，限流 + 孤儿清理，管理端「玩家反馈」面板可筛选 / 排序 / 导出 / 放大）。**公开房间**是独立整屏界面（`screens/rooms.js`），每房 4 个席位方块、按状态分色、未满在前、满员可观战；入口在大厅顶栏「在线 N」之后。**玩家留言刻意不做**。
- **启动体验**：进标题前**预加载全部美术**（scope `all` ≈1910 张 / 104 MB，**无跳过、无超时**）+ 自托管背景视频（**点击开声、无控件、标题出现即释放解码器**）；视频压到 **12.1 MB**（URL 带 `?v=2`）。
- **带宽治理**：`server/bootgate.js` **排队闸门**（同时只放一个客户端预加载；已缓存的返回访客不排队；断线/过期立即释放）。
- **界面打磨（2026-10-06，详见 §18）**：标题页左下角 **「反馈群 816461825」药丸 + 二维码卡**（含「服务器为个人免费服务器 · 容量较小」）；**盟约条横向居中 + 上移**（top 1.36→.80rem，不遮挡后排干员）+ **盟约详情弹窗固定居中**（不再随详情卡停靠跳位）；**点其他位置收起**（盟约弹窗 / 标题反馈卡 / 干员详情卡 / 本局信息·敌方情报抽屉）；**购买界面：干员/LEVEL/资金卡等宽 1.92rem**（`.scard`/`.lvcard`/`.funds`）+ **资金更醒目**（数字 .5rem 金色发光）+ 冻结/刷新按钮放大（1.5×.56rem）；**顶栏变扁**（`.gtop__center` .78→.52rem，内部胶囊/按钮/回合数/生命值同步缩小）；**盟约详情成员列表只列本局可用的干员**（禁用的隐藏，附「另有 N 名本局禁用」）+ **成员三态更明显**（在场=薄荷实框+角标/N 已拥有=白描边/未拥有=压暗，见 §18.9）；**官方质感打磨**（选中单位操作框 = 厚八角面板 + 键位胶囊 + 金币 hex / 购买栏卡片 = 稀有度描边 + 顶部色条 / 顶栏 = 薄荷描边 + 强调线；详见 §18.8）。
- **观战席断线释放（2026-10-06，详见 §19）**：对局进行中断线的观战者原来要等 10 分钟 reconnect 窗口才释放席位，2 席锁死 → 后来者「房间已满」。现观战者断线后按 `lobbyGraceMs`（60 s）释放（对局中同样释放），重连仍拿回席位。
- **弃局房间销毁（2026-10-06，详见 §20）**：合作房间原来会被「断线的真人席位」吊着最多 10 分钟（`activeHumans()` 不算在线状态）。现**一个房间只在还有在线真人时存在**：真人全离线 / 离开后最多 60 s grace 即销毁（观战者收 `room.closed {empty}`）；还有在线真人的派对仍保留掉线席位。solo 房间不受影响（24h 重连）。
- **保留的战斗/渲染审计修复**：见 §16.6（runner 未送达结果、PMREM RT 释放、纹理存活、裁剪单位衰减、`_pubTimer`、部署退 DP…）。
- **8 名自造干员**（`tools/build-data.mjs` `CUSTOM_CHESS`；kit 在 `server/sim/content/kits/ops/`；见 `docs/DEVELOPMENT.md` 自造干员表、`docs/MATCHMAKING.md` §23–§34 / §37）：阿斯卡纶 `ascln`、结城理 `makoto`、予愿安洁莉娜 `aglna2`、望 `wang`、澄闪 `gdglow`、娜仁图亚 `narant`、凯尔希·思衡托 `kalts2`、克莱门莎 `clemnt`（6★ 本源近卫，tier 6）。
- **日语语音（2026-10-10，详见 `docs/UPSTREAM-MERGES.md` §4/§6）**：第二套语音树 `audio.voiceJp`（与中文同一套槽位 / 文件名），「设置 → 语音语言」切 中文 / 日本語（**默认日本語**、与界面语言无关，已保存的选择仍优先）；**选中的语言逐条优先，缺则回退另一套**（中文⇒CN 否则 JP；日本語⇒JP 否则 CN），两套都没有才不出声；完整包带两套配音、精简包不带语音。**我们独有，非上游的打包方式。**
- **统计数据（2026-10-10/11）**：`public/js/ui/stats.js` + `public/js/screens/stats.js`（记录 / 汇总 / 历史回看；中途立刻退出只进历史不计数），入口在标题 / 大厅 / 房间；**已同步到服务器**——账号 SQLite schema v5 的 `match_stats`（`server/stats.js`），**登录绑账号、游客绑本机会话身份**，两者都上传并按 owner 隔离，**可跨设备查看**；统计页**优先读服务器**、断网回退 `localStorage`；大厅「在线玩家」里可查看其他在线玩家的公开对局数据（不含账号信息）；上限取主线 **2×**（2000 局 / 最新 60 局完整 / 每 owner 1.6M 字符）。**我们独有。**
- **feedback6 选择性 + feedback7 R22 / R23（2026-10-09/10）**：见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)。要点：官方 **失衡（UNBALANCE）** 与新渲染（`render/drag.js` 拖拽落点、推拉滑动、死亡朝向）、整帧攻击间隔 / 时间技力（1 s = 30 帧）、顶栏胶囊按官方计数、观战席胶囊、设置入口（大厅在账号名旁、房间在邀请码旁；并移除与「bug提交」重复的设置内诊断区块）、场地装置说明、空商品栏、统计页，以及一批 GHSIM / OSIM / RENDER / HUD / FIELDS 规则修正；**未并入**「潜能 / 练度」自选界面与上游版克莱门莎（见 §9 与 `docs/UPSTREAM-MERGES.md` §0）。
- **发布（GitHub 主仓库 + Gitee 国内镜像）**：git 仓库 `_merge-scratch`（无工作项目 `.git`，仓库是唯一真相）由 `node tools/push-gitee.mjs` 推送 `HEAD` 到所有已配置的远程（`github` 主仓库 → `gitee` 国内镜像 → 分支 `master`，快进、绝不强推），再把仓库镜像回工作项目——**单向 store → 远程 → 工作树，绝不用工作树覆盖仓库**（反向同步须显式 `--from-dev`，默认关闭）；约定与凭据见 `docs/AI-WORKFLOW.md` §c。上游仍是 GitHub `origin`。

## 5. 环境开关 / 常量
| 项 | 值 | 位置 |
|---|---|---|
| `MM_WINDOW_MS` | `300000` | `shared/constants.js` |
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
- [x] **CI 已接入**：`.github/workflows/ci.yml` 在 Ubuntu / Windows × Node 22 / 24 上跑 `npm ci`、`node --test` 和服务器冒烟测试（README「开发与测试」）；本地 `node --test` 仍是主要闸门。原「没有 CI」已过时。
- [ ] B 站宣传视频：见 §10 产物。
- [x] **沙地战场官方的「高台」（局部抬升块）已实现**（2026-10-13 起，不再是待办）：官方战场 #01 可玩面上**左中**的一处局部抬升台（owner 截图 `D:\DOTK\_shots\official-map01.png`）由 `public/js/render/board3d/theme.js` 的每主题 `platforms` 表 + `scene.js _buildPlatforms` 建成几何（左中块 + 向后一级 + 左下角 + 右场镜像块）；**纯视觉**，`server/sim` 的格子 / 高度 / `deployTiles` 一律不变，块只落在可玩区之外、**永不遮挡**部署高亮 / 方向轮盘。数值 / 规则 / 验证见 `docs/CONTENT-AUTHORING.md` §8.3，`test/render/board3d-scene.test.js` 钉住它。历史：最早的**整圈**「两级台阶 + 一条跑道」尝试（提交 `6e988b44`）与官方不符，已按 `02ebc35a` 删除、改沙地铺边（`theme.js` `apron`，§8.1）。

## 9. 与上游的关系 / 下次怎么合并
- 上游：`https://github.com/sganggs/Stronghold-Protocol`。已合并 **v0.1.3**（`763e224`，§15）、**feedback5 / v0.2.0**（`1303321`，合并提交 `e3bd9de`，§33），并**选择性**并入 **feedback6**（R21A / R21E×3 / R21H / R21D）与 **feedback7 的 R22 / R23** 两批（含 Group A、日语语音、Group C / R23）；本仓库版本 `0.4.0`（上一版 `0.3.0` 是大厅社区 + 克莱门莎）。**逐批的完整记录（上游提交范围 / HEAD、取用的提交、跳过的提交与原因、冲突、golden 变动、本地提交）见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)**；「永不合并」清单也在那里（§0）。
- 合并方式（**选择性 cherry-pick**，不再只做大合并）：在临时 worktree（junction 进 `node_modules` / `.cache`）里按 `all-fb<N>.txt` 列出的上游提交逐个 triage（`OK` / `OKg` / `SKIP` + 原因），把 `OK` 的提交 **保留作者与提交信息** cherry-pick 到 `ours` 并适配本分支；golden 先做**归属证明**再在专门提交里重算（见 `docs/AI-WORKFLOW.md` §b）；跑全量 `node --test` 后才推。大合并仍走 `git merge origin/master` + 逐块解冲突。
- 冲突高发文件：`server/lobby.js`、`server/net.js`、`server/match/Match.js`、`server/sim/*`、
  `shared/{constants,protocol}.js`、`public/js/{main,store}.js`、`public/js/screens/*`、`public/js/render/*`、
  `tools/build-data.mjs`（`CUSTOM_CHESS`）。
- **本批的整体检查**（快照；`node --test` 的项数随套件增长，最新以 `README.md`「测试」一节为准）：`node --test` **5829 项 / 5818 通过 / 0 失败 / 11 跳过**（带 `.git` 且复制了 `data/local-assets.json`，`package.test.js` 与两条素材测试均通过）；`node tools/kit-coverage.mjs --missing` **307/307 技能、120/120 棋子**；`node tools/i18n.mjs check en --strict` **1360/1360（0 缺失 0 错误）**；`node tools/doctor.mjs` **退出码 0**（仅防火墙规则提示）；`node tools/build-data.mjs --offline` 与 `data/` **逐字节一致**；工作项目相对 store HEAD **无跟踪漂移**；`github/master` 与 `gitee/master` == `HEAD`。

## 10. 产物
- 文档：本文件、`docs/MATCHMAKING.md`（§0–§17 菜单）、`docs/DEPLOY.md`（上游的部署说明）。
- 宣传片：`docs/promo/`（B 站宣传视频脚本 + 成片，见该目录下的 README）。
