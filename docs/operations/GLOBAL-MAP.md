# Global Map 开发与验收记录

## 仓库与基准

- Repository: https://github.com/CarterWells111/OneTapReality
- 默认分支：`main`；本地原有完整仓库已安全快进同步，没有覆盖 `.reasonix/`。
- Base SHA: `2a3f87ea0a4ab5e94765e2d3d01100152372d6c6`。
- 功能分支：`codex/global-map`；通过 PR 交付，不直接修改远端 main。
- 实际技术栈：Expo SDK 57 / React Native 0.86 / React 19 / SQLite；以当前 package.json 为准，旧 README 的 SDK 54 描述不能作为当前依赖版本依据。

## 原限制和最终实现

旧地图由 `city-map.tsx`、`city-map-adapter.ts`、`china-map-data.ts`、`city-workspace.ts` 实现，使用中国投影与底图、36 城固定目录和 1–6 倍工作区缩放。地点选择、统计、路由依赖同一目录；旧版云端旅行册接口还只接受三个城市。无 GPS、在线 geocoding、瓦片 SDK 或现有 marker clustering。

- `global-city-map.ios.tsx`：使用 react-native-maps 1.27.2 的系统默认 Apple MapKit 提供全球到街道底图，保持现有圆点颜色、44pt 目标、城市收藏与原十城打卡地图导航。不指定 Google provider，也不新增定位权限、API Key 或照片上传。
- `global-city-map.tsx`：Web / 离线预览使用本地世界陆地矢量图，支持平移、捏合、双击、缩放按钮、日期变更线环绕。此底图只有海岸轮廓，不能代替 iPhone 的街道路网。
- `world-place-data.ts` / `world-land-data.ts`：由 Natural Earth v5.1.2 官方源生成。全球目录与原城市保留同一来源 ID；已有城市 ID、打卡插画和历史记录不变。数据生成发生在开发阶段，App 无运行时下载城市目录。
- `global-map-domain.ts` / `global-map-places.ts`：WGS84 验证、最短经度弧取景、屏幕网格聚合、近重合地点选择。保存记录首次加载时自动取景；用户开始浏览后不因数据刷新跳回。
- `types/city.ts`：自定义地点使用 `geo:1:<latitude>:<longitude>:<URI-encoded name>`，名称和精确坐标随现有 city TEXT 字段保存。解码检查范围、有限值、名称长度与规范编码。不会把未知字符串隐式当成合法地点。
- 地点表单、搜索、城市卡片、详情、旅行册显示和现有本地演示文案读取统一地点解析器。没有接入 AI 整理或改动贴纸系统。
- 本地 SQLite 和旧云端旅行册接口的 city 字段可往返保存全球地点，无数据库结构迁移；没有执行数据库部署或数据变更。NFC 礼品共享的页面/图片协议未扩展为新的位置同步功能。

## 来源与可复现生成

来源文件：

- https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_populated_places.geojson
- https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson
- Public-domain terms: https://www.naturalearthdata.com/about/terms-of-use/
- Expo compatibility: https://docs.expo.dev/versions/latest/sdk/map-view/

```powershell
node scripts/generate-world-map.cjs <places.geojson> <land.geojson>
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
node scripts/run-expo-with-variant.cjs development-staging export --platform ios --output-dir .data/global-map/ios-export --max-workers 2
```

锁文件由 npm 生成。除 react-native-maps 与其 @types/geojson 依赖外，已核对没有包版本升级。

## 验证边界

离线组件预览可用 `node scripts/start-global-map-preview.cjs` 在 localhost:8094 复现。使用独立 Chrome profile 开启 CDP 9382 后，运行 `node scripts/global-map-browser-smoke.cjs http://127.0.0.1:8094/ --exercise`；此脚本核对六地区标记点击、相机平移/缩放和运行异常，并输出截图。预览不是完整应用或 MapKit 的替代验收。

- 自动测试覆盖六大洲地点、±180°、±90°、非法/非有限值、同坐标地点选择、日期变更线取景和聚合、竖屏世界视图缩放、相机动画与布局竞态、延迟加载、不回弹、地点表单、路由和云端校验。
- 使用真实 SQLite 引擎执行项目迁移、保存、重载与账号隔离测试；自定义名称、经纬度、照片引用和旅行册页在重载后保留。
- 浏览器以实际离线 GlobalCityMap 组件进行 390×844 预览：London、Shanghai、New York、Sydney、Cape Town、Lima 搜索、定位与正确标记点击通过；实测相机平移与缩放变化，浏览器异常为零。截图与日志在本地 `.data/global-map/`。
- 主应用的 Web 开发服务器健康接口响应，但 `/city-map` 路由没有完成加载；本次浏览器验收使用隔离组件预览，不声称完成整个 Web App 的运行验收。产品仍按项目既有范围仅支持 iPhone。
- iOS bundle export 是打包检查；Jest 的 MapKit 是 mock。Windows 当前没有可用 iPhone / iOS 模拟器，因此真实 Apple Maps 瓦片、街道细节与原生手势尚未验收。
- 引入原生地图依赖后需要新 iOS binary；不能把 JS 导出当作原生编译或 TestFlight 上线。EAS 构建、上传和提交仍遵循 `EXECUTION-CHECKLIST.md` 的独立审批要求，继续连接 staging。

## iPhone 交付前检查

1. 在批准的 SDK 57 Expo Go 或新的 staging development / TestFlight binary 中打开城市页和全屏地图。
2. 验证六个全球地区的真实瓦片、街道级放大、平移、点选、搜索、日期变更线、极地范围与 Apple attribution。
3. 创建自定义地点旅行册，保存并重启，确认地点、照片、详情和导航；切换账户核对隔离。
4. 验证原十城打卡插画和现有收藏管理。上述实机结果完成前，不作“所有验收已完成”声明。
