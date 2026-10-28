# 后续功能 / Future features

> 这里记录**评估过、但暂不实现**的较大功能：目标、结论、已试过什么、后续可行路线、风险。
> 目的：下次不要从零重复试错。当前状态：**未实现**（相关实验代码已删除，可从 git 历史恢复）。

## 1. 动态皮肤的官方 L2D 场景（2026-10-28 评估，实验已移除）

### 目标

大厅背景能放官方**动态时装**：人物和场景（水晶舞台、台阶、粒子、光效）一起动，效果等同官方商店预览。

### 结论：为什么先不做

- 官方客户端把动态时装放在 `<client>/Arknights_Data/PersistentData/Bundles/arts/dynchars/<skinId>.ab`。
- **Spine 本体只有人物**：以「塑心·无我唯识」（`char_245_cello@sale#12`）为例，图集 432 个区域全是 `B_C_*`
  （头发、裙摆、琴、眼睛、衣带…），**没有任何场景区域**；`dyn_portrait_*` 只是对话半身像。
- 同一个包里还有 **426 个 ParticleSystem、53 个 MeshRenderer、10 个 AnimationClip**：水晶、台阶、五线谱是
  **Unity 网格 + 材质 + 粒子 + 动画**，由 prefab 实时组合；**pixi-spine 画不了 Unity 网格/粒子**。
- 因此「静态立绘/单张场景贴图做底 + 人物 Spine」只能近似，**不是官方动态场景**；三种底图方案（场景贴图、模糊立绘、
  静态整图压暗）都试过，均不能同时满足“官方场景 + 全动态”。
- 2026-10-28 实现过一版并上线（人物 Spine + 静态立绘底），随后**全部下线**：前端、抽取工具、91 套素材、测试、
  文档段落均已删除；生产 `/public/assets/dynillust/` 已清理。

### 已试过（可复用/参考）

- 抽取（已删，见 git 历史）：
  - `tools/local-extract/dynillust.py`：从 `arts/dynchars/*.ab` 抽 `dyn_illust_*.skel` + atlas + 页面 WebP；
    处理了 **JSON 骨架**（无扩展名）、**同名双模型**（完整/精简）、**图集尺寸与贴图差 12px**、**精英二图集沿用基础名**、
    **图集页 1600 等比缩放（atlas 坐标同步）**、`--skinpack/--chararts` 取官方静态立绘。
  - `tools/local-extract/dynillust-posters.mjs`：用无头 Chrome + PIXI 把每套渲染成 16:9 `poster.webp` 缩略图。
  - 覆盖：日服 88 套 + 国服新增，共 **91 套**（含精英二动态立绘）。
- 前端（已删）：`public/js/ui/hub/dynIllust.js`（PIXI + pixi-spine，`Idle` 循环、30 fps、按高度完整显示、
  减少动效静帧、切后台暂停、悬停 HTTP 预取）、`appearance/backdrop.js` 的选择页（3/2/1 列、懒加载缩略图）、
  `main.js` 的标题页预解析、索引时间戳防代理缓存。
- 性能实测：无 GPU 的 headless 大厅约 **4.4 s** 就绪；生产 1600×900 / 3 Mbps 约 **2.7 s**；单套 ~2–5 MB。
- 素材规模：91 套约 **276 MB / 553 文件**（git-ignored，未入库）；选择页只加载缩略图（~50 KB/套），
  点选后才拉那一套骨架。

### 后续可行路线

**A. Unity prefab → glTF / three.js（推荐，但工作量大）**

- 用 UnityPy 导出 mesh、material、transform、Texture2D、AnimationClip；three.js 渲染；粒子用 instanced quads 近似；
  后处理（Bloom/调色）用 EffectComposer 近似。
- 每套需校准相机、缩放、混合模式、UV/贴图；把 Spine 人物叠在同一相机下（或继续用 PIXI 叠层）。
- 风险：Unity shader/粒子/后处理还原度；91 套批处理；体积与首屏；许可证（仅本机/服务器私有素材，不入库）。
- 建议先做 **2–3 套原型**（塑心、年、拉普兰德），验证网格/粒子/相机，再评估是否批处理。

**B. 录制官方 L2D 循环视频（视觉 100%）**

- 在官方客户端逐套录 5–10 s 循环（webm/mp4，含场景+人物），大厅用 `<video>` 做底；人物可不再叠 Spine。
- 体积 91 × 3–10 MB；需要录制/裁切/压缩流水线；同样只做本机/服务器私有素材。
- 优点：视觉与官方完全一致；缺点：不是实时、无交互、带宽大。

**C. 只做人物 Spine（不做场景）**

- 就是被下线的版本去掉背景：人物动态、场景用大厅深色底。视觉不是官方预览，但最轻。

### 前置条件 / 决策

- owner 明确要做，并确认可接受的体积/带宽与还原度（A 或 B）。
- 素材只放本机/服务器的 git-ignored 目录（同 `skins/sets/`），仓库不提交官方美术。
- 若走 A：先原型、再批处理；保留 `--source` 映射，便于重抽。
- 若走 B：确定录制分辨率/帧率/循环点，统一压缩参数。

### 参考

- Bundle 结构：`arts/dynchars/<skinId>.ab`（Spine 人物 + `dyn_portrait` + Unity 场景 prefab）。
- 已删除实现的提交（可从历史恢复）：
  - `c981dfffd` 单套动态皮肤 + 选择页雏形
  - `18762a029` 91 套抽取 / 选择页 / 1600 图集 / 预取
  - `2234645ee` 按高度完整显示
  - `f27436dd4` 索引时间戳防缓存
  - `6d0354f7a` 静态立绘压暗做底（方案 1）
  - 回滚提交见 `docs/PROJECT-STATE.md` 的部署表「移除动态皮肤实验」一行。
- 生产备份（含当时前端/索引）：`/root/sp-backup-dyn-20261028-220038/`、`/root/sp-backup-dyn-20261028-225530/`。
