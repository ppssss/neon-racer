# 车模来源与授权

## 模型清单

| 文件 | 车型 | 游戏内 | 状态 |
| --- | --- | --- | --- |
| `ferrari.glb` | Ferrari 458 Italia | MIRA | 已接入（优化版） |
| `lambo-revuelto.glb` | Lamborghini Revuelto | REVUELTO | 已接入（删内饰、合批、WebP 贴图） |
| `temerario.glb` | Lamborghini Temerario | TEMERARIO | 已接入（删内饰、烘焙朝向、车身+4 轮） |
| `gtr.glb` | Nissan GT-R 35 Nismo | GT-R 35 | 已接入（2.07M 面精简到 134k） |
| `r8.glb` | Audi R8 | R8 V10 | 已接入（OBJ 转 glb、mm 转米） |
| `f12.glb` | Ferrari F12 Berlinetta | F12 | 已接入（390 万面精简到 8.6 万） |
| `mclaren.glb` | McLaren MP4-5 | MP4-5 | 已接入（前后轮组拆成左右，33 万面精简到 14.5 万） |
| `veyron.glb` | Bugatti Veyron | VEYRON | 已接入（单网格，5 万面精简到 3 万，车轮不可独立旋转） |
| `source/lamborghini/Lamborghini+Revuelto.glb` | Lamborghini Revuelto | — | 原始包（48.4 MB） |
| `source/lamborghini/textures.zip` | 同上（外部贴图备份） | — | glb 已内嵌贴图，此包仅作备份 |
| `source/temerario/Lambo-Temerario.glb` | Lamborghini Temerario | — | 原始包（41 MB，贴图已内嵌） |
| `source/temerario/textures(1).zip` | 同上 | — | 贴图备份（与 glb 内嵌内容重复） |
| `source/GTR/GTR+35.glb` | Nissan GT-R 35 | — | 原始包（56 MB） |
| `source/R8/r8.obj` + `r8.mtl` | Audi R8（KeyShot 导出，毫米单位） | — | 原始包；`source/R8/r8.glb` 是 obj2gltf 转好的中间文件 |
| `source/mclaren/mclaren_mp45_2k.glb` | McLaren MP4-5（含贴图） | — | 原始包 |
| `source/bugatti veyron/Bugattiveyron0001glb.rar` + `textures(1).rar` | Bugatti Veyron | — | 原始包（解压后是 glb + 4 张 PBR 贴图） |
| `source/bugatti/Bugatti.rar` | Bugatti（Cinema4D 导出） | — | **未接入**：`Bugatti only.obj` 有 1.18 GB / 713 个 part，但没有配套 .mtl（整车会是同一种颜色），也没有可命名的车轮节点 |
| `source/Ferrari Concept1/Ferrari+Concept1.fbx` | Ferrari Concept1 | — | **未接入**：239 MB FBX / 871 万面，原生 FBX2glTF 无法运行，浏览器端导出跑不通 |
| `source/ferrari-F12/FerrariF12_obj.zip` | Ferrari F12（OBJ + MTL） | — | 原始包；`source/ferrari-F12/f12-raw.glb` 是 obj2gltf 转好的中间文件 |
| `source/ferrari/ferrari-source.glb` | Ferrari 458（three.js 原版） | — | 原始备份 |

`source/bmw-pack/`（约 52 MB）是早前试用 BMW iX 时留下的原始包，车模已从游戏中移除，
该目录可以直接删掉。

## ferrari.glb

游戏里的 MIRA 使用这台车模：three.js 官方示例
[`webgl_materials_car`](https://threejs.org/examples/?q=car#webgl_materials_car) 使用的
Ferrari 458 Italia 模型。

- 作者：**vicent091036**（[Sketchfab](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6)）
- 来源：three.js 仓库 `examples/models/gltf/ferrari.glb`
- 授权：随 three.js 示例资产分发，版权与授权条款见
  [three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE) 与原作者页面。

## 本地做的处理

`assets/car/source/ferrari/ferrari-source.glb` 是 three.js 原始文件（Draco 压缩，含内饰、无贴图）。
为了在 `file://` 下直接运行并降低开销，用 `@gltf-transform/cli` 生成
`assets/car/ferrari.glb`：

1. 解压 Draco；
2. 删除内饰节点（座椅、地毯、方向盘等）；
3. 去掉无用的 TEXCOORD；
4. `weld` + `simplify --ratio 0.15`；
5. `quantize`（KHR_mesh_quantization）。

车身外观（几何轮廓、轮毂、灯的布局）未做改动；涂装、玻璃、轮圈颜色、底盘光晕与尾焰
由游戏在运行时按其材质名替换。

## lambo-revuelto.glb

第 5 台车（REVUELTO）使用的 Lamborghini Revuelto。

- 来源：用户自备的 `Lamborghini+Revuelto.glb`（外部素材站导出的 glb，贴图内嵌）
- 授权：**不明**，仅限本机自用。若要公开发布这个游戏，请先换成有明确授权的模型，
  或联系原作者取得许可。
- 原始文件放在 `assets/car/source/lamborghini/`（48.4 MB 的 glb + textures.zip 备份）

### 本地做的处理

用 `@gltf-transform` 把原始 `.glb`（48.4 MB，命名清晰：`Wheel_FL/FR/RL/RR`）压到
`lambo-revuelto.glb`（2.19 MB）：

1. 按节点名前缀删除内饰（`Engine*`、`Seat*`、`SteeringWheel`、`Dash*`、`Nav`、`Pedal`、
   `Floor`、`DoorCard`、`DoorSill`、`CenterConsole`、`Vents`、`Visors` 等 313 个对象）；
2. 给缺 UV 的 primitive 补零 `TEXCOORD_0`，清空非车轮节点/网格名后
   `flatten` + `join({ keepNamed: true })`，合批到 28 个网格（车轮保留独立节点）；
3. `simplify --ratio 0.5 --error 0.002`；
4. 贴图重压成 WebP、最大 1024px（`EXT_texture_webp`）；
5. `quantize`（KHR_mesh_quantization）。

处理时使用 `--palette false`（避免材质被合并成 PaletteMaterial 而丢失名字）和
`--join false`（避免四个车轮被合成一个网格而无法独立旋转）。运行时由 `js/car-body.js`
把车模居中、缩放到 4.95 m 并贴地，四个车轮用「转向 pivot → 滚动轴」重新挂载。

## temerario.glb

第 6 台车（TEMERARIO）的 Lamborghini Temerario，来源是用户自备的配置器导出 glb
（41 MB、827 个节点、56 万三角面、含完整内饰）。授权同样**不明，仅限本机自用**。

`tools/build-temerario.mjs` 的处理步骤：

1. 删掉 `GRP_Interior` 整棵子树（约 15.9 万顶点）；
2. 把 +90° 旋转**烘进顶点数据**而不是节点矩阵 —— 游戏让车轮绕节点本地 X 轴滚动，
   所以模型的「车头朝 +Z、车轴在 X 轴」必须已经落在几何里；
3. 把每个网格的世界矩阵烘进顶点，整台车压成一层扁平几何；`CTRL_Wheel_*` 里的
   `WHL_*` 归到 `Wheel_XX`，同组里的轮眉装饰退回车身（否则会跟着轮子转）；
4. 按材质合批、`weld`、`simplify`（392k → 147k 面）；
5. `quantize` + 贴图压到 512px WebP（16 张，共 366 KB）。

## gtr.glb / r8.glb

第 7、8 台车。`tools/build-cars.mjs` 用同一套思路处理两台车：

- **GT-R**：原始 56 MB / 207 万面，车身一个 127 万面的网格、四个轮各 19.8 万面。
  节点名已经是 `Body` + `Wheel.Ft.L` 等，直接把车轮改名为 `Wheel_FL/FR/RL/RR`，
  刹车卡钳挂到对应车轮下；车身精简到 6%，车轮精简到 2.5%，共 134k 面。
- **R8**：原始是 OBJ（毫米单位、167 个 group、纯 KeyShot 颜色、无贴图）。
  先用 `obj2gltf` 转成 `source/R8/r8.glb`，再用同一脚本处理：按 group 名的
  `tyre*` / `rims 1*` 找到四个车轮，用各网格质心的 x/z 正负判定前后左右，
  统一乘 0.001 缩放到米，最后合批到 26 个网格。

## f12.glb

第 6 台车（F12）。原始素材是 `FerrariF12_obj.zip` 里的 282 MB OBJ（Blender 导出，30 个纯色材质，
无贴图）+ 一份没用上的 textures 包。授权同样**不明，仅限本机自用**。

`tools/build-cars.mjs` 的 `f12` 配置：

1. obj2gltf 转成 `source/ferrari-F12/f12-raw.glb`（140 MB / 392 万面）；
2. 删掉 `SEATS_*`（皮革内饰，81 万面）；
3. **先删 NORMAL 再 weld** —— Blender 导出的是三角汤（88 万顶点 / 81 万三角），
   不去法线的话 weld 只能合并到 40%，simplify 到 20% 就见底了；去掉法线后能焊到
   40 万顶点，再精简到 8.6 万面；
4. 按对象名前缀 `F_L_ / F_R_ / R_L_ / R_R_` 分出四个车轮；
5. 精简完**自己按索引算一遍平滑法线**（不 unweld，顶点数不变），否则 three.js 会平面着色；
6. quantize。

## 内嵌二进制

`js/car-model*.js` 是上述 glb 的 base64 副本，由脚本一起生成：

```bash
node tools/embed-car-model.cjs
```

这样双击 `index.html`（`file://`）时也能用 `THREE.GLTFLoader.parse()` 解析车模，
不需要本地服务器，也不需要联网。
