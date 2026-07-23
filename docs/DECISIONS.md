# 决策记录

## 2026-07-23：离线中国省级地图与全屏浏览

城市地图改用随应用打包的 `@svg-maps/china@2.0.0` 静态省级 SVG path 数据，以显示完整中国地图与省级边界。数据遵循 CC-BY-4.0，应用内显示来源说明，并在 `docs/ATTRIBUTIONS.md` 记录完整归属。地图仍不使用网络、地图 SDK、定位、WebView、外部图片、账户、密钥、分析、支付或真实 NFC。

地图概览可通过空白地图区域或明确的全屏按钮进入 Expo Router 原生全屏模态路由；城市标记仍直接进入对应城市。全屏地图的双指缩放和平移只在 Reanimated shared values 中逐帧更新，缩放范围为 1 至 3.5，平移按已测量布局限制；React 状态只在手势结束时保存可选快照，避免逐帧桥接和双指手势崩溃。

## 2026-07-22：本地城市工作区与收藏管理

城市详情页改为只读本地 SQLite 的城市工作区：展示离线地图、该城市已保存的旅行记忆、精选记忆与本地排序。排序和精选的草稿只在管理页内存中变更，用户明确保存时才写入既有 `city_collection_arrangements`；取消不产生数据库写入。地图继续使用已打包轮廓和固定城市坐标，并仅使用原生手势实现平移、缩放与长按拖拽排序，不添加地图 SDK、网络、定位、远程资源、账号、支付、分析、真实 NFC、动画或新的数据采集。

## 2026-07-22：离线城市地图概览呈现

城市标签页使用可复用的 `CityMap` 原生呈现组件，将已打包的简化中国轮廓和三座城市的相对坐标绘制为本地 SVG。地图仅接收本地 `CityStats`，按访问强度应用视觉 token，并提供可访问的城市名称与已保存旅行记忆数量；概览与文字后备列表都可进入既有城市详情路由。组件预留工作区变体的焦点、交互与点击参数，但本阶段不添加手势、地图 SDK、网络、定位、WebView、动画、真实 NFC、分析或其他数据收集。

## 2026-07-22：离线城市地图与本地城市陈列

本次范围仅新增离线城市地图的数据与本地持久化基础：使用随应用打包的简化中国轮廓，以及杭州、上海、深圳三个固定相对坐标标记。城市访问次数只统计状态为 `saved` 的本地记忆；城市陈列顺序和精选项只保存在本地 SQLite。不会接入网络、地图服务商、定位、地理编码、远程资源、账号、支付、分析或真实 NFC。新城市工作区将隐藏 NFC 与纪念品入口；现有代码和路由保持不变。

## 2026-07-22：本机数据与隐私声明

原生的、本机优先的隐私声明路由现已注册并可用；它将集中说明既有的本机 SQLite、照片 URI 与旅行册内容存储方式，`DemoDraftGenerator` 的限制，以及模拟 NFC 的当前状态，并提供经用户确认后删除本地记忆的既有操作。本次只澄清和集中呈现现有行为，不新增账户、云端或网络、模型或 AI 调用、真实 NFC、支付、数据 schema 或迁移行为。

## 2026-07-22：OneTapReality｜一触如初视觉更名

本次仅更新面向用户的品牌视觉与文案；为保证已安装演示的兼容性，保留 Expo slug `travel-memory-demo`、scheme `lvyidemo`、SQLite 数据库 `luyi.db` 与既有存储键不变。本次不新增账号、网络、AI、真实 NFC、支付或数据迁移行为。

## 2026-07-22：首版本地优先

选择 Expo Go、SQLite 和本地演示生成器，以保证三天内可离线展示。真实 AI、NFC、商城和账号不进入首版。

## 2026-07-22：远端覆盖策略

远端 `CarterWells111/Tralbum` 的现有 README 将在本地验收完成后被完整项目覆盖。推送必须使用 `--force-with-lease`，远端 SHA 改变则停止。

## 2026-07-22：Expo SDK 54 兼容

项目依赖固定到 Expo 54.0.36、Expo Router 6.0.24、React Native 0.81.5 和 React 19.1.0，以匹配现场设备上的 SDK 54 Expo Go。SDK 57 的模板依赖与 lockfile 已重建，不再混用。

## 2026-07-22：草稿预览闭环的最小集成范围

为满足“生成后确认、未确认不进入首页、可保留/重试/丢弃”的 P0 验收，允许 Issue #3 修改 `memories-provider` 和创建页，并新增预览路由。预览页只通过 Provider 调用本地仓储公开 API；重试只使用 `DemoDraftGenerator`，不新增网络、模型 SDK、账号、支付或真实 NFC。

## 2026-07-22：方形旅行册画布编辑器

编辑器采用 1:1 逐页画布。照片、文字和贴纸以相对坐标、尺寸、旋转和层级保存到 `story_pages.layout_json`；旧页面在首次读取时按现有标题、正文和照片 URI 生成兼容布局。首版使用规则自动排版、三种 iOS 系统字体风格和十二个离线贴纸；单页最多选择 12 张照片，更多照片应创建下一页，以保证网格始终处于可编辑范围。仅在编辑页使用原生拖动、缩放、旋转手势，不新增网络、真实 AI、WebView、支付或用户自定义字体文件。

## 2026-07-22：个人页以旅行档案为主

“我的”页优先展示本地旅行册数量、城市足迹、照片数和最近回忆；实体纪念册只作为已有回忆的轻量引导，点击后复用旅行册详情页。首版不增加账号、头像、订单、支付、网络请求或新的持久化数据。

## 2026-07-22：本机个人资料与设置

首版的个人资料只包含昵称与本地头像 URI，不代表用户账号，也不提供登录、退出或注销入口。资料使用 Expo SQLite 的本地键值存储持久化，和既有旅行册 SQLite 表分离；头像仅在用户主动点击选择时通过系统相册选择器取得。个人页展示资料并链接至设置页，设置页可修改昵称、更换或移除头像，并明确说明数据仅保存在当前设备。

## 2026-07-23：合集领域模型

新增 `src/features/collections/` 独立领域模块，支持记忆册的多册组织能力（如“情侣回忆”“城市旅行”）。选择独立模块而非扩展现有 `memory.ts` 类型，因为合集是独立的聚合根，有自己的生命周期（创建、重命名、删除、排序）且与记忆册为一对多关系。不修改现有记忆页面或上下文。

### 模型（model.ts）
- `Collection`：聚合根，含 `id`、`name`、`sortOrder`、`createdAt`、`updatedAt`。
- `createCollection()`：工厂函数，规范化名称、分配 ID 和时间戳。
- `validateCollection()`：轻量验证，确保名称非空。

### 仓库（repository.ts）
- `migrateCollectionsDb()`：按需创建 `collections` 与 `memory_collections` 表。
- `listCollections()` / `getCollection()` / `createCollectionRow()` / `updateCollection()` / `deleteCollection()`：标准 CRUD。
- `assignMemoryToCollection()` / `removeMemoryFromCollection()` / `getMemoriesInCollection()`：记忆册与合集的多对多关联。
- 删除合集不级联删除记忆册——`memory_collections` 的外键 `ON DELETE CASCADE` 仅清理关联关系行。

### 设计约束
- 一册记忆属于零或一个合集（由应用层强制，`memory_collections` 的 PRIMARY KEY 防止重复分配）。
- 首版不实现拖拽排序 UI，排序通过 `sortOrder` 字段仅在模型与仓库层完成。
- 遵循与 `memory-repository.ts` 一致的函数式风格（`db` 作为显式参数，无类）。

## 2026-07-23：预备能力批次（11 个规划 Issue）

一次性落地 11 个相互独立的预备模块，全部为纯本地代码与文档；不引入网络、支付、账号、真实 AI 或真实 NFC，不修改 SQLite 存储与现有编辑路由，各模块仅新增自己的所有权目录与 `__tests__/` 测试：

- `src/features/pages/` + `src/components/page-manager.tsx`：StoryPage 新增/删除/重排；拒绝空册页序列；输出连续 position。
- `src/features/design-system/`：3 套主题与 3 套版式 token；纯函数解析，未知 id 回退默认；无动画/Tailwind/WebView。
- `src/features/assets/` + `assets/design/manifest.json`：设计资源清单（ID/分类/预览/来源/许可证）；未确认商业授权不可标可售；不收录未授权第三方素材。
- `src/features/print/`：方形（210×210）与 A5（148×210）规格；安全边距、页数、图片占位的纯函数校验与边界测试；不生成 PDF。
- `src/features/itinerary/`：地点与日期完全由用户手填的行程节点增删改排；输出稳定 `TimelineItem[]`；不接地图 SDK 或地理编码。
- `src/services/ai/remote-contract.ts`：服务端 AI 契约（类型 + 纯函数 + 可注入传输层）；请求仅含手填元数据与照片数量，显式同意状态与可处理错误；与 `DraftGenerator` 兼容；无 fetch/密钥/环境变量。
- `src/features/ai-review/`：AI 建议人工确认工作流（模型、fixture、面板组件）；证据只引用用户手填元数据，不宣称人脸或地点识别。
- `src/services/city-key/`：QR/URL 版本化载荷解析兜底（三城、演示级 checksum、无效/过期/篡改安全错误、兼容 HTTPS 前缀）；现有 `src/services/nfc/` 保持不动。
- `docs/release/`：上架说明、QA 检查表（拒绝权限/断网/保存重启/删除/三城浏览）与隐私说明；不承诺 Apple 审核结果。
- `src/features/commerce/catalog/`：城市限定 SKU、可追溯材料/工艺/成本字段；仅输出带免责声明的 demo 报价。
- `src/features/partners/`：合作内容的来源/授权/展示周期/公益披露记录与审计条目；未授权内容不可标可售或宣称合作；可关联 City 与 SKU。

备注：本批次在无法运行 npm 的会话环境中编写，测试已随代码提交但未在本机执行；合并前需运行 `npm run lint`、`npm run typecheck`、`npm run test:ci` 确认全绿。

