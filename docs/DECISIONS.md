# 决策记录

## 2026-07-22：首版本地优先

选择 Expo Go、SQLite 和本地演示生成器，以保证三天内可离线展示。真实 AI、NFC、商城和账号不进入首版。

## 2026-07-22：远端覆盖策略

远端 `CarterWells111/Tralbum` 的现有 README 将在本地验收完成后被完整项目覆盖。推送必须使用 `--force-with-lease`，远端 SHA 改变则停止。

## 2026-07-22：Expo SDK 54 兼容

项目依赖固定到 Expo 54.0.36、Expo Router 6.0.24、React Native 0.81.5 和 React 19.1.0，以匹配现场设备上的 SDK 54 Expo Go。SDK 57 的模板依赖与 lockfile 已重建，不再混用。

## 2026-07-22：草稿预览闭环的最小集成范围

为满足“生成后确认、未确认不进入首页、可保留/重试/丢弃”的 P0 验收，允许 Issue #3 修改 `memories-provider` 和创建页，并新增预览路由。预览页只通过 Provider 调用本地仓储公开 API；重试只使用 `DemoDraftGenerator`，不新增网络、模型 SDK、账号、支付或真实 NFC。

## 2026-07-22：方形旅行册画布编辑器

编辑器采用 1:1 逐页画布。照片、文字和贴纸以相对坐标、尺寸、旋转和层级保存到 `story_pages.layout_json`；旧页面在首次读取时按现有标题、正文和照片 URI 生成兼容布局。首版使用规则自动排版、三种 iOS 系统字体风格和十二个离线贴纸；仅在编辑页使用原生拖动、缩放、旋转手势，不新增网络、真实 AI、WebView、支付或用户自定义字体文件。

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

