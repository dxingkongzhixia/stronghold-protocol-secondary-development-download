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
  "slices": { "shop.card": { "inset": 12 } }
}
```

- `id`：1–32 位小写字母、数字、`-`、`_`；`name` 必填。
- `colors` 的键：`accent`、`accentSoft`、`accentBright`、`glow`、`bg0`、`bg1`、`bg2`、`line`、`line2`、`text`、`textDim`；值必须是十六进制 / `rgb()` / `hsl()` 颜色。
- `images`：相对路径，只能 `.png` / `.jpg` / `.jpeg` / `.webp`，不能是 URL、不能含 `..`；单张 ≤ 8 MB，整包 ≤ 32 MB。
- `slices.<slot>.inset`：该图片作为 9-slice 边框时的切片宽度（0–128），当前用于 `shop.card`。
- 未知键会给出提示并忽略；写错一个槽位只丢那个槽位，不影响整个包。
- P3a：`character.image` 是标题画面右侧的静态立绘；`voice` 是第一次点击时播放的一句语音（`.ogg` / `.mp3`，≤ 4 MB）。
- P3b 预留 `character`（Spine 的 `skel`/`atlas`/`idle`）；Spine 运行时挂载尚未接入，先不写这个字段。

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
