# 决策记录

## 2026-07-25：NFC 礼品完整发布闭环

NFC 礼品采用经过邮箱验证码的统一账户会话，而不复用匿名设备 token。用户首次访问礼品链接时先读取不泄露相册内容的安全状态；未登录用户进入统一登录页，已有会话的首位用户自动认领未认领礼品。已绑定礼品中，拥有者进入独立的礼品管理页，受邀邮箱只可读取已发布的共享相册，未知账户只收到无权限结果。

管理页只使用礼品内部 ID，并由服务端从 bearer 会话推导拥有者身份，绝不把 NFC token 放入“我的纪念品”列表或管理路由。拥有者可从本地旅行册建立手动发布快照、维护最多三位访问邮箱（含拥有者）并永久停用礼品；不提供管理权转让，也不会自动上传或同步本地旅行册。

首位认领和成员变更在 PostgreSQL 事务中执行并按礼品串行化，确保每礼品只有一位拥有者且成员数永远不超过三人。R2 媒体始终私有：发布前须校验对象存在、Content-Type 和字节数；替换与停用在同一数据库事务中撤销访问并记录待删除对象。R2 删除失败不恢复访问或停用状态，而由仅服务端可调用的维护端点以持久化任务重试清理过期初始化卡、未完成发布和旧媒体。

网站根域名继续只负责 App Link 文件与安装提示；API 保持在 `https://api.onetapreality.com`。iOS AASA 使用现有 Team ID；Android `assetlinks.json` 必须等提供 release SHA-256 后写入，之前不宣称 Android App Link 已完成验收。所有 Resend、数据库、R2 和维护密钥只保存在 Railway 服务端变量。

## 2026-07-24：编辑器工具栏布局重组

本轮仅调整编辑页 UI 布局，不改数据逻辑、路由、交互行为、依赖或数据库 schema：

- **撤销/重做移至工具栏**：原顶部栏的撤销/重做按钮移至 `CanvasToolbar` 第一行右侧（与「添加文字」同行），顶部栏仅保留页码指示与页面管理入口。撤销/重做按钮在不可用时置灰。
- **页面管理融入页码指示**：顶部栏右侧放置黑色页码文字（不可点击）+ 橙色「页面管理」按钮（可点击），两者间距 10px，压缩纵向空间。
- **工具栏精简**：`CanvasToolbar` 移除「添加贴纸」「添加相框」「选择背景」三个按钮，避免与底部素材托盘（贴纸/相框/背景 tab）重复。
- **AI 免责声明下移**：AI 辅助生成提示从编辑器上方移至自动保存状态下方，使编辑界面不被提示文字遮挡。
- 本次不新增网络、支付、账号、真实 AI、真实 NFC、依赖或数据库字段。

## 2026-07-24：OneTapReality 标识统一

产品名称、Expo slug、URI scheme、npm 包名、测试预期及当前发布配置统一使用 `OneTapReality` / `onetapreality`；后续工作不得再引入 `travel-memory` 标识。

这是发布前的重命名，不迁移本地演示数据。已在 Expo 创建的 `travel-memory-demo` EAS 项目属于外部状态，发布前须在 Expo 控制台手动重命名或替换；本决定不改变 `com.onetapreality.app`、数据库、服务端数据或秘密。

历史计划与历史决策保留原始用词，作为审计记录。

## 2026-07-24：OneTapReality 1.1.0 NFC TestFlight beta

第二个 TestFlight beta 的显示版本为 `1.1.0`，包含 NFC 礼品初始化、共享相册和礼品访问控制。iOS build number 由 EAS remote version source 管理，并在 production build 时自动递增，避免与已上传的 TestFlight build number 冲突。继续使用 `com.onetapreality.app` 和已关联的 `@onereality/onetapreality` EAS 项目；本次不直接发布到 App Store。

## 2026-07-24：NFC 礼品共享相册

实体礼品写入唯一的 `https://onetapreality.com/gift/<token>`，由 iOS Universal Links 和 Android App Links 打开应用；应用不读取或写入 NFC 标签本身。礼品 token 在服务端仅以带 pepper 的哈希保存，交付前由受限批量脚本生成、登记并导出写入清单。

- 首位通过邮箱验证码的人认领礼品并成为不可转让的管理者；访问名单总数（含管理者）严格为 1 至 3 个邮箱。受邀人可只读访问，未授权邮箱不获得相册元数据。
- 相册以管理者明确发布的快照共享。页面、照片和访问名单使用 Railway PostgreSQL 与 Cloudflare R2 私有桶保存；照片仅通过短期签名 URL 上传或读取，R2、Resend、数据库及 token 密钥只放服务端环境变量。
- Resend 从已验证的 `support@onetapreality.com` 发送一次性验证码。登录会话为 30 天，客户端只在 SecureStore 保存 bearer token，服务器只保存哈希。
- 管理者可改绑相册、发布更新、调整名单或永久停用礼品；停用会删除共享数据并使物理标签永久不可重新认领。
- 此功能新增真实网络、邮箱账号、云端媒体和真实 NFC 链接范围；隐私政策、支持页和应用内声明必须同步反映这些事实，客户端不得包含秘密。

## 2026-07-24：开发者 NFC 管理台与统一空卡

空白实体卡统一写入 `https://onetapreality.com/activate`，该入口只向 `GIFT_ADMIN_EMAILS` 白名单中已验证邮箱开放。开发者在原生 Development Build 或生产 App 内将当前卡重写为唯一 `https://onetapreality.com/gift/<token>`；Expo Go 不提供写卡能力。系统不读取或保存 NFC 芯片 UID，而是为成功初始化的卡生成短卡号和可选备注。

初始化先创建最长 15 分钟的预留；只有原生写入并读取验证成功后，礼品才转为可认领状态。过期预留自动作废且不得认领；已初始化、已认领或已绑定的卡均禁止覆盖或转移。管理操作保留服务端审计记录，所有管理员密钥、白名单和清理密钥仅存 Railway 服务端环境变量。
## 2026-07-24：离线中国地图多城市足迹打卡与搜索

全屏离线中国地图新增三大能力：城市足迹打卡弹窗、搜索跳转、视觉设计统一化。本轮不引入网络、地图 SDK、定位、账户、支付、分析、真实 NFC 或客户端秘密。

- **配色全局风格化**：Overview 和 Workspace 地图将硬编码的省份底色（`#EEF2EE`、`#DDEBDD`）替换为全局色板 `colors.paper`（`#EFE2CF`）与 `colors.accentSoft`（`#EFE2CF`），描边使用 `colors.accent`（`#B56B52`），背景使用 `colors.accentSoft`。
- **标记点同步延迟修复**：将 Workspace 中的标记点从 `View` + React state（`viewportState`）改为 `Animated.View` + `useAnimatedStyle`，直接在 UI 线程通过 shared values（`translateX`/`translateY`/`scale`）计算屏幕坐标，消除手势期间标记点滞后于地图 SVG 的延迟问题。
- **标记点 hit area 动态缩放**：按压区域现在随 `contentFrame.scale * viewport.scale` 动态调整（最小 44px），放大多倍后也能精确点击。
- **台湾标记补全**：新增 `taiwanInsetCenter` 坐标常量与 `taiwanCities` 集合，台北标记在 overview 和 workspace 中均正确显示于台湾插画中心位置。
- **城市搜索定位**：全屏地图顶部新增搜索栏，输入城市中文名或英文 slug 即可匹配；选择后通过 `withTiming` 动画将地图视口平滑跳转至该城市焦点并放大。
- **城市足迹打卡弹窗**：从 `地图/` 文件夹导入 10 张 PNG 至 `assets/city-checkin/`，缓存为 Metro require 注册表。10 座城市（北京、上海、杭州、西安、成都、拉萨、广州、南京、昆明、哈尔滨）点击标记时弹出 `CityCheckinModal`，以对应城市图片为底图，叠加打卡光点（已打卡/待探索双色）、图例、城市宣传语和足迹计数。弹窗采用全局字体（朝华标题 A + 朝华打字机）和纸感色板。
- 原始 `地图/` 文件夹已在导入完成后删除。

## 2026-07-24: Shop detail and shopping bag concept style

- The shop uses the fixed concept palette only: `#B56B52`, `#56708A`, `#EFE2CF`, `#F7F2EA`, `#2F2A26`, and `#D8CFC4`.
- Product cards now open a local product detail route with gallery, style, package, engraving, quantity, price feedback, and “add to shopping bag” controls.
- The shopping bag remains a local demo order-intent list, not payment or checkout. The page now uses hand-drawn paper cards, coupon/address/summary blocks, and a demo checkout action that exports the bag text.

## 2026-07-24：本地字体与手账编辑素材

本次继续只在新分支 `ui-version2-homepage` 中调整本地呈现和编辑体验，不改 `main`，不新增网络、账号、支付、真实 AI、真实 NFC、分析或远程素材依赖。

- 从本机 `AdventureX/字体/中文/` 解出中文字体到 `assets/fonts/`。应用主标题使用油茶馓子体，正文和输入默认使用朝华打字机，以靠近参考图的手绘海报与打字机排版氛围。
- 底部 TabBar 的版本 2 图标尺寸从 28×28 放大到 56×56，并加高 tabbar，避免图标和文字挤压。
- 画布编辑器新增文字字号、字色、字体选择；新增文字默认朝华打字机，并保留除油茶馓子体和朝华打字机之外的本地字体作为可选字体。
- 从本机 `素材库/sticker1..4/` 导入 80 张贴纸，按 4 个文件夹分组；从 `素材库/frame1..2/` 导入 40 张相框，新增“添加相框”入口。贴纸和相框都作为本地静态图片打包。

## 2026-07-24：底部 TabBar 版本 2 本地 UI

本次只在新分支 `ui-version2-homepage` 中调整首页视觉呈现，不改 `main`，不新增网络、账号、支付、真实 AI、真实 NFC、分析或远程素材依赖。

- 从本机 `AdventureX/UI/版本2/` 选取第 2、3、4、5 张 PNG，抠除棋盘格底纹后生成真正透明底的 `assets/tab-icons/` 图标。
- 底部 TabBar `src/app/(tabs)/_layout.tsx` 将“记忆 / 城市 / 商店 / 我的”四个 SVG 图标替换为版本 2 本地图片。
- 首页误放的 UI 预览区已移除；既有旅行册列表、创建入口、商店入口和本机数据生命周期保持不变。
## 2026-07-24：旅行册贴纸缩放与临时文字

旅行册继续只使用本地画布数据与既有持久化结构。贴纸字形尺寸必须由元素已保存的相对宽高及当前画布尺寸计算，使捏合后的字形与选中容器同步缩放。新建文字先以「点击编辑文字」作为仅在当前编辑会话内存在的待确认元素；点按或移动该画布文字元素、或实际修改文字内容后保留。未确认时，任意其他编辑操作会移除它；仅聚焦文字输入框不构成确认。不新增网络、账号、分析、支付、真实 NFC、依赖或数据库字段。

## 2026-07-23：未打卡城市浏览页

「城市档案」仅展示至少拥有一册已保存旅行记忆的城市，并通过本地路由提供「未打卡城市」浏览页。所有城市的一句宣传语与已打卡相册副标题分离，仅作为客户端随代码发布的本地文案。本次变更不引入新服务、登录、分析、支付或真实 NFC，也不新增网络请求或持久化数据。

## 2026-07-23：城市市花纪念挂坠商品新增

本次在商品目录中新增「城市市花纪念挂坠」品类（`souvenir-pendant`），10 座城市的普通版与特殊版共 20 个 SKU。不新增支付、账号、网络、真实 AI 或真实 NFC。

- 图片：微信传输的 10 张城市市花图从 `pic/` 移至 `assets/souvenirs/`，使用英文 slug 重命名；特殊版 SKU 的 `image` 字段引用这些图片，通过 `souvenir-images.ts` 注册表提供静态 require 供 Metro bundler 使用；普通版保持纯色占位。
- 数据模型（`catalog.ts`）：`CatalogSku` 新增 `image` 与 `tier` 字段；`SkuKind` 新增 `"souvenir-pendant"`；`demoCatalog` 按市花数据生成 10 城 × 2 版 = 20 个挂坠 SKU，成本设计确保 `computeDemoQuote` 精确输出 ¥42（普通版）与 ¥52（特殊版）。
- 城市注册表（`city.ts`）：新增 `luoyang`（洛阳，legacy-city）与 `suzhou`（苏州，legacy-city），含经纬度、相对坐标与地图焦点；`cities` 总数从 33 升至 35。
- 城市内容（`city-content.ts`）：为洛阳与苏州新增主题色、副标题与纪念品字段。
- 商店配置（`shop-options.ts`）：`getSkuTier` 改用 `sku.tier` 字段，不再根据城市限定推断；新增挂坠样式选项（标准链绳 / 礼盒装）与背面刻字支持。
- 商店页面（`shop.tsx`）：`SkuGridCard` 使用 `getSouvenirImage` 渲染特殊版真实花卉图片，基础款与旧商品维持纯色占位。
- 挂坠命名：普通版 `{简称}·{花名}坠`（如「京·玉兰坠」），特殊版叠加传统工艺名（如「京·玉兰坠·景泰蓝掐丝珐琅」）。
- 测试：`commerce-catalog.test.ts` 适配新结构与定价；`city-registry.test.ts` 更新城市数量至 35。

## 2026-07-23：旅行手账视觉风格改版

本次对所有主要页面进行纯视觉/布局/文案呈现改版，统一为「旅行手账 / 纸感 / 笨拙本真 / 温柔复古」风格。不改数据逻辑、路由、字段含义、交互行为，不加依赖。

- 共享设计套件 `src/components/ui.tsx`：新增 `ScreenTitle`、`PaperCard`、`SketchDivider`、`Tag` 等可复用纸感组件；品牌色板 `colors` 的四个锁定键（`background`、`accent`、`warmAccent`、`accentSoft`）不变。
- 六个主要页面重写：记忆首页、城市页、旅行册详情页、商店页、我的页、创建纪念册页。底部 tabbar 改为手绘 SVG 描边图标。
- 根布局 `_layout.tsx` 统一 Stack header 为纸感配色。
- 测试适配：新增 `jest.setup.ts` mock `useSafeAreaInsets`；`cities-screen` 和 `profile-screen` 测试适配新文案与统计数字拆分布局。
- 新增 `memory-card.test.tsx` 的「打开旅行册 {title}」无障碍标签保持不变；`brand-palette` 四色锁与 `brand-copy` 三段文案逐字保留。

## 2026-07-23：创建流程精简、图标化操作与书封面陈列

本轮只调整既有本地流程的呈现与交互，不新增网络、支付、账号、真实 AI、真实 NFC 或新依赖：

- 创建纪念册页改为行式表单：名称行内输入；日期与地点改为点击后弹出的本地选择弹层（日期为年/月/日自选，地点复用既有搜索与分组数据），城市长列表不再平铺在页面上；「生成旅行册草稿」按钮在选定照片后才出现。
- 确认草稿页底部只保留「保留草稿」，保存后直接返回首页；重新生成、丢弃、编辑改为导航栏右上角三个图标按钮（循环 / 垃圾桶 / 笔）。图标使用既有 react-native-svg 内联绘制，不引入图标库。
- 画布编辑页在按 id 找不到已保存旅行册时回退读取同 id 草稿，使草稿阶段可直接进入编辑；保存路径复用既有 updatePages，不改变数据生命周期。
- 统计口径统一为首页三项（旅行记忆册数 / 城市足迹 / 已收录照片）：首页移除统计块，个人主页数字框改用该口径；上一轮个人主页的"纪念品件数"不再展示。
- 首页「我的旅行册」改为两列"书封面"卡片：3:4 竖版、左侧书脊、右侧圆角、衬线标题；配色固定为 #EFE2CF 封面、#D8CFC4 书脊、#2F2A26 标题、#B56B52 饰线、#56708A 辅文。旅行册详情页顶部色块改为与内页同宽的方形封面页，编辑与删除移至导航栏右上角图标；杭州示例册保持只读。

## 2026-07-23：Node 与 npm 版本治理

本地开发、Railway 构建与未来 CI 的最低工具链要求为 Node `>=20.19.4` 和 npm `>=10.8.2`，允许使用满足最低要求的更高版本。`package.json` 是唯一版本来源：Railpack 读取 `engines`，npm 通过 `devEngines` 只拒绝低于最低要求的环境；移除会固定 npm 精确版本的顶层 `packageManager`。仓库不再增加重复的 `.nvmrc`、`.node-version`、自定义 Railpack 安装命令或 Railway Node 版本变量。测试开发依赖继续使用 `@testing-library/react-native@13.3.3`，其 peer dependency `react-test-renderer` 明确固定为与 React 一致的 `19.1.0`，避免 npm 解析到不兼容的 19.2。生产依赖、API、数据库、客户端及服务端运行时业务行为保持不变。

## 2026-07-23：全屏地图缩放标记与标签

全屏离线地图保留原生安全区和紧凑的浮层关闭控件，地图占用其余可用视口。缩放、平移及标记视觉尺寸继续只由 Reanimated shared values 在 UI 线程驱动；不在手势逐帧路径中使用 React 状态或 `runOnJS`。城市标签在缩放达到 1.8、标记达到最小可读尺寸并位于视口内时显示，始终只显示城市名称；按稳定的标记顺序抑制与先前可见标签相交的标签。此项仍只使用打包的本地省级 SVG、固定城市坐标和本地旅行数据，不增加网络、地图 SDK、定位、账户、分析、支付或真实 NFC。

## 2026-07-23：首批省级首府与直辖市城市覆盖

城市覆盖改由本地、静态的中央城市注册表维护。首批包含全部省会（含台北）、自治区首府以及北京、天津、上海、重庆四个直辖市；香港和澳门不在本批范围。为保证既有 SQLite `memories.city` TEXT 数据仍可读取，原有深圳 slug 继续作为遗留可选城市保留。注册表提供稳定 ASCII slug、中文名、城市类别、所属省/自治区/直辖市，以及离线中国 SVG 的相对坐标和本地焦点；不引入数据库迁移、网络、定位、地理编码、地图瓦片、密钥或分析。创建页改为原生搜索和分组列表，所有地图标记都保留无障碍名称和已保存记忆数量，概览仅展示已访问标记的文字以避免标签碰撞。

## 2026-07-23：离线中国省级地图与全屏浏览

城市地图改用随应用打包的 `@svg-maps/china@2.0.0` 静态省级 SVG path 数据，以显示完整中国地图与省级边界。数据遵循 CC-BY-4.0，应用内显示来源说明，并在 `docs/ATTRIBUTIONS.md` 记录完整归属。地图仍不使用网络、地图 SDK、定位、WebView、外部图片、账户、密钥、分析、支付或真实 NFC。

地图概览可通过空白地图区域或明确的全屏按钮进入 Expo Router 原生全屏模态路由；城市标记仍直接进入对应城市。全屏地图的双指缩放和平移只在 Reanimated shared values 中逐帧更新，缩放范围为 1 至 3.5，平移按已测量布局限制；React 状态只在手势结束时保存可选快照，避免逐帧桥接和双指手势崩溃。

## 2026-07-23：商店双列陈列、本机收藏与订购记录，个人主页档案化

本次改造商店与个人主页两个板块，全部数据仍只保存在本机，不新增支付、账号、网络、真实物流或分析：

- 商店页改为两列网格卡片：方形色块占位图（无真实商品照片，后续由人工替换）、名称、款式说明与演示价；卡片右上角提供星标收藏（空心星 → 实心黄星），收藏 SKU id 存入本机 kv-store（`luyi.shop.favorites.v1`）。
- 纪念品详情页保留现有结构；「提交订购意向」不再被价格反馈选项阻塞，价格感受与愿付价位改为选填。提交仍只写入本机订购意向记录。
- 订购意向记录扩展为"模拟订单"呈现：按提交时间与 SKU 制作周期用纯函数推导演示物流状态（已确认 → 制作中 → 已寄出 → 已送达），不采集地址、不产生真实订单；旧记录字段保持兼容。
- 个人主页顶部简化为头像、昵称与一句签名（`LocalProfile` 新增 `bio`，设置页可编辑）；下方三个数字框：城市足迹、累积旅行册、拥有纪念品件数（由订购意向数量合计）；再下方为简约列表入口：我的订单、我的收藏、去过的城市、回收站、意见反馈、本机数据与隐私声明。
- 新增回收站页：列出状态为 `discarded` 的本机记忆，支持恢复为已保存或彻底删除；`memory-repository` 增加对应查询与恢复函数，不改变现有表结构。
- 新增意见反馈页：复用既有 `feedback-store.ts`，以 kv-store 作为存储适配器，仅在本机保存与导出文本。

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

## 2026-07-22：Expo API Routes 后端接口骨架

本阶段新增 Expo Router API Routes、Turso/libSQL 与 Drizzle 的后端接口骨架。首期只实现匿名设备注册、能力探测和旅行册 CRUD 接口；现有 `luyi.db` 仍是 app 的唯一业务数据源，客户端不自动同步、不双写、不替换本地仓储。

- 匿名身份使用安装随机 ID 与不透明 bearer token；token 只以 SecureStore 形式保存在客户端，服务端只保存带 pepper 的 hash。
- 云端 DTO 只包含标题、城市、日期、状态、照片数量、文字和脱敏页面布局；不上传照片二进制、本地照片 URI、精确位置或其他秘密。
- 服务端 schema 独立于本地 SQLite，使用 `devices`、`memories`、`memory_pages` 三张表；migration 由 Drizzle 生成并以不可修改的版本化 SQL 提交。
- 本阶段不引入账号、支付、分析、对象存储、自动同步、冲突解决、真实 AI 或真实 NFC，也不执行真实 EAS/Turso 部署。

## 2026-07-23：统一开发入口与 Railway 部署适配

- 本地开发继续由一个 Expo dev server 同时承载客户端资源和 `/api/*`，不要求分别启动前后端。
- 生产后端以 Expo Web server export 为唯一构建产物，通过 `expo-server` 的 Express adapter 在 Railway Node 服务中运行。
- Railway 进程必须监听平台注入的 `PORT`，健康检查使用 `/api/health`，部署前应用 Drizzle migration。
- Web 和开发期 native 请求继续使用相对 `/api/*`；生产 native 通过 `EXPO_PUBLIC_API_ORIGIN` 同时配置 API client 与 Expo Router `origin`。
- 不引入第二套 Express 业务路由、Railway PostgreSQL、自动同步、照片上传或客户端秘密；Express 只负责托管 Expo 导出物。

## 2026-07-23：后端数据库改用 Railway PostgreSQL

- 在首次云部署前取消 Turso/libSQL 后端方案，改用与 API Service 位于同一 Railway Project 的 PostgreSQL Service；App 本地 `expo-sqlite` 及 `luyi.db` 保持不变。
- API Service 只读取 Railway 引用变量 `DATABASE_URL=${{Postgres.DATABASE_URL}}`，通过私有网络连接；继续由 `DEVICE_TOKEN_PEPPER` 保护匿名 bearer token hash，不向客户端暴露数据库凭据。
- Railway 的共享仓库配置在 pre-deploy 阶段仅当服务端变量 `RUN_DB_MIGRATIONS=true` 时运行 Drizzle migration。API Service 设置该变量；短生命周期的维护 Cron 不设置该变量，也不取得 `DATABASE_URL`。
- 服务端使用 Drizzle PostgreSQL schema 与 `node-postgres`；repository 测试和 migration 测试使用内存 PostgreSQL 模拟器，不连接生产数据库。
- Turso 尚未创建且不存在云端生产数据，因此本次允许将尚未部署的 `drizzle/0000_initial.sql` 与 meta 重建为 PostgreSQL baseline，不迁移本地 `.data/backend.db`。该 baseline 部署后恢复“已应用 migration 不可修改”的规则。
- 云端 API 契约、设备隔离、硬删除与外键级联行为保持不变；不新增账号、自动同步、照片上传、支付、分析、真实 AI、CI 或客户端秘密。

## 2026-07-23：Expo 图标素材入口

保留 `app.json` 现有的 `icon.png` 与 `expo.icon` 路径，直接替换对应的本地图片和 `.icon` 图层定义，确保 Expo Go 预览与 iOS 原生图标不再引用默认 Expo 图形。

## 2026-07-23：半本书式旅行册草稿编辑器

- 草稿确认页直接承担编辑职责，不再通过右上角铅笔进入独立编辑页；重新生成、丢弃与最终“保留草稿”仍保留。
- 抽取受控的共享 `BookCanvasEditor`，同时服务草稿自动保存和已保存旅行册的显式保存流程。书页以单张 3:4 竖版纸页呈现，奇偶页交替模拟内侧书脊、外侧圆角与纸张阴影。
- 采用轻量原生翻页反馈：页面跟随横向手势位移，并叠加轻微透视、`rotateY` 与阴影变化；位移达到页面宽度 22% 或速度达到 650px/s 才翻页，首尾页不越界。实现只使用现有 Gesture Handler 与 Reanimated，不引入第三方翻页库。
- 元素坐标、尺寸、旋转与层级继续写入既有 0–1 归一化 Canvas JSON，不修改 SQLite schema，也不迁移旧方形画布。渲染和变换计算扩展为分别使用矩形宽高。
- 未选中组件不捕获移动，单次横滑用于翻页；双击组件后才进入元素编辑。选中组件内部起始的拖动、缩放和旋转只编辑该组件，空白区域仍可翻页；点击“完成”或成功翻页退出选择。
- 页面管理保留本地照片选择、添加、删除、前移与后移，并禁止删除最后一页。贴纸继续全部使用本地元数据，增加“全部、情感、旅行、日常、自然”五个标签。
- 草稿页面写入复用 `updateMemoryPages`，但不刷新完整已保存记忆列表。自动保存队列一次只执行一个 SQLite 写入，写入期间的新编辑合并为最新快照；文字输入使用 400ms debounce，手势在结束时保存，其余结构操作立即保存。
- “保留草稿”必须等待自动保存队列清空，失败快照未重试成功时不得完成确认；重新生成和丢弃与保存生命周期串行协调，并可明确清除被覆盖的失败快照。
- 本次不新增网络服务、远程素材、账号、支付、分析、真实 AI、真实 NFC 或客户端秘密。

## 2026-07-23：书页空白点击取消组件选中

- 组件选中后，轻点书页内部且没有组件覆盖的空白区域会退出组件编辑状态。
- 点击组件内部、书页外工具栏、贴纸栏、页码或页面管理区域不会触发取消选中。
- 由 `CanvasPage` 的书页底层点击回调处理，不使用坐标碰撞检测；保持现有双击选中、组件手势和横滑翻页语义。
- 取消选中只改变本地 UI 状态，不修改页面数据，也不触发自动保存。

## 2026-07-24：本地透明素材与页面背景

- 贴纸和相框继续作为可拖拽画布元素保存；导入时将素材中烘焙的浅灰/白色透明预览网格转为真实 alpha 通道，避免在 App 内出现棋盘底。
- 背景素材来自本地 `素材库/background`，作为 `CanvasLayout.backgroundId` 保存在当前页 layout 上，并由 `CanvasPage` 铺在所有元素最底层。
- 背景不是可拖拽元素，不占用 zIndex；用户可在素材栏切换到“背景”模式选择或移除当前页背景。

## 2026-07-24：版本1概念图风格与素材性能

- 查看 `产品概念图/版本1` 的 20 张参考图后，仅调整字体、颜色、线条和资源体积，不改变现有页面布局、导航结构或画布交互。
- 主标题字体改为喜脉喜欢体；正文与默认添加文字使用朝华打字机的真实 family `ZhaohuaTypeWriter`，并减少自定义中文字体上的粗体权重，避免 iOS/Expo 因字重不匹配回退系统字体。
- App 启动只加载主标题和正文两种字体；画布字体列表中的其他本地字体延后到编辑器中后台加载。
- 贴纸缩至 512px 以内、相框缩至 720px 以内并保留透明 PNG；背景缩至 720px 以内并改用压缩 JPG，降低 Expo Go 加载和打包成本。
- 全局风格采用版本1概念图的米纸底、砖橙主色、细墨线和轻手账质感，保留现有信息密度与页面结构。
## 2026-07-23：Lockfile 与生产构建合并门禁

- Railway Build image 失败的根因是 `package-lock.json` 缺少依赖图要求的 peer 节点；已有 `node_modules` 会掩盖该问题，干净 `npm ci` 可稳定复现。
- 新增 GitHub Actions，在 Pull Request 和 `main` push 时强制执行干净安装；Node 20.19.4 验证最低支持线，Node 24 运行 lint、typecheck、全量测试及 Railway 同款 `build:server`。
- 工作流检查在远端首次出现后设为 `main` 必需状态检查；配置时保留已有保护规则。
- 依赖变更必须同时更新 `package.json` 与 `package-lock.json`，并以 `npm ci` 而非已有依赖目录中的开发启动作为合并依据。
- 保持 Node/npm 为最低版本及以上的兼容范围，不改回封闭版本限定。

## 2026-07-24：城市详情插画档案页

- `/city/[city]` 采用本地纸本旅行手账式档案布局：城市名、地区、既有宣传语、相册数量与本地插画/线描主视觉；不请求远程图片或新增依赖。
- 已保存（及兼容的旧版）旅行记忆可在页内作为精选与展开列表浏览，草稿和已丢弃记忆不计入；创建、管理及记忆详情继续复用既有本地路由。
- 本次仅调整客户端展示和交互，不引入网络服务、登录、支付、分析、真实 NFC 或客户端秘密。
