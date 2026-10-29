# NEON RIDGE · 霓虹山道

一个打开浏览器就能玩的 **3D 霓虹山道竞速小游戏**。没有服务器、没有构建步骤、没有联网依赖，three.js 已内置在 `vendor/` 中。

- **3 圈 × 8 位车手**，霓虹夜景山道，程序化生成的赛道、城市、棕榈与灯光。
- **8 台可选赛车**：Ferrari 458 / F12、Lamborghini Revuelto / Temerario、Nissan GT-R 35、Audi R8 V10、McLaren MP4-5、Bugatti Veyron。
- **独立车库页 `cars.html`**：3D 展厅里挑车、换车漆，选完回到主菜单直接发车。
- **自定义车漆**：预设色板 + 取色器，实时生效并记住上次选择。
- **街机式手感**：油门、刹车、转向、手刹漂移、氮气加速。
- **漂移回充氮气**，撞墙会掉速并溅出火花。
- **AI 对手** 会走赛车线、避让、刹车、在直道使用氮气，并带轻微橡皮筋。
- 实时 HUD：名次、圈数、总时间、单圈、最佳圈、尾流差、小地图、速度表、氮气条。
- 倒计时发车灯、WebAudio 程序化引擎声/胎噪/风噪/碰撞声、结算与本地最佳圈记录。
- 支持键盘、手柄（Gamepad API）与手机触屏按钮。

---

## 运行

任选一种：

1. 双击 **`index.html`**（推荐 Edge / Chrome）
2. 双击 **`启动游戏.bat`**

> 不需要安装依赖，也不需要起本地服务器。打开后点「进入比赛」即可。
> 车模以 base64 内嵌在 `js/car-model*.js` 里，所以 `file://` 直接打开也能读。

---

## 操作

| 按键 | 功能 |
| --- | --- |
| `W` / `↑` | 油门 |
| `S` / `↓` | 刹车 / 倒车 |
| `A` `D` / `←` `→` | 转向 |
| `空格` | 手刹漂移（漂移会为氮气充能） |
| `Shift` | 氮气加速 |
| `R` | 把车复位到赛道上 |
| `Esc` | 暂停 / 继续 |
| `M` | 静音 |
| `Enter` | 在主菜单开始比赛 |

车库页：点赛车卡片或 `←` `→` 切换，`Enter` 确认返回。

手柄：左摇杆转向，`RT` 油门，`LT` 刹车，`A` 漂移，`X` 氮气。

手机：横屏游玩更佳，屏幕下方有转向、油门、刹车、漂移和氮气按钮。

---

## 玩法提示

- 起跑时你在最后一排，前两圈不要急着贴墙。**沿外线入弯、弯心切内线**能保住出弯速度。
- 速度很高时手刹漂移会明显甩尾；反打方向可以控制出弯角度。
- 氮气不用省，但**漂移会回充**，长弯里可以边滑边补。
- 撞上发光护栏会失去大量速度，火花效果很帅但不值得。
- 单圈最佳成绩会保存在浏览器本地。

---

## 代码结构

```
neon-racer/
├─ index.html            比赛页：HUD、菜单、结算
├─ cars.html             车库页：选车 + 选车漆
├─ style.css             霓虹 UI / 响应式 / 触屏 / 车库页布局
├─ 启动游戏.bat
├─ assets/
│  ├─ favicon.svg
│  └─ car/               游戏用 glb：ferrari / lambo-revuelto / temerario / gtr / r8
│     ├─ CREDITS.md      车模来源与授权
│     └─ source/         原始模型包（ferrari / lamborghini / temerario / GTR / R8）
├─ tools/
│  ├─ embed-car-model.cjs    把 glb 打包成 base64 的 js/car-model*.js
│  ├─ build-cars.mjs         一次性：GT-R / R8 / F12 / Concept1 优化流水线
│  └─ build-temerario.mjs    一次性：Temerario 车模优化流水线
├─ vendor/
│  ├─ three.min.js       three.js r128（离线）
│  └─ GLTFLoader.js      r128 版 glTF 解析器（离线）
└─ js/
   ├─ util.js            共享小工具（clamp / 画布 / 贴图 / 光晕）
   ├─ car-model.js       ferrari 车模 base64
   ├─ car-model-lambo.js Revuelto 车模 base64
   ├─ car-model-temerario.js Temerario 车模 base64
   ├─ car-model-gtr.js   GT-R 车模 base64
   ├─ car-model-r8.js    R8 车模 base64
   ├─ car-model-f12.js   F12 车模 base64
   ├─ car-model-mclaren.js MP4-5 车模 base64
   ├─ car-model-veyron.js Veyron 车模 base64
   ├─ car-body.js        解析车模、克隆车身、涂装/轮组/尾焰/底盘光
   ├─ car.js             车辆数据、物理、AI 与比赛逻辑
   ├─ car-select.js      车库页：展厅场景、选车、车漆
   ├─ world.js           赛道样条、路面/路肩/护栏、城市、山脉、棕榈、灯光
   ├─ audio.js           WebAudio 程序化引擎与音效
   └─ game.js            主循环、相机、HUD、粒子、比赛流程
```

### 车模

八套车身，八台车：

| 模型 | 车模来源 | 游戏内 |
| --- | --- | --- |
| `ferrari.glb` | three.js 官方 `webgl_materials_car` | MIRA（只换涂装与轮圈色） |
| `lambo-revuelto.glb` | 用户自备 Revuelto | REVUELTO |
| `temerario.glb` | 用户自备 Temerario（配置器导出） | TEMERARIO |
| `gtr.glb` | 用户自备 GT-R 35 Nismo | GT-R 35 |
| `r8.glb` | 用户自备 R8（OBJ） | R8 V10 |
| `f12.glb` | 用户自备 F12（OBJ，390 万面） | F12 |
| `mclaren.glb` | 用户自备 McLaren MP4-5（glb） | MP4-5 |
| `veyron.glb` | 用户自备 Bugatti Veyron（glb） | VEYRON |

Revuelto / Temerario / GT-R / R8 四台真车模型都经过同一条流水线处理：删内饰 → 把节点世界矩阵烘进顶点（整台车变成
一层扁平几何，**车轮轴必须落在自己的 X 轴上**，因为游戏让车轮绕节点本地 X 轴滚动）→
重组为「车身 + 4 个 `Wheel_XX`」→ 按材质合批 → `weld` + 精简 → `quantize` →
贴图重压成 WebP。

两个例外：**MP4-5 保留原厂 Marlboro 涂装**（`body_mat` 不做替换，车漆只影响底盘光和轮圈），
**Veyron 是单网格导出**（没有独立轮节点，车轮跟着车身走、不会转）。

`js/car-body.js` 启动时解析每个模板，之后每台车 `clone()` 一份（几何共享），并按车型替换
`Body_Color`、`M_GlassClear`、`HeadLights`、`Emission Red`、`Carpaint*` 等材质。
`SPECS` 里给每个模型配了长度、朝向与四个轮节点名；`MAT_SLOTS` 是「glTF 材质名 → 游戏材质」的映射表。

重新生成车模与内嵌文件：

```bash
node tools/embed-car-model.cjs      # glb -> base64 js（改了 glb 才需要跑）
```

需要重做 glb 时才用得上 `tools/build-*.mjs`（依赖 `@gltf-transform` + `sharp` + `meshoptimizer`，
在 `tools/` 里 `npm i` 后运行）。

素材授权与来源见 `assets/car/CREDITS.md`。

### 想改什么，改哪里

| 想改 | 位置 |
| --- | --- |
| 赛道形状 / 宽度 / 圈数 | `js/world.js` 的 `points`、`halfWidth`、`lapCount` |
| 车辆极速 / 加速 / 抓地力 | `js/car.js` 的 `Racer` 构造函数与 `update()` |
| 车型、配色、默认车漆 | `js/car.js` 顶部的 `CAR_DATA` / `CAR_ORDER` |
| 发车排位 / AI 难度 | `js/game.js` 的 `createRacers()` |
| 车库页色板 | `js/car-select.js` 的 `SWATCHES` |
| 画面颜色 / 雾 / 曝光 | `js/game.js` 的 `initThree()` 与 `js/world.js` 的 `buildSky()` |
| 倒计时 / 比赛圈数 | `js/game.js` 的 `startRace()` 与 `js/world.js` 的 `lapCount` |
| UI 主题色 | `style.css` 顶部的 CSS 变量 |

---

## 说明

- 赛道、广告牌、城市、山脉与音效为程序化原创；车身来自 three.js 官方示例与第三方模型。
- **车模来源**：Ferrari 458 Italia 来自 [three.js `webgl_materials_car`](https://threejs.org/examples/?q=car#webgl_materials_car)
  （作者 vicent091036），已按本地需要做简化与量化；Revuelto / Temerario / GT-R / R8
  为用户自备模型，**授权不明、仅限本机自用**，公开发布前请替换。详见 `assets/car/CREDITS.md`。
- three.js 使用 MIT 许可，已随项目内置。
- 若浏览器提示 WebGL 不可用，请更新 Edge / Chrome 或开启硬件加速。
