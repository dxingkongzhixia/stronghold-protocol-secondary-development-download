# 界面主题包（spTheme/1）

一个主题包就是一个文件夹：`theme.json` 加若干图片。**只在本浏览器生效**：不会上传，不会被其他玩家看到，也不会进入对局逻辑。

## 使用

1. 设置 → **界面主题包** → 「导入主题包」，选择包含 `theme.json` 的文件夹；
2. 导入后自动启用；同一时间只启用一个；「删除」会连同本机存储一起删除；
3. 私密窗口阻止 IndexedDB 时，主题只在本次会话内保留。

## `theme.json`

```json
{
  "format": "spTheme/1",
  "id": "my-theme",
  "name": "我的主题",
  "author": "名字",
  "version": 1,
  "colors": { "accent": "#cf4a40", "bg0": "#120d0c" },
  "images": {
    "title.bg": "bg/title.webp",
    "lobby.bg": "bg/lobby.webp",
    "room.bg": "bg/room.webp",
    "brief.bg": "brief/bg.webp",
    "shop.bg": "shop/backdrop.webp",
    "shop.card": "shop/card.png",
    "banner": "banner.webp"
  },
  "slices": { "shop.card": { "inset": 12 } },
  "character": { "skel": "char/model.skel", "atlas": "char/model.atlas", "idle": "Idle" },
  "voice": "voice/hello.ogg"
}
```

- `id`：1–32 位小写字母、数字、`-`、`_`；`name` 必填。
- `colors` 的键：`accent`、`accentSoft`、`accentBright`、`glow`、`bg0`、`bg1`、`bg2`、`line`、`line2`、`text`、`textDim`；值必须是十六进制 / `rgb()` / `hsl()` 颜色。
- `images`：相对路径，只能 `.png` / `.jpg` / `.jpeg` / `.webp`，不能是 URL、不能含 `..`；单张 ≤ 8 MB，整包 ≤ 32 MB。
- `slices.<slot>.inset`：该图片作为 9-slice 边框时的切片宽度（0–128），当前用于 `shop.card`。
- 未知键会给出提示并忽略；写错一个槽位只丢那个槽位，不影响整个包。
- P3a：`character.image` 是标题画面右侧的静态立绘；`voice` 是第一次点击时播放的一句语音（`.ogg` / `.mp3`，≤ 4 MB）。
- P3b：`character` 写 Spine 的 `skel` / `atlas` / `idle`，同目录放 atlas 引用的页图（例如 `model.png`）。导入后标题画面会用
  `pixi-spine` 挂载并循环播放 `idle`；加载失败时自动保留 `character.image` 静态立绘。

## ZIP 与官方主题

- **ZIP**：设置 → 界面主题包 → 「导入主题包（.zip）」。读取器只接受存储/标准 deflate 条目，拒绝 `..`、绝对路径和超过 16 MB 的单个条目；整包仍受 32 MB 限制。
- **官方主题**：`tools/local-extract/autochess_themes.py`（本树已带）可从本地客户端导出 `themes/ac_n_initial`、`themes/ac_n_iron`、`themes/ac_s_closur` 三个 spTheme 包。把其中一个目录压成 zip 后可直接导入。
  - 我们的界面不是 prefab HUD：官方包里的 prefab 槽位会按别名映射（`shop_main` → 商店背景、`chess_frame_*` → 商店卡框、`battle_background` → 简报背景、`title`/`lobby` → 标题/大厅，`character`/`avatar` → 标题立绘），其余槽位给出提示并忽略；颜色/语音/Spine 角色照常生效。
  - 官方 prefab HUD 的**布局本身**（乌萨斯齐心团的 prefab 控件、可露希尔的电视等）不会复刻，因为我们的 HUD 是 `hud.js` / `shopBar.js` 的自绘 DOM。

## 语音触发

`voice` 可以是单文件（等同 `AUTOCHESS_GAME_START`），也可以写 `voices` 对象。触发器沿用官方表：

`AUTOCHESS_GAME_START`、`AUTOCHESS_REST_NO_HP_LOSS`、`AUTOCHESS_REST_HP_LOSS`、`AUTOCHESS_REST_BOSS`、
`AUTOCHESS_REST_HIDDEN_BOSS`、`AUTOCHESS_SAME_OPERATOR`、`AUTOCHESS_BUY_OPERATOR_LOW`、`AUTOCHESS_BUY_OPERATOR_HIGH`、
`AUTOCHESS_SHOP_UPGRADE`、`AUTOCHESS_COUNTDOWN`、`AUTOCHESS_MERGE_TRIPLE`、`AUTOCHESS_ALLIANCE_LEVEL`、`AUTOCHESS_FREEZE`。

概率 / 冷却（秒）与官方一致；当前已接 `AUTOCHESS_GAME_START`，其余由后续界面事件调用 `playThemeVoice(trigger)`。

## 图片槽位

| 键 | 位置 |
|---|---|
| `title.bg` | 标题画面背景 |
| `lobby.bg` | 大厅背景 |
| `room.bg` | 房间背景 |
| `brief.bg` | 作战简报背景 |
| `shop.bg` | 商店底板 |
| `shop.card` | 商店卡框（可 9-slice） |
| `banner` | 阶段横幅底板 |
| `character.image` | 标题画面右侧立绘 |

动画 WebP / APNG 直接作为背景图即可循环播放；静态图按 `cover` 铺满。
