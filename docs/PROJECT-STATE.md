# 项目现状一览（PROJECT-STATE）

> 给「新会话 / 新接手的人」看的一页纸。**最后核对：2026-10-16 夜**（数值为**笔记本单树**本地实测；台式机的数字另见 §3 / §9）。
> 功能细节与每次改动的来龙去脉见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)（§1–§49；**§49 = 2026-10-16 特效批次总览**）。
> 接手入口见 [`docs/HANDOVER.md`](HANDOVER.md)；按问题查文档见 [`docs/QUERY-INDEX.md`](QUERY-INDEX.md)。

---

## 1. 这是什么

「卫戍协议：盟约」的非官方同人**网页联机复刻**：Node 服务器 + 浏览器客户端，1–4 人合作塔防。
基线是**主线项目**（`sganggs/Stronghold-Protocol`；已合并到 **feedback5**（含 **v0.2.0** + i18n，见
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §33），选择性并入 **feedback6** 与 **feedback7 的 R22 / R23**
两批，并于 **2026-10-14 整支合并主线 v0.2.6**（`488db49f`，190 个冲突全解、门禁全绿）——完整记录见
[`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §11）。

本仓库是**基于主线开发的分支项目**，在主线之上独立维护：账号体系、野排匹配、公开同盟、在线状态与管理页、**观战 + 夺舍 AI**、
**大厅社区（更新日志 / bug提交 / 公开房间）**、启动体验与带宽治理、**8 名自造干员**（§4；
`tools/build-data.mjs` 的 `CUSTOM_CHESS`）、**GitHub 主仓库 + Gitee 国内镜像**。

## 2. 目录与「唯一真相」

**同一份仓库在 owner 的**两台机器**上，布局不同——先认自己在哪台：

- **笔记本（`masai`）**：**单仓库 / 单工作树** —— `D:\Git本地库\stronghold-protocol-secondary-development-download`，
  `.git` 在根目录，分支 `master`，远程 `github`（主）+ `gitee`（镜像）。`tools/push-gitee.mjs` 在这里同时充当
  store 与 dev tree。
- **台式机（`D:\DOTK`）**：**双树**，见下表。

**资源中转机**（`123.57.150.185`）由 `tools/push-assets-relay.mjs` 部署，是**发布的第一步**。

**台式机的「双树」约定**（下表以此为准；在**笔记本**上请按 *store ↔ 当前检出*、*dev tree ↔ 当前检出*、*分支 `ours` ↔ `master`* 换算）：

| 路径 | 说明 |
|---|---|
| `Stronghold-Protocol\` | **工作项目 / 运行目录**：**没有 `.git`**，是 git 仓库的**逐字节镜像**（**不是**真源）。`node server/index.js` 在这里跑。 |
| `_merge-scratch\` | **唯一的 git 仓库 / 完整历史 / 唯一真相**（分支 `ours`）。提交、合并、推送都在这里；`node tools/push-gitee.mjs` 把 `HEAD` 推到所有远程，再把被跟踪文件镜像回工作项目。**单向：store → 远程 → 工作树**，绝不用工作树覆盖仓库（反向须显式 `--from-dev`）。 |
| `Stronghold-Protocol-github\` | 干净主线克隆（`master`）。 |
| `_optim-backup-*\` | 每次改动前的本地备份（名字含「日期-主题」）。 |

> ⚠️ store 里的 `.cache` / `public/assets` / `public/fonts` / `public/vendor` 是**指向工作项目的 junction**，约 600 MB 美术只有一份。**别单独删工作项目**，也别把 store 的 `public/assets` 当副本删掉。

## 3. 当前状态（2026-10-16 夜 · 笔记本单树实测）

| 项 | 值 |
|---|---|
| 版本 | `app 0.4.0`（`package.json` / `shared/constants.js APP_VERSION` / `CHANGELOG.md` 三处一致；0.4.0 一节仍在累加未发布的改动） |
| git store | 笔记本 = **本检出**（分支 `master`，HEAD `df3b1897`）；台式机 = `_merge-scratch`（分支 `ours`），工作项目与 store HEAD **零跟踪漂移** |
| 远程同步 | **已全部推送**（2026-10-17 00:2x）：`github/master` == `gitee/master` == HEAD（`20f3437d`，本批 22 个提交：官方特效收尾 / 望 S3 跟子 / 官方数据刷新 / 补召唤物模型 / 文档梳理 / `.atlas` 换行）；主线 `origin/master` = `76700abe`（`check-upstream` 实测：主线未动，我们领先 566） |
| 全量测试 | **本机 `node --test`：7081 项 / 7060 通过 / 3 失败 / 18 跳过**（2026-10-16 夜，笔记本；3 个失败全是既有环境项：`test/lobby.test.js` 的两条限速桶计时 + `test/sim/robustness.test.js:739` 的重装 boss 性能阈值 —— 都只在满负载并发下红）。台式机 store 上一次实测：6674 / 6659 / 0 失败 / 15 跳过（2026-10-15） |
| 其它闸门 | **2026-10-16 夜实测（笔记本）**：`kit-coverage --missing` 307/307 技能 + 120/120 棋子 ✓；`i18n check en --strict` 1475/1475（100%，0 missing / 0 errors）✓；`doctor` 退出码 0 ✓；`eslint .` **0 error**（153 warning）✓；`npm run typecheck` ✓；`check:imports` ✓（3 条允许的 note）；`golden` ✓（望 S3 改动已归因 + 重新生成）；`check-upstream --no-fetch` ✓（主线未动）；docs 守卫 34/34 ✓。**跑不了的两项都是本机没外网**（本机代理 `127.0.0.1:31181` 没起）：`build-data --offline`（缓存还缺 6 张官方表，`--refresh` 也 `fetch failed`；`data/` 未被改动 ✓）与 `check-delivery --live` |
| 本机环境 | Node **v24.18.1**；本机（笔记本）**今天没有外网**：GitHub 推送 / 官方数据 CDN / 中继都不通，需要时先把代理起起来 |
| 本地服务 | `node server/index.js` 于 `:3000`（`/healthz` 正常；`build` 为本地源码哈希，非线上 build）；`data/local-assets.json`（per-machine）已补齐 41 个 spine 组（棋子等本地模型恢复），`data/local-fx.json` 正常分发 |

## 4. 线上

| 项 | 值 |
|---|---|
| 地址 | **http://183.66.27.19:20522**（NAT：内网 3000 → 外网 20522） |
| 版本 | `app 0.4.0`；**已上线进程的 build `adea09d5e893`**（2026-10-17 00:33 部署后重启，由 `/healthz` 实测；旧 build `db7299140227` → 更早 `a240d9ad2df8` / `90f5e7f2c477`；备份 `/root/sp-backup-20261017-003107.tgz`；通告记为社区 **0.4.31**）；以 `/healthz` 的 `build` 为准（`BUILD_INPUTS` = `public/index.html` + `public/js` + `public/css` + `server/sim` + `shared` + `data` 的 size+mtime，**不含 `docs/`**，所以纯文档改动不影响线上 build；`build` 在进程内缓存，**只上传不重启会停在旧值** —— 两者不等就是还跑着旧代码，见 `docs/AI-WORKFLOW.md`） |
| 主机 | RainYun Debian KVM；SSH `root@183.66.27.19 -p 45217` |
| 面板 | 宝塔 `https://183.66.27.19:32467/rainy`（用户 `rainyun`） |
| 项目 | `/www/wwwroot/Stronghold-Protocol`，跑在 `www` 用户，`npm run start` |
| **资源中转** | **http://123.57.150.185**（阿里云轻量 · 华北2 北京 · 200 Mbps · 流量不限）：nginx 服务 `/srv/sp/public`，裸仓库 `/srv/sp.git` + `post-receive` 钩子（**推即部署**）。发布顺序：**先** `node tools/push-assets-relay.mjs`，**再** gitee/github。资源加载链：中转机 → GitHub 及其镜像 → 游戏服务器兜底。**缓存头（2026-10-15）**：带内容哈希的 URL（`~<hash>` 路径、客户端镜像前缀写出的 `?h=`）一年 `immutable`，普通路径与无扩展名路由（`/media`、`/scene`、`/clip`）一周（`map $arg_h`）——常客不再每周重下 135 MB 美术。接入与运维见 [`docs/ASSETS.md`](ASSETS.md)「The relay」 |
| 管理页 | `/admin?token=<var/admin-token.txt>`（令牌 + 30 天 cookie）；公开只读 `/online/api` |
| 进程管理 | 宝塔「Node项目」脚本 `/www/server/nodejs/vhost/scripts/server.sh`（`setsid` 启动）；日志 `/www/wwwlogs/nodejs/server.log` |
| **域名 / 备案（2026-10-14 放弃）** | **owner 决定彻底不办备案**：不用域名（`strongholdprotocolcsym.top` 虽已 ICP 通过 **浙ICP备2026085059号-1**，但不解析、不使用）、不上 HTTPS、页脚的 ICP 号与站点名**已回退**（站点名回到「卫戍协议：盟约」）。域名/证书/HTTPS 的完整步骤保留在下面一行，将来想捡随时能捡。线上仍走 `http://183.66.27.19:20522`（纯 HTTP、本地缓存 + 中继那套，owner 认为已够用） |
| **HTTPS / SW 的前置** | ① 域名 A 记录指向生产机；② 签证书并在反代上启用 HTTPS；③ **中继也必须 HTTPS** —— HTTPS 页面不允许明文 `http://` 子资源（mixed content），`http://123.57.150.185` 会被浏览器拦掉、客户端静默回退到免费 CDN；给中继一个子域名（如 `relay.strongholdprotocolcsym.top`）签证书，再把 `public/asset-mirrors.json` 的第一个源改成 `https://…`；④ 之后 SW 自动注册，`设置 → 美术资源缓存` 生效，用 `node tools/check-delivery.mjs --live` 核对 |
| **公安联网备案（2026-10-14 放弃）** | 已在「全国互联网安全管理服务平台」提交过（主体 马赛 + 网站 我的接口，曾处于待审核），随 owner「彻底不办备案」的决定一并放弃；数据码属敏感凭据、**不进仓库**。将来若重启备案，需要：域名 + 可访问的 HTTPS 站点 + 页脚公示号 |
| **备用 / 测试机（阿里云 ECS）** | **`121.43.140.85`**（华东1 杭州 · 2 vCPU / 2 GiB / 40 GiB **3 Mbps** · Alibaba Cloud Linux 3 + 宝塔面板）。2026-10-14 部署完成：代码 `/www/wwwroot/Stronghold-Protocol`（gitee 浅克隆，`git fetch --depth 1 origin master && git reset --hard origin/master` 更新）、Node `/www/server/nodejs/v26.10.0`、**systemd 服务 `stronghold`**（`User=www`、开机自启、崩溃自重启、日志 `/var/log/stronghold.log`）、监听 `:3000`；**本机 admin token 与旧机不同**（`var/admin-token.txt`）。**定位：备用 / 测试机，不承担生产** —— owner 2026-10-14 决定**不做域名与 HTTPS**（本地缓存 + 中继那套在纯 HTTP 下已够用），生产仍留在雨云那台（上行 20 Mbps，比本机 3 Mbps 更适合对外）。阿里云**安全组未放行 80/443/3000**，外部只能经临时隧道看（`cftunnel` 服务，quick-tunnel 地址随机、重启会变；`systemctl stop cftunnel` 即可撤）。上面的「域名与 HTTPS」步骤保留备用 |

**部署流程（当前做法）**
1. 本地 `node --test` 全绿；
2. 打包（不带超大 / 本机文件）：
   ```
   tar -czf sp-full.tgz --exclude=./.git --exclude=./node_modules --exclude=./public/assets --exclude=./public/vendor \
     --exclude=./public/fonts --exclude=./.cache --exclude=./var --exclude=./logs \
     --exclude=./test/e2e/out --exclude=./data/local-assets.json .
   ```
   ⚠️ **笔记本（单树）必须加 `--exclude=./.git`**：单树检出的 `.git` 里打包着美术资源，约 **700 MB**，
   漏掉这一项会打出 **705 MB** 的包（正常约 12 MB）。桌面机的开发树没有 `.git`，所以原命令没写它。
3. `scp` 到 `/root/sp-full.tgz`；服务器解包 → `chown -R www:www .` → 目录 755 / 文件 644；
4. 停旧进程（按 `ss -ltnp` 里 `:3000` 的 pid，`kill -TERM`）→
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`；
5. `curl http://127.0.0.1:3000/healthz` + 外网 `/healthz` 验证；
   ⚠️ **确认进程真的换成了新代码**：盒上
   `node -e "import('/www/wwwroot/Stronghold-Protocol/server/http/buildTag.js').then(m=>console.log(m.computeBuildTag()))"`
   的结果必须**等于** `/healthz` 的 `build`。`buildTag()` 在进程内**缓存**（`server/http/buildTag.js`），
   所以**只上传、不重启**的部署会让进程继续按旧代码跑、`build` 也停在旧值 —— **两者不等就是"跑着旧代码"**，
   重启即可。（2026-10-15 实测：进程 10-14 12:12 启动、盒上文件 10-15 00:30 被换，`build` 停在 `eb29e3ee0a28`
   而磁盘已是 `47c37209549a`；重启后一致。）

> **先推通知、再上传 / 重启**：发布前先在 `/admin` 的「通知」面板推一条告示（署名 `d星空之下`），
> 说清更新内容、大约多久、请刷新。**没有 owner 明确许可，不要部署**（默认「先不上线」；**2026-10-14 的
> 上线是 owner 明确要求**，公告记为更新日志 `0.4.8`，部署前备份 `/root/sp-backup-deploy-20261014-024306.tgz`）。
> **2026-10-15 部署（owner 明确要求）**：代码 `4e6058f8`，快照 `/root/sp-backup-20261015-102124.tgz`，
> 更新日志 `0.4.25`，重启后 `build = 47c37209549a`。本次增量**内容上只有文档**（server / shared / public 与盒上
> 逐字节一致，708 个文件比对），但**仍然必须重启** —— 旧进程启动于 10-14 12:12，而盒上文件在 10-15 00:30 被换过
> （判定方法见第 5 步）。
> **2026-10-16 晚 部署（owner 明确要求）**：望三技能「天下劫」的棋子触发范围订正（客户端 `sktok_wang_3.rangeId` 的 `x-6` 9 格十字 → **PRTS 原文 / owner 游戏内所见** 的 `x-1` 阵法术士 13 格菱形）。代码 `e0758c50`（源码提交 `075f160f`，golden 重算单独一个提交），更新日志 **`0.4.28`**，增量包 `sp-delta-20261016b.tgz`（9 个文件，解包后 md5 与仓库一致），重启后 `build = 90f5e7f2c477`；线上 `data/tokens.json` 与仓库逐字节相同、对外 `/data/tokens.json` 为 `no-cache`（老客户端刷新即得新值）。**本次只改数据**（`server/**`、`shared/**` 未动），但 `BUILD_INPUTS` 含 `data/`（旧页面会收到「请刷新」提示），且服务器数据**启动时读入并冻结**（`server/data.js` 的 `loadData` 单例）→ **必须重启**。
> **2026-10-17 00:31 部署（owner 明确要求「提交仓库，服务器发通知，上线重启」）**：本批 = 官方特效的还原度修正（术士从法杖出手 `strikePose`、回环射手 `comeBack` 回收、护盾循环随护盾结束 `LOOP_BUFF_BOUND`、自研干员与全名册统一走官方特效）+ 望 S3「每次落子额外至多 3 枚跟子」（官方口径）+ **官方数据按最新表刷新**（乌尔比安/守墓人的第二模组、克莱门莎 S3 `projectile_life_time` 5→3.5、一个敌人的 `formAttackAnim`）+ 补 1 个召唤物模型（`token_10031_swire2_gdtrap`）+ 文档梳理。
> 顺序与结果：**中继先行**（`push-assets-relay.mjs` ✓，新美术进中继）→ **github + gitee**（`push-gitee.mjs` ✓，`master = 20f3437d`）→ **通告**（署名 `d星空之下`，社区 **0.4.31**，说「约 3 分钟后重启」）→ 等 3 分钟 → 增量包 **31.8 MB**（`--exclude=./.git` 必须，笔记本单树 `.git` 带 700 MB 素材）+ 新美术 16 KB 上传 → 备份 `/root/sp-backup-20261017-003107.tgz` → 解包 + `chown www:www` + 755/644 → **重启**（`:3000` pid 448890 → `server.sh`）→ `build` `db7299140227` → **`adea09d5e893`**，且**磁盘 build tag == /healthz** ✓；线上机 `data/local-assets.json` / `data/local-fx.json`（per-machine）**未覆盖**（保持其自有 ✓，公网 `/healthz` 同 build ✓）。部署时线上有 23 人在线（18 局），通告后等了 3 分钟再重启。
> 客户端改完**刷新即可**（`/js`、`/css` 是 `no-cache`；build 变了开着的老页面会自动重载）。
> ⚠️ **`SP_VERIFY=sample` 只在 Windows 的 `server-start.cmd` 里设**，Linux 上没设 → 线上**服务端抽检复算 = off**。
> **2026-10-17 夜 定时部署（owner：「今晚低峰重启」/「直接启用吧」）**：本批 = **统计页改版**（`02f06939`，三层：击杀归属 → 记录 schema **v2** → 新页面）+ **自动训练启用**（`SP_TRAINING=on`）。部署**不即时**：20:15 时线上有 27 局 / 47 名真人，且**旧进程内存里是 v1 schema**——新客户端提交的 v2 记录会被旧进程 `normalizeRecord` **静默降级**（丢掉 `creditedKills` / `usedBondIds`；`shared/stats.js` 是浏览器直接 import 的，所以只回退 `public/` 不够）。处理：**先把 `public/` 8 个文件 + `shared/stats.js` 回退到 `8b4fdbd2`**（还原包 `/root/sp-stats-revert.tgz`，盒子继续跑老客户端 / v1），把增量包 `/root/sp-stats-02f06939.tgz`（17 个文件，含新模块与 26×4 条 i18n）交给 **`/root/sp-restart-tonight.sh`**：03:30 先解包 + `chown www:www` + 755/644，**再** `restart.sh`，客户端与服务端一起切到 v2；随后 04:30 / 05:30 的 `train-bot.mjs --auto` 开始填 `var/training.db`。验证：`/healthz` 的 `build` 应变化、`/shared/stats.js` 的 `STATS_VERSION = 2`、`/js/ui/playerName.js` 200、`var/training.db` 出现；日志 `/root/sp-restart-tonight.log`。**官方统计页素材 37 件**（`public/assets/ui/statistics/`，含 NovecentoWide/SourceHanSans 两套字体）与 `data/assets.json` 的 `ui['statistics/*']` 也在同一个增量包里。⚠️ 打包必须用 git blob（`git show`）**按字节**落盘：PowerShell 的 `Set-Content -Encoding utf8` 会加 **BOM**，`i18n/*.json` 直接解析失败（本次踩过一次，已修）。

## 5. 本项目相对主线的改动（速查）

- **账号**：内置 `node:sqlite` + scrypt；**代号 = 账号名**（2–12 字，大小写不敏感唯一）；**单账号单会话**（新登录踢旧 socket）；`auth.logout` 服务端解绑；游客可不登录直接进。
- **野排**：按难度分桶 / **5 分钟窗口**（`MM_WINDOW_MS`）/ 满 4 人立即开局 / 不足 **AI 补位**；**需登录**；取消 · 离开大厅 · 建房 · 进房 · 断线 · 过期**全路径退池**；**匹配中禁用创建房间**。
- **同盟**：建房可选**公开 / 不公开**；大厅「**公开同盟**」= 还在大厅有空位的房（点击**加入**）、「**正在模拟**」= 正在打的房（野排优先 → 有 AI 优先 → 人多优先，最多 4 个，点击**观战**）。
- **观战 + 夺舍 AI**：`room.spectate` / `room.takeOver { seat }` / `room.releaseSeat`；观战席在队伍列表下方；夺舍后可接管棋盘 · 资金 · 调配，可退出回观战席；**游玩者恒 ≤ 4**。**观战者不续命**：最后一名真人玩家离开 → 房间（含对局）立即销毁（§20.5）。
- **在线状态**：游客断线即离线；登录用户断线保留 **5 分钟**（`PRESENCE_GRACE_MS`）；大厅「在线 N」徽标 + 游戏内 `OnlineOverlay` + `/admin` 只读页。
- **大厅社区**（§36）：同一个 SQLite（schema v4/v5）上的三块——**更新日志**（首启从 `CHANGELOG.md` 导入一次；每次推送通知自动追加一条）、**bug提交**（标题 + 描述 + ≤4 图，按字节嗅探 png/jpeg/webp，限流 + 孤儿清理，管理端可筛选 / 排序 / 导出 / 放大）、**公开房间**（独立整屏 `screens/rooms.js`）。**玩家留言刻意不做**。
- **启动体验**：进标题前**预加载全部美术**（scope `all` ≈ 1910 张 / 104 MB，无跳过、无超时）+ 自托管背景视频（点击开声、无控件、标题出现即释放解码器）。
- **带宽治理**：`server/bootgate.js` **排队闸门**（同时只放一个客户端预加载；已缓存的访客不排队；断线 / 过期立即释放）。
- **8 名自造干员**（`tools/build-data.mjs` `CUSTOM_CHESS`；kit 在 `server/sim/content/kits/ops/`；见 §8）：阿斯卡纶 `ascln`、结城理 `makoto`、予愿安洁莉娜 `aglna2`、望 `wang`、澄闪 `gdglow`、娜仁图亚 `narant`、凯尔希·思衡托 `kalts2`、克莱门莎 `clemnt`（6★ 本源近卫）。
- **日语语音**：第二套语音树 `audio.voiceJp`；「设置 → 语音语言」切 中文 / 日本語（**默认日本語**，与界面语言无关）；选中语言逐条优先、缺则回退另一套；完整包带两套、精简包不带语音。
- **统计数据**：`public/js/ui/stats.js` + `screens/stats.js`；**已同步服务器**（schema v5 `match_stats`），登录绑账号、游客绑本机会话身份，按 owner 隔离，可跨设备查看；统计页优先读服务器、断网回退 `localStorage`；上限取主线 **2×**（2000 局 / 最新 60 局完整 / 每 owner 1.6M 字符）。
- **发布**：`node tools/push-gitee.mjs` 推 `HEAD` 到 `github` 主仓库 → `gitee` 国内镜像 → 分支 `master`（快进、绝不强推），再镜像回工作项目。主线仍是 `origin`。

## 6. 环境开关 / 常量

| 项 | 值 | 位置 |
|---|---|---|
| `MM_WINDOW_MS` | `300000` | `shared/constants.js` |
| `AUTH_NAME_MAX` / `NAME_MAX_LEN` | `12` | `shared/constants.js` |
| `PRESENCE_GRACE_MS` | 5 分钟 | `shared/constants.js` |
| `LOBBY_DEFAULTS.bootSlots` / `bootHoldMs` | `1` / `180000` | `server/lobby.js` |
| `SP_VERIFY` | `sample`（**仅 Windows 启动脚本**） | `server-start.cmd` |
| 静态缓存 | `/assets\|fonts\|vendor` 7 天；带 `?v=` 1 年 immutable | `server/index.js` |
| 中继静态缓存 | 同游戏机口径：带内容哈希的 URL（`~<hash>` 路径 / `?h=` 查询）1 年 `immutable`，普通路径与 `/media`、`/scene`、`/clip` 路由 7 天（随推送由 relay 的 hook 安装并 `nginx -t`） | `tools/relay/sp-relay.nginx.conf` |
| 干员默认潜能 / 练度 | **`1` / 未精英化**（2026-10-15 owner 决定，官方对「未持有」干员的基准；数据仍在满潜构建，按 `potDown` 向下组合；可在「干员调配」里逐名调高。改动前是满潜 6 / 精英2 Lv.60） | `shared/potential.js`（`POTENTIAL_DEFAULT` / `CULTIVATE_DEFAULT`） |
| `SP_ASSET_RATE_KBPS` | `1200`（服务器兜底素材下载限速 ≈1.2 MB/s；0 关闭） | `server/http/files.js` |
| `SP_ASSET_REF` | 未设（**空串＝关闭来源层**：客户端直接走游戏机。不再用来钉 CDN 的 git ref —— ref 就写在 `public/asset-mirrors.json` 的 URL 里） | `server/assetindex.js` |
| `SP_ASSET_RELAY` | 未设（未设时取 `public/asset-mirrors.json` 里 `fullSources` 的第一个源；**已无写死的中继 IP**，配置里没有来源就是没有）——客户端**素材链的第一源**，也由 `/asset-index.json` 的 `sources` 交给 Service Worker | `server/assetindex.js` |
| `RELAY_MIN_BPS` / `MIRROR_MIN_BPS` | `1.2 MB/s` / `1.0 MB/s`（**按实测速度选源，中继仍是第一优先**：用**六张立绘并行**测总吞吐——先测中继，不达标才并行测其余；测量复用 2 分钟，`cacheMs: 0` 可强制每次重测） | `public/js/assetMirror.js` |

## 7. 常用命令

```powershell
# 测试（在 store 里跑才有 .git；node --test 不接受末尾斜杠的目录参数）
cd D:\DOTK\_merge-scratch; node --test
# 本地起服务（工作项目 / Windows）
cd D:\DOTK\Stronghold-Protocol; .\server-start.cmd   # 或: $env:SP_VERIFY='sample'; node server/index.js
# 账号库
sqlite3 var/accounts.db                              # 表: accounts / sessions / match_stats ...
# 资源：本地客户端抽美术 + 抽语音；远程镜像走 gh-proxy
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<...\StreamingAssets\AB\Windows>"
.venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py --ffmpeg "<ffmpeg.exe>"
node tools\fetch-assets.mjs --asset-source=mirror    # 直连被墙时用 gh-proxy 镜像
# 发布（owner 规定顺序）：① 资源中转机 ② github 主仓 + gitee 镜像
node tools/push-assets-relay.mjs                      # = npm run push:relay；推即部署 123.57.150.185
node tools/push-gitee.mjs -m "本次改了什么"
# 两个常备检查
node tools/check-upstream.mjs                         # 主线有没有新提交 / 会冲突哪些文件 / 是否碰到 never-merge
node tools/check-delivery.mjs --live                  # 加载链顺序 + 缓存优先（浏览器自报 fromCache）
```

## 8. 备份 / 回滚

- **服务器**：`/root/sp-backup-*.tgz`（每次部署前打包 `server shared public docs [data]`）。回滚 = 解回项目 → 重新部署并重启。
- **本地**：`D:\DOTK\_optim-backup-<日期>-<主题>\`。
- **git 回退点**：tag `backup/pre-3d-scenes`、`backup-pre-groupA`，分支 `backup/ours-pre-reconcile-20261013`（见 [`docs/HANDOVER.md`](HANDOVER.md)）。

## 9. 已知问题 / 待办

**接手须知（2026-10-14 复核）**

- **全量测试 `node --test`**：**两台机器的实测不同**（计数随机器、是否有本机素材、负载变化）：
  - **台式机（`D:\DOTK` 双树，本仓库 store）**：**6658 项 / 6643 通过 / 0 失败 / 15 跳过**（`--test-concurrency=2`，约 495 s，2026-10-14 实测）。
  - **笔记本（`masai` 单树，2026-10-16 夜）**：**7081 项 / 7060 通过 / 3 失败 / 18 跳过**。3 个失败**均非代码缺陷**、且与最近改动无关：`test/lobby.test.js:560/:578`（限速桶计时）与 `test/sim/robustness.test.js:739`（重装 boss 性能阈值）只在**满负载并发**下失败、**单跑全绿**。**要领判定门禁就单跑**（`node --test --test-concurrency=1`），或直接看台式机的结果（0 失败）。
  - 曾经的第 4 个失败 `test/render/token-wang-stone.test.js:48`（望的棋子模型）**已转绿**：那是该机 `data/local-assets.json`（per-machine）缺 `spine/token/*`，补回 41 个 spine 组即可；注意**服务端清单是 committed ∪ per-machine 的并集**，所以客户端其实一直能画官方棋子模型（详见 `docs/ASSETS.md`）。
  - **本机跑不了的两个门禁**（2026-10-16 夜）：① `node tools/build-data.mjs --offline` —— 本机 `.cache/gamedata` 缺 6 张官方表（含 `skill_table.json`），而本机**没有外网**（`--refresh` 也 `fetch failed`），所以「数据零漂移」这条在笔记本上暂时**无法验证**（台式机 store 上正常）；② `node tools/check-delivery.mjs --live` —— 需要外网。`check-upstream.mjs` 用 `--no-fetch` 可跑（实测：主线未动）。
- **github 推送** 依赖本机代理 `127.0.0.1:31181`；代理没起时 gitee 与中转机不受影响。
- **中转机 root 密码** 曾用于开通，建议在阿里云面板重置（已装部署密钥 `~/.ssh/sp-deploy`，日常不需要密码）。
- **充能型技能的层数未上界面**：数据里 66 个技能 `maxChargeTime > 1`，模拟算出了层数，但 `snapshot.js` 没有 `charges`、显示层也没读它 —— 这些干员的技能条只显示技力、看不到已储存层数（修法见 `docs/ASSETS.md`/待办）。
- **冷启动页面字节**（`public/js` + `data`，约 4–6 MB）仍由游戏机提供且不限速 —— 游戏机上目前唯一的带宽大头。

- [ ] **推送 / 上线今天的特效收尾**（15 个提交：官方特效的还原度修正、望 S3 每次 3 枚跟子、文档梳理）—— **等 owner 发话**（默认「先不上线」；这批没有美术文件，推送不必先走美术中继）。见 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §49。
- [ ] **`SP_VERIFY` 在 Linux 上没开**（线上不抽检战斗结果）。要开：在宝塔的 `server.sh` 加 `export SP_VERIFY=sample`（面板重建脚本会覆盖，注意）。
- [ ] **首屏带宽**：新访客仍要下 ~104 MB 美术（scope `all`）+ 12 MB 视频。可选：降到 `ui`（−30 MB）、或把 `public/assets` 迁 CDN / OSS。
- [ ] **观战席可见范围**：目前房间里所有人都能看到那个下拉；可改成「仅观战者可见」。
- [ ] **攻击前冲 / 浮空技能**（主线 v0.1.3 #61 / #23）已实现，**待实机验手感**。
- [ ] B 站宣传视频：见 §11 产物。
- [x] **CI 已接入**：`.github/workflows/ci.yml` 在 Ubuntu / Windows × Node 22 / 24 上跑 `npm ci`、`node --test` 和服务器冒烟测试。
- [x] **3D 战场的「高台」与配色已定案（2026-10-14）**：官方的「高台」抬升块（`theme.platforms`，用普通 `MeshStandardMaterial` 拿不到场景的烘焙光、渲染成扁平的白板）与装置台的 `slab` 材质（把 act1 各图的装置台染成沙色）**都已关闭 / 回退**，装置台统一用程序化板材质（owner 指定 act2autochess_m02 为正确样本）；另外只给 act2autochess_m03 加了主题线性增益 `theme.gain`（按官方截图校准）。见 [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.2 / §8.5，`test/render/board3d-scene.test.js` 钉住它。

## 10. 与主线的关系 / 下次怎么合并

- 主线：`https://github.com/sganggs/Stronghold-Protocol`。已合并 **v0.1.3**（§15）、**feedback5 / v0.2.0**（合并提交 `e3bd9de`，§33），**选择性**并入 **feedback6** 与 **feedback7 R22 / R23**，并于 **2026-10-14 整支合并 v0.2.6**（`488db49f`，190 冲突全解、门禁全绿，见 §11）；本仓库版本 `0.4.0`。逐批完整记录（主线提交范围 / HEAD、取用的提交、跳过的提交与原因、冲突、golden 变动、本地提交）见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)；**「永不合并」清单**也在其 §0。
- 合并方式（**选择性 cherry-pick**，不再只做大合并）：在临时 worktree 里按 `all-fb<N>.txt` 列出的主线提交逐个 triage（`OK` / `OKg` / `SKIP` + 原因），把 `OK` 的提交**保留作者与提交信息** cherry-pick 到 `ours` 并适配本分支；golden 先做**归属证明**再在专门提交里重算（[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）；跑全量 `node --test` 后才推。大合并仍走 `git merge origin/master` + 逐块解冲突。
- 冲突高发文件：`server/lobby.js`、`server/net.js`、`server/match/Match.js`、`server/sim/*`、
  `shared/{constants,protocol}.js`、`public/js/{main,store}.js`、`public/js/screens/*`、`public/js/render/*`、
  `tools/build-data.mjs`（`CUSTOM_CHESS`）。
- **本批整体检查**（快照；以最新实测为准，见 §3）：测试 6670 项 / 6655 通过 / 0 失败 / 15 跳过、`kit-coverage` 307/307 · 120/120、
  `i18n en --strict` 1455/1455、`doctor` 退出码 0、`eslint` 0 error（148 warning）、`typecheck` / `check:imports` 通过、
  `build-data --offline` 与 `data/` 逐字节一致、工作项目相对 store HEAD 无跟踪漂移。

## 11. 产物

- 文档：本文件、[`docs/MATCHMAKING.md`](MATCHMAKING.md)（决策记录）、[`docs/HANDOVER.md`](HANDOVER.md)（接手入口）、[`docs/QUERY-INDEX.md`](QUERY-INDEX.md)（查询索引）。
- 宣传片：`docs/promo/`（B 站宣传视频脚本 + 成片）。
- 发布：GitHub 主仓库 + Gitee 国内镜像（见 §5 发布一条与 [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）。
