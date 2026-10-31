# ark-proto 特殊 UI 快照（PRTS 访问终端）

> 来源：`https://ark-proto.stardust.matce.cn/entry?next=/`
> 抓取：**2026-10-31**；门禁 build `ae-12`；站点的 `/healthz` 报告 app **0.3.3**、build `b85985a86b2c`。
> 用途：**UI 研究 / 视觉参考**。不参与本仓库构建，不被游戏加载；页面代码与文案来自原站。

## 包含什么

| 文件 | 内容 |
|---|---|
| `entry.html` | 门禁页面（CSRF token 已抹除，静态资源引用改为相对路径） |
| `gate.css` | 版式、字体、响应式、片头/成功页/传送门样式 |
| `gate.js` | 登录、继续会话、ALTCHA 工作证明、片头开关 |
| `scene.js` | 背景 3D 场景（three.js + CSS3DRenderer） |
| `terminal-motion.js` | 场景的终端运动采样 |
| `three.module.js` / `css3d.js` | 场景依赖（r 版 three.js + CSS3D 渲染器） |
| `ae-sphere.json` | 场景的归一化球体线框数据 |
| `warmup.js` | 授权前的公开依赖预取 |
| `altcha-pbkdf2.js` | PBKDF2 工作证明 Worker |
| `bender-regular.woff2` | 标题字体 |
| `doctor.webp` / `rhodes.webp` | 成功页的医生肖像与罗德岛标志 |
| `preview.png` | 本地快照截图（1600×900） |

为便于本地预览，`entry.html` / `gate.js` / `scene.js` 里的 `/_gate/assets/…` 已改写为相对路径。

## 没包含什么

登录后的游戏前端没有抓到：`/js/**`、`/css/**`、`/data/**`、`/packs/**` 全部返回 **401**，
鉴权在门禁之后。要抓这部分需要访问口令或已认证的 Cookie。

## 本地预览

```bash
python -m http.server 8137 --directory docs/special-ui/ark-proto-gate
# → http://127.0.0.1:8137/entry.html
```

离线时 `/_gate/pow`、`/_gate/profile`、`/fonts/*` 会 404，属于预期；页面本身可看。
无 WebGL / 无后端时停在 `data-phase="idle"`、`data-renderer="fallback"`（静态渐变背景），
线上会启用 3D 场景。

## 结构要点（给研究 UI 的人）

- 左右分栏：左侧 `PRTS` 字标 + `Private Rhodes Terminal / TERMINAL SERVICE`；右侧 `CALLSIGN` / `PASSWORD`
  两个物理框（`physical-frame`）、`[ ENTER ]` 提示与「连接终端」动作行。
- 三个场景：`#login-scene`（登录）、`#success-scene`（IDENTIFIED / 凭证卡）、`#entry-bridge`（ACCESS VERIFIED 传送门）。
- 片头 `#intro-scene` 默认关闭（`localStorage.ark.prts.intro`），开启后播放信号装配动画。
- 视觉语言：黑白灰 + 细线规则、四角锚点、letterbox 上下条、等宽大写字距、噪点/扫描线。
- 交互：`Altcha PBKDF2` 工作证明在后台预热；`Enter` 提交；密码可见性切换；昵称写入
  `localStorage.ark.callsign` / `sp.name`（与游戏昵称同步）。

## 版权

页面代码与文案来自原站；干员肖像、罗德岛标志等素材归 **鹰角网络（Hypergryph）** 所有。
仅作非商业同人项目的 UI 参考，不随游戏构建分发。
