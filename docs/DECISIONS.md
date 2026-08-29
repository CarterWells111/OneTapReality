# 决策记录

## 2026-08-23：共享相册暂存与发布分离

Owner/editor 共享编辑页的两个动作必须具有不同的远程效果。本决策取代同日“保存当前修改会发布新版本并留在编辑页”的旧行为：

- “暂存当前修改”只向 `BookCanvasEditor` 请求稳定页面快照，并把该快照保留在当前共享编辑会话内存中；不得调用 owner/editor 发布 API、上传 R2 媒体、增加共享相册版本或通知礼品权限者。
- 暂存后的内容继续视为未发布修改。离开编辑页仍必须确认放弃；退出页面、关闭应用、登出或账号切换后不恢复，不新增本地或服务端共享草稿。
- 名称、旅行日期与 Canvas 内容属于同一共享编辑会话。标题和日期编辑复用本地相册的受控元数据编辑组件，但不得回写 owner 设备上的本地原相册。
- “保存并发布更新”才使用当前内存快照执行既有媒体复用、R2 上传、CAS 版本检查和 owner/editor 发布流程。没有修改时直接返回预览，不创建空版本。
- 共享相册新增 nullable `travel_date` 字段及对应内部 API 契约。新相册首次发布时写入本地旅行日期；历史共享相册保持 `null` 并显示“未设置旅行日期”，不得用发布日期伪造。发布后 viewer/owner/editor 都读取相同名称与日期。
- 暂存和发布都必须等待 Canvas 变换及样式草稿收敛；准备失败保留当前编辑会话供重试。成员权限、私有 R2、第三方服务与 viewer 只读行为保持不变。

## 2026-08-23：Owner 与 editor 统一共享相册预览和编辑入口

礼品管理页只负责 owner 首次从已有本地旅行册发布共享相册。礼品已有共享相册后，不再显示本地旅行册选择、封面选择或“更新共享相册”，也不允许在此处把礼品改绑到另一册本地旅行册；只显示“查看当前共享相册”。“新建本地旅行册”入口从礼品管理页删除，创建行为继续留在主页。

- Owner 与已激活 editor 加载共享相册后直接进入完整 `PageReader`，从第一页封面开始，不再经过独立“打开相册”步骤；viewer 继续使用现有只读封面和打开流程。
- Owner/editor 的共享预览导航栏使用与本地旅行册一致的铅笔入口，进入独立共享编辑路由并复用同一 `BookCanvasEditor`、媒体映射和发布逻辑。页面内不再保留冗余的“编辑共享相册”按钮。
- “保存当前修改”只在内容变化后发布新版本并留在编辑页；“保存并发布更新”在有变化时发布后返回预览，无变化时直接返回且不创建空版本。共享编辑仍不新增本地草稿。
- 版本冲突、权限撤销、私有 R2、owner/editor 服务端权限复核和 staging/production 隔离规则保持不变；本次不新增产品 API、数据库字段、第三方服务、支付或分析。

## 2026-08-21：NFC staging 测试批次与本地模拟入口

NFC 礼品的账号、认领、首次激活、共享相册和停用回归使用现有独立 staging API、PostgreSQL、Resend 与私有 R2，不新增远程测试端点、第三方服务或客户端秘密。测试批次只能调用 `https://api-staging.onetapreality.com`，礼品 URL 只能来自 `https://staging.onetapreality.com`；任何 production origin、非 staging bucket 或缺少显式确认的运行都必须在写入前失败。

- 批次工具通过现有管理员与礼品拥有者 API 创建未认领、owner、viewer、editor 和停用五种礼品状态。viewer/editor 只预置邀请，不预置激活；首次激活仍必须由对应已验证账号持有礼品 token 后完成。
- 三个临时账号从一个受控邮箱派生 `+nfc-owner`、`+nfc-viewer`、`+nfc-editor`，只由发布负责人临时追加到 staging `ALPHA_ALLOWED_EMAILS`。不得清空白名单、扩大 production 登录或把邮箱、验证码、会话 token、礼品 token 写入 Git/日志。
- 本地 NFC Lab 是由脚本生成且被 Git 精确忽略的 Expo Router 页面。按钮只把应用导航到真实 `/gift/<token>` 路由，不 mock API、不跳过邮箱验证或权限检查；本地 demo 相册继续按当前规范化账号隔离并只使用仓库内图片。
- PR 准备必须先停用/退休批次礼品并完成媒体清理，再移除临时邮箱、本地 manifest 和生成页面。任何未清批次或测试凭据残留都阻止 PR 准备完成。
- 本地按钮只能验证应用收到 NFC 深链后的业务链路，不能证明实体标签的 NDEF 写入、写后读回、容量、锁屏唤起或射频可靠性；三张 staging 实体卡验收仍是独立发布门槛。

## 2026-08-22：主页旅行册封面复用页面预览的画布缩放关系

主页“我的旅行册”中的封面必须继续以旅行册第一页的 `CanvasPage` 为唯一内容来源，并与页面预览使用同一套“标准画布宽度 → 展示宽度”的内容缩放计算。缩略展示时，文字字号、行高、内边距、换行与截断必须随画布等比例缩小；图片、背景和其他元素继续按第一页布局中的归一化几何信息渲染。主页保留现有两列布局、封面尺寸和圆角，不生成或缓存独立封面截图，也不改变相册保存格式。旧相册缺少画布布局时，仍先通过现有兼容布局转换，再使用相同缩放关系渲染。

完整设计见 `docs/superpowers/specs/2026-08-22-home-album-cover-preview-consistency-design.md`。

## 2026-08-17：本地相册照片只持久化容器相对引用

本地相册不得把包含 iOS 应用容器 UUID 的绝对 `file://` URI 作为长期照片标识写入数据库。应用复制照片到当前账号和相册专属的 `Documents/photos/accounts/...` 目录后，只保存从 `Documents` 开始计算的规范相对引用；展示、编辑、导出和礼品发布前再基于当前 `FileSystem.documentDirectory` 解析。这样 TestFlight/App Store 更新导致容器根路径变化时，数据库引用仍然有效。

旧绝对 URI 在读取时按 `photos/accounts/...` 或旧 `photos/...` 后缀重定位到当前 Documents，并在确认文件存在后写回相对引用。无法重定位的临时 URI 不得被伪装为已恢复；新选择照片必须在复制且验证目标文件存在后才能写入相册，失败时保留编辑态并明确提示。退出登录、账号切换和普通应用更新不得删除照片；只有用户永久删除相册、清空该账号本地数据或卸载应用时才超出保留保证。该变更不上传本地原件，不改变账号隔离、共享权限或环境隔离。

## 2026-08-17：产品与原生发布范围收敛为 iPhone / iOS

OneTapReality 当前及可预见计划仅支持 iPhone / iOS，不再把 Android 作为后续 Backlog 或待重新评估平台。本决策取代此前“第 3–4 周重新评估 Android”、保留 Android package、Android App Links 与 Android development build 的旧规则。

- Expo 配置不再声明 Android package、adaptive icon 或 intent filters；EAS 与 npm 不再提供 Android 专用构建/启动入口。
- 网站只发布 Apple AASA，不再生成或提供 `assetlinks.json`。实体礼品继续使用同一 HTTPS URL，并只通过 iOS Universal Links 与网页回退进入产品。
- React Native 依赖与业务代码中的无害 Android 平台判断可保留作为兼容实现，不代表测试、发布或支持 Android，也不得出现在对外能力承诺中。
- Android 图标素材暂作为未引用历史文件保留。Expo Go 可能显示依赖自身的 Android 通用提示；照片权限与 NFC 的完整验收只在 iOS Development Build/TestFlight 进行。
- iOS Bundle ID、`luyi.db`、账号隔离、staging/production 隔离及本地升级保留保证不变。不新增第三方服务、支付或分析。

## 2026-08-17：登录页使用原生键盘避让与空白点击收起

登录页不得让系统键盘遮挡邮箱、验证码或提交按钮。页面使用 React Native 原生 `KeyboardAvoidingView` 与可滚动内容容器，在 iOS 上按 `padding` 避让；保留的 Android 分支仅是无害兼容实现，不构成发布或支持承诺。不新增第三方 keyboard-aware 依赖。点击页面或登录卡片内的非交互空白区域调用 `Keyboard.dismiss()`，输入框和按钮交互不得被误判为空白点击。邮箱输入在验证码出现后支持“下一步”聚焦验证码，出现前显示“完成”并关闭键盘；iOS 验证码数字键盘额外提供可见的原生输入附件“完成”按钮，页面拖动也可关闭键盘。

## 2026-08-17：保存相册后返回刚刚编辑的页面

本地相册、礼品拥有者共享相册与已激活 editor 的共享相册继续使用同一套 Canvas 编辑语义。保存或发布成功后退出编辑态并进入完整只读预览，但必须按稳定页面 ID 打开用户保存前正在编辑的页面，不得回到封面。页面被删除或服务端新版本不再包含该 ID 时，回退到原索引附近仍存在的有效页面；保存失败则保留当前编辑页和编辑态，不改变 viewer 的只读权限。

编辑器翻页必须与只读阅读器一样，按稳定页面 ID 在同一图层列表中保留已经渲染的目标 `CanvasPage`。动画提交后目标页不得卸载再重建，以免图片重新解码闪烁；缓冲目标页只负责渲染，必须禁用元素选择、拖动和编辑，成为当前页后才恢复交互。

## 2026-08-17：相册翻页保留目标页实例并预渲染相邻页

本地相册与共享相册继续复用同一个只读 `PageReader`。翻页动画期间已经渲染并显示的目标页，在动画提交后必须凭稳定页面 ID 继续作为当前页实例，禁止卸载后在另一层重新创建；否则 Canvas 图片会重新解码并短暂露出背景。阅读器仅保留当前页和本次翻页目标页的轻量双缓冲，不改变相册数据、页序、编辑逻辑或媒体权限。

## 2026-08-17：共享相册的 owner/editor 始终可进入同一完整编辑器

共享相册的编辑能力不得只存在于封面未打开状态，也不得因当前账号是礼品拥有者而退化为“重新选择本地相册发布”。礼品拥有者和当前仍具备读写权限且已激活的成员，在封面态与完整预览态都必须能进入同一套 Canvas 编辑器；只读成员始终只能查看完整相册。礼品拥有者通过 owner-only 相册读取和发布接口操作当前共享快照，读写成员继续通过 activated-editor 接口操作；两条路径都必须携带当前 `baseVersion`、复用经服务端验证属于当前礼品与版本的媒体，并继续执行提交时权限复核、CAS 冲突和私有 R2 清理规则。该能力只更新当前环境的共享版本，不自动修改或上传礼品拥有者设备上的本地原相册。

本地相册与共享快照是两套明确分离的编辑对象。本地相册只受当前登录账号归属约束，始终可编辑，不得读取或继承礼品中的 viewer/editor 角色；其详情页必须显式提供编辑、系统分享和绑定到礼品入口。绑定入口携带本地相册 ID 进入当前账号的礼品列表并在选择礼品后预选该相册，但只有用户再次明确发布时才会创建或更新云端共享快照。

## 2026-08-17：共享相册协作进入主线并取代旧 Beta 候选排除规则

经本次明确批准，共享相册封面、成员首次激活与读写协作作为同一功能链合并进入 `main`，对应不可变迁移依次为 `0008_shared_album_covers`、`0009_gift_member_activations` 与 `0010_shared_album_collaboration`。本决策取代 2026-08-16“相册封面不得进入同一 Beta 候选、预留为 `0009_shared_album_covers`”的旧排除与编号规则；尚未实施的 `0008_database_phase2` 不得再占用或改写这些已经进入主线的迁移编号，后续数据库维护必须从当前 journal 末尾另建迁移。

这次代码合并不等于执行数据库迁移、构建 EAS/TestFlight、部署 staging/production 或扩大测试范围；这些外部写入仍保持各自审批与环境隔离门禁。

## 2026-08-17：本地相册新选照片必须先持久化再进入画布

本地相册与草稿编辑器新选择的普通照片和封面图片，必须先复制到当前规范化账号键与相册 ID 对应的应用 `Documents` 目录；复制成功后才允许写入 Canvas 页面状态。复制失败时显示原生弹窗，保持画布不变，不得把 ImagePicker 临时 URI 写入 SQLite。现有整册持久化继续作为旧数据迁移和防御性兜底，不能代替选择时的严格复制。共享礼品编辑继续使用其私有 R2 发布流程，不绑定接收方的本地相册目录。卸载、换设备或 Bundle ID 变化仍不在本地保留保证范围内。

完整设计见 `docs/superpowers/specs/2026-08-17-local-photo-persistence-errors-design.md`。

## 2026-08-16：共享相册只读/读写权限、直接发布与受控管理

礼品拥有者在邀请成员时必须选择 `viewer`（只读）或 `editor`（读写），并可在分享后随时调整。两种角色在完成 NFC 高熵 token 首次激活后都能读取同一份完整共享相册快照；只读权限不得导致页面、布局、文字、照片或封面缺失。NFC 激活成功且相册已发布时直接进入共享相册路由，不再依赖“我的纪念品”列表二次匹配。

- `editor` 复用现有完整 Canvas 编辑逻辑，可增删照片和页面、修改文字、布局及顺序。编辑对象是当前环境中的共享相册，不会自动上传或改写拥有者设备上的本地原件。
- 编辑者提交后直接产生新的共享版本，无需拥有者逐次批准。提交必须携带读取时的基础版本；服务端在同一事务内锁定礼品并执行 compare-and-swap。基础版本落后时返回冲突，禁止旧内容覆盖最新版，客户端要求基于最新版重新编辑。
- 删除整份共享相册、删除其他成员或修改其他成员权限属于受控管理操作。拥有者可以直接执行；非拥有者只能提出申请，必须由拥有者批准后生效。邀请成员、停用礼品及其他礼品管理权继续只属于拥有者。
- 权限降为只读、成员被移除、礼品停用或停测开关关闭后，新的读取、上传、提交和管理申请必须立即被拒绝。服务端在创建上传会话和完成提交两个阶段都重新校验当前成员、激活、角色和礼品状态，避免权限撤销后的悬挂会话生效。
- 成员被移除后其激活随成员记录级联失效；重新邀请生成新成员记录并要求再次通过 NFC 激活。客户端不保存礼品 token，环境数据库与私有 R2 继续严格隔离。

完整设计见 `docs/superpowers/designs/2026-08-16-shared-album-collaboration.md`；实施计划见 `docs/superpowers/plans/2026-08-16-shared-album-collaboration.md`。

## 2026-08-16：本地相册账号隔离、真实第一页封面与 NFC 首次激活

本地旅行册不再作为安装级共享数据。所有旅行册、草稿、回收站记录与照片文件都必须绑定已验证账户的规范化邮箱（`trim().toLowerCase()`）；未登录时不得读取或修改。选择邮箱而非环境内用户 UUID，是为了让同一设备、同一 Bundle ID 的 Alpha、Beta 与 Production 更新或 API origin 切换继续识别同一账户，同时保持 staging/production 云端数据库、礼品、激活记录和 R2 对象严格隔离。本保证不覆盖卸载重装、换设备或 Bundle ID 变化。

- 本地 `memories` 增加账号归属。所有仓储读写必须在 SQL 层同时限定记录和账号；首个成功登录账号自动认领升级前无归属的历史记录，后续账号不能读取或接管。账号切换立即清空旧账号内存状态。
- 本地照片按账号与旅行册写入独立应用沙盒目录。文件迁移失败不得放宽数据库授权；本地原件不会因登录、升级或环境切换自动上传。
- 首页相册封面只渲染旅行册第一页的 Canvas layout，不再维护独立封面模板或依赖需要同步的顶层封面字段。
- 受邀邮箱只获得 NFC 激活资格。viewer 必须先通过该礼品的高熵 HTTPS token 完成一次激活，之后才能在“我的纪念品”列举和读取已发布快照；移除再邀请必须重新激活。静态 token 只能证明持有礼品链接，不能被宣传为能区分真实碰卡与链接转发。
- 本决定取代 2026-07-25“账号切换不按账户隔离本机旅行册”的旧规则，并收紧 2026-08-07 的受邀列表：未激活成员不得出现在可读相册列表中。只有用户显式发布礼品时，当前环境的共享快照与所选照片副本才上传到私有 R2。

## 2026-08-07：NFC 触碰直达相册封面与纪念品列表封面化（本地实施）

本次仅在本地工作区实施，不推送远端、不创建 PR、不部署 Railway、不修改 staging/生产资源。目标是让受邀用户 NFC 触碰后直接看到相册封面并可打开相册，返回后回到“我的纪念品”列表查看其他纪念品及对应相册；拥有者在发布共享相册时明确选择一张封面图。

- 发布契约新增可选 `cover`（图片 contentType + byteSize）：服务端创建独立 R2 封面对象并返回 `coverUpload.uploadUrl`，提交时校验元数据；旧封面对象在替换、停用与过期会话清理时纳入既有 `gift_media_cleanup_jobs`。
- `shared_albums` 新增可空列 `cover_object_key`、`cover_content_type`、`cover_byte_size`（migration `0008_shared_album_covers.sql`）；旧相册无封面时客户端使用“标题 + 封面色”排版封面，不阻塞打开相册。
- 按已定稿 `docs/NFC-API-COORDINATION.md` 实现 `GET /api/gifts/invited` 与 `GET /api/gifts/invited/:id/album`，并扩展相册对象统一返回 `cover`（R2 签名 URL）；`GET /api/gifts/owned` 同步追加 `album` 摘要。所有新端点继续受 `GIFT_SHARING_ENABLED` 停测开关约束，不返回 ownerEmail 或 token。
- 客户端：发布页增加封面选择；“我的纪念品”卡片显示封面缩略图并支持 `open=<giftId>` 自动打开相册封面页；只读相册页改为“封面态 → 打开相册 → 阅读态（复用 PageReader/CanvasPage）”，返回键回到列表；NFC 入口对受邀且有相册的用户重定向到 `/gifts?open=<giftId>`。
- 阅读器按页面图片元素数量顺序把相册 `media` 映射进页面布局，映射不上的图片省略；不修复“仅 layout 图片无 photoUri 不进入媒体”的既有问题。
- 不引入新第三方服务、支付或分析，沿用现有 R2/统一邮箱会话架构。
## 2026-08-16：Staging TestFlight 内部演练

为让获准的 iOS 内部成员通过 TestFlight 安装真实 NFC 测试包，新增 EAS `staging-testflight` store 分发与同名 submit profile。`staging-testflight` 只连接 staging API：该构建显式使用 EAS `preview` environment，并以内联值把客户端 API 固定为 `https://api-staging.onetapreality.com`；沿用现有 App Store Connect 应用和 Bundle ID，但不访问 production API、数据库、R2 或礼品。发起构建前只读核对 `preview` 环境变量名称，不得含 production origin 或客户端不应持有的服务端 Secret。

- `alpha` 保留为登记 UDID 后通过 EAS 链接安装的 ad-hoc 路径；`staging-testflight` 是通过 App Store Connect 内部群组安装的路径。两者只用于同一组 staging 三卡与 P0 演练，不互相冒充 production 验收。
- 环境隔离、本地质量门禁和 iOS 静态预检通过后，可由发布负责人单独批准其中一种 staging 原生构建。EAS 云端构建与 App Store Connect 提交是两个独立审批点；配置 PR 不执行任一操作。
- `staging-testflight` 脚本强制两段式运行：没有 `--no-submit` 的首次构建会被拒绝，提交阶段必须提供已经核验并再次批准的 build ID。
- submit profile 固定绑定现有内部测试群组 `OneTapReality开发员测试`。该目标群组已启用自动分发；提交前必须确认它仍是唯一启用自动分发的内部群组，其他内部群组均须关闭自动分发。不得新建或改选群组、添加外部测试者，亦不得点击 App Store 的公开审核或发布操作。
- 获准的 staging 内部 TestFlight 安装不代表 production 或公开 App Store 放行。三卡、完整礼品生命周期和 P0 演练未通过前，仍禁止 production 写卡、收款、发货和扩大测试范围。

## 2026-08-16：首批 iOS Beta 实体卡准入

四周 Beta 计划的第 1–2 周仅支持 iPhone / iOS。准入以 iOS Universal Links、EAS `alpha` 原生构建、三张 staging NFC 样卡和 iPhone 真机完整礼品生命周期为准；Android App Links、release SHA-256、`assetlinks.json` 和 Android 真机测试在第 3–4 周重新评估并保持非阻塞 Backlog，未经新决策不得自动纳入发布。本轮不得宣称 Android 已完成，但 Android 未完成不阻断前两周 iOS Beta。

- staging 基础设施、iOS AASA、Resend、白名单与礼品 URL 来源沿用已经核实的脱敏证据；实体卡只写 `staging.onetapreality.com`。
- EAS `alpha` 或 `staging-testflight` 构建、`staging-testflight` 提交、staging 写入、P0 开关演练、production 礼品预登记和部署仍分别审批；production Railway 自动部署保持关闭。
- 本地质量门禁和 iOS 预检通过后，可单独批准生成并安装仅用于 staging 演练的首个 `alpha` 内部构建，或生成并经另一项批准提交 `staging-testflight` 内部构建，以完成实体卡前置测试；这不等于 production、公开 App Store 或扩大测试成员的放行。
- 三张样卡分别使用脱敏编号 `IOS-STG-001`、`IOS-STG-002`、`IOS-STG-003`。记录不得包含完整 URL、token、验证码、邮箱、照片或 Secret。
- 四项本地质量门禁、本地 iOS 预检、三卡写入/读回/锁屏碰卡、完整礼品生命周期、环境隔离和 P0 演练全部通过后，才允许申请首批 5 套 production 写卡、production TestFlight 或扩大测试成员的审批。

## 2026-08-16：Beta 发布准备与数据库迁移顺序

首批 Beta 候选从执行时最新 `origin/main` 建立独立工作树，只纳入已经核实的 staging 脱敏证据以及后续 P0/P1 修复。当前主工作树中未提交的相册封面功能、数据库维护第二阶段和其他 P2+ 功能不得进入同一个 Beta 候选版本，也不得通过脏工作树构建 EAS 或 TestFlight 包。

- 数据库维护第二阶段继续独占 `0008_database_phase2`，在单独分支、单独 PR、单独备份/恢复验证和单独生产审批中发布。
- 相册封面功能只能在第二阶段迁移之后重新基线化，迁移编号固定为 `0009_shared_album_covers`；其 Drizzle journal、snapshot 和 schema 必须基于已经包含 `0008_database_phase2` 的分支重新生成，不能只改 SQL 文件名。
- Beta 候选保持当前已发布 schema 7 契约，不包含上述两个 migration；首批 5 套稳定前不把数据库维护或相册封面与客户端候选捆绑发布。
- 本地整理、测试与只读配置核对不触发云端构建。push、PR、GitHub 运维 Issue、Railway 变量写入、EAS 构建、TestFlight、数据库迁移和部署仍分别审批。

## 2026-08-16：数据库维护第二阶段候选迁移

第一阶段自北京时间 2026-08-09 09:00:58 起完成至少 168 小时稳定观察。生产只读复核、仓库外本地备份、PostgreSQL 18 本地恢复和第二阶段本地迁移演练均已通过：8 项约束无历史违规并可验证，两张遗留表均为空且无外键、触发器、视图或生产路由引用，删除后其余 18 张表行数不变，礼品卡审计事件继续保留。

- 第二阶段只移除未被当前统一账号认证使用的 `gift_email_codes`、`gift_sessions` 及对应仓储声明和遗留测试，不改变 UTC ISO 文本时间列，不新增依赖、服务、绑定或费用项目。
- 新增 `0008_database_phase2.sql`，按“锁定并确认遗留表为空、验证约束、无 `CASCADE` 删表、schema 版本升至 8”的顺序执行；出现新数据、历史违规或外部依赖都会使 migration 停止。
- API readiness 最低版本同步升至 8。迁移目前只是本地候选，尚未部署；推送、PR、生产 migration、Railway 部署和首次维护调用继续分别审批。

## 2026-08-06：App Link 网页引导页（web fallback）

按既有计划 `docs/superpowers/plans/2026-07-25-app-link-web-fallback.md` 实现浏览器打开 `/gift/<token>` 与 `/activate` 时的安装引导页，避免未安装 App 时返回 404；引导页不包含礼品 token，也不携带任何业务逻辑。生产与 staging 官网共用同一份 `website/` 构建产物，不新增网络、云服务、支付、分析或客户端秘密。

## 2026-08-06：首批 Beta 功能范围冻结与候选构建规则

进入首批 20 套受邀 Beta 内测前，冻结 Beta v1 功能范围并固化候选构建门槛，避免功能漂移与未经验证的扩量。

- 冻结范围：独立 staging 环境（Railway Service + PostgreSQL、私有 R2 bucket、`staging.onetapreality.com` / `api-staging.onetapreality.com`、独立 secrets 与 Resend 测试发件人）；iOS NFC 实体样卡全流程（写卡/碰卡、深链、邮箱验证码登录、认领、发布共享相册、受邀只读查看、停用、R2 对象删除）；`GIFT_SHARING_ENABLED` P0 停测开关与管理员停用能力；统一邮箱验证码登录。
- 明确排除：App 内支付、公开 App Store 发售、首批 5 套之外的扩量、以及与本路径无关的新功能；上述需求记入 Backlog，冻结至 Beta 复盘。
- 候选构建只接受 P0/P1 修复：P0 = 安全/隐私/数据丢失/主流程阻断；P1 = 激活/登录/认领/发布/停用错误。P2+ 一律延后。
- 每次候选构建门槛：干净 `npm ci` 后 `lint`、`typecheck`、`test:ci`、`build:server` 全部通过，并在 staging 完成对应回归；由发布负责人批准后才进入 TestFlight 候选构建。
- 周会环境验收以脱敏演练记录为准（`docs/operations/REHEARSAL-RECORD.md`）；staging 未绿灯前不收款、不写生产卡、不扩量。

## 2026-08-02：TestFlight 上传与内测发布操作指南

新增 `docs/release/TESTFLIGHT-UPLOAD.md`，把从 Windows 使用 EAS 云端构建 iOS production、提交 App Store Connect（App ID `6794186067`）、分配 TestFlight 内部/外部测试员的完整流程固化为可供另一位开发者 agent 直接执行的指南。指南引用当前发布分支 `codex/testflight-internal` 及既有 EAS 配置（`cli.appVersionSource: remote`、`autoIncrement: true`、`submit.production.ios.ascAppId`），不改变应用代码、依赖或 EAS 配置。

- 固定信息以 `eas.json` / `app.json` 为准：显示名 `OneTapReality一触如初`、iOS Bundle ID `com.onereality.onetapreality`、产品版本 `1.0`、EAS projectId `12831d3a-34cb-49a1-9efa-6bfd26afef7c`、production API origin `https://onetapserver-production.up.railway.app`。
- 本次只新增发布操作文档，不新增云服务、支付、登录、分析或真实 NFC。

> 2026-08-03 远端已合入官方 `docs/release/TESTFLIGHT-RELEASE.md` 与 `scripts/release-ios-testflight.cjs` 自动化手册，取代本条目所述草稿；草稿已保留在 2026-08-06 本机备份中，不再作为现行指南。

## 2026-08-01：数据库维护加固与零新增费用运行边界

NFC 礼品维护不再使用独立 Railway Cron Service。现有 API Service 保留受服务端密钥保护的维护端点；Cloudflare Workers Free 计划中的单个小时级 Cron 只负责向该端点发送一次短请求，成功的礼品写请求在维护超过 90 分钟未完成时执行严格限额的后台兜底。两种入口共享数据库租约和批次上限，不新增常驻服务器、数据库、队列、付费监控、云备份或客户端秘密。

- 定时维护每次最多领取 50 个媒体清理任务、并发最多 5 个、运行最多 20 秒；请求兜底最多处理 5 个、运行最多 2 秒。任务使用租约避免并发重复领取，删除失败指数退避，累计 10 次后进入死信。
- 技术数据按最小保留期清理：验证码与限流桶 6 小时，过期或撤销会话 7 天，完成的发布会话 24 小时，完成或死信的媒体清理任务 7 天；礼品卡事件作为审计记录长期保留。
- 认证验证码使用加密安全随机数；新验证码使旧验证码失效，邮件发送失败不占发送额度。单验证码最多失败 5 次，单 IP 在 15 分钟内最多失败 20 次；数据库只保存使用现有认证 pepper 生成的 IP 哈希，不保存原始 IP。
- 数据库变更分两阶段追加 migration：第一阶段只增加租约、限流、维护状态、schema 版本、索引及可验证约束；遗留 `gift_email_codes` 与 `gift_sessions` 仅在首阶段稳定至少 7 天、重新完成本地备份和恢复验证后，才通过单独批准的第二阶段 migration 删除。现有 UTC ISO 文本时间列本轮不改变类型。
- 每次实施都必须从执行时远端最新 `main` 创建隔离分支。任何 push、Pull Request、生产数据库读取或写入、Railway 部署、Cloudflare Worker/Secret/Cron 变更及生产维护请求都需要 production release owner 在执行前单独批准；无法确认处于免费额度或出现新计费项目时立即停止。
- 生产迁移前只做本地 `pg_dump` 和本地恢复验证，不启用 Railway 快照或 R2 自动数据库备份。Cloudflare Worker 不绑定 R2、KV、D1 或其他存储；R2 仅执行既有媒体删除。

## 2026-07-30：OneTapReality 团队协作记录

项目在仓库内维护唯一的协作事实源：GitHub Issue 记录范围与负责人，Pull Request 记录改动与验收证据，`docs/operations/` 记录环境、发布和实体卡批次。模板不会记录 token、卡号、邮箱、截图中的隐私信息或任何密钥。

- 你是 production release owner；仅你持有 Railway、R2、Resend、EAS 和数据库的生产权限。其他成员通过 Issue、PR 和脱敏记录协作。
- 新功能、运维、实体卡和 P0 事件分别使用对应的 Issue 模板；任何上线必须有回滚条件、负责人、验证证据和部署日志。
- 公开产品名称统一为 OneTapReality；历史记录与 `.tralbum` 文件格式仅为兼容和审计保留，不作为当前品牌名称使用。

## 2026-07-28：Alpha 质量、公开事实与环境隔离

Alpha 的目标是改进发布质量和安全边界，而不扩大产品功能。`expo-file-system` 作为 Expo SDK 匹配的直接依赖保留现有 PDF 与 `.tralbum` 导出；PDF 分享采用最小测试覆盖生成、缓存复制、不可分享和失败提示。合并门槛固定为干净 `npm ci` 后 `lint`、`typecheck`、`test:ci` 与 `build:server` 全部通过，辅助开发仅可通过 PR 合并。

- 旅行册默认保存在设备；生成器不读取图像内容。用户登录并明确发布 NFC 礼品后，才上传该礼品的共享快照与照片到私有 R2；邮件、会话和礼品访问名单由服务端处理。
- staging 必须使用独立 Railway 服务、PostgreSQL、私有 R2 bucket、peppers、清理密钥和管理员测试邮箱。测试卡仅使用 `staging.onetapreality.com`，正式卡仅使用正式域名；App Links 同时验证两域。
- `ALPHA_ALLOWED_EMAILS` 只在 staging 限制受邀 Alpha 邮箱，拒绝响应稳定为 `beta_invite_required`。`GIFT_SHARING_ENABLED` 是 P0 立即停测开关：关闭后阻止新验证码、认领、发布和礼品读取，但保持管理员停用礼品的能力。
- 生产请求日志只保留时间、方法、状态码、延迟和脱敏路径，不保留礼品 token 或查询字符串。发生 P0 时依序关闭开关、停发新卡/邀请、移出 TestFlight 测试者、停用受影响礼品、保留脱敏证据、修复回归并由 release owner 批准恢复。

## 2026-07-25：主页账户入口与最近邮箱记忆

账户继续采用邮箱一次性验证码与 30 天 bearer 会话，不新增密码注册、密码哈希或找回密码体系。会话 token 与最近一次成功验证的规范化邮箱分别保存在 SecureStore；客户端不保存验证码、密码或其他认证秘密。主页提供简洁登录/账户入口，“我的”页显示当前邮箱、管理员标识、切换账号和经确认的退出操作，设置页允许单独清除已记住邮箱。

退出和切换账号会撤销并清除当前会话，但保留最近邮箱以便重新登录；只有显式执行“清除已记住邮箱”才删除该值。账号切换不删除、上传或按账户隔离本机旅行册、昵称、头像等离线数据。

App 启动时会通过 `/api/auth/me` 校验已保存会话；只有服务端明确返回 401/403 才删除会话，临时断网或服务异常时保留本机会话供离线界面使用。退出时必须先成功删除本机 token 才更新为未登录状态，避免界面显示退出但重启后恢复旧账户。

## 2026-07-25：编辑器 UI 修复与增强

本轮修复六个独立问题，全部为纯前端变更，不修改数据模型、路由、依赖或持久化结构：

- **Bug #1（取消选中后元素消失）**：`onSelectElement` 中在选中不同元素时清除 `pendingTextId`，避免 `discardPendingText()` 误删非目标元素。
- **Feature #2（素材面板添加照片）**：贴纸分类行最前面添加「📷 添加照片」按钮，调用 `expo-image-picker` 选择照片后作为 `type: "image"` 画布元素添加。
- **Feature #3a（工具栏两行布局）**：`CanvasToolbar` 改为两行——第一行仅文字元素显示「编辑 | 字体 | 字号 | 颜色 | 前移 | 后移」，第二行所有元素显示「复制 | 删除」。
- **Feature #3b（编辑文字手动触发）**：选中文本元素不再自动弹出 TextInput 和 ElementContextMenu。点击工具栏「编辑」按钮后显示编辑文字输入框；字体/字号/颜色按钮分别弹出对应上下文菜单面板。
- **Feature #3c（字号进度条）**：字号选择面板用进度条 + 数字输入框（范围 2–40）替代固定字号列表。使用纯 RN 组件（Pressable + TextInput），不新增依赖。
- **Bug #4（颜色面板关闭后旧菜单）**：预设配色选择后直接调用 `onClose()` 关闭整个菜单，不再回退到主菜单面板。结合 #3b，确保上下文菜单不再自动弹出。

本次不新增网络、支付、账号、真实 AI、真实 NFC 或新依赖。

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

## 2026-07-25：沿用现有 TestFlight 应用标识与 TAG-only NFC entitlement

- App Store Connect 应用 `6794186067` 已固定绑定 `com.onereality.onetapreality`。为保留现有 TestFlight 应用、测试组和历史构建，iOS `bundleIdentifier` 恢复为该值；Android package 继续使用 `com.onetapreality.app`。
- iOS 26 SDK 不再接受 `com.apple.developer.nfc.readersession.formats` 中的 `NDEF` 值。`react-native-nfc-manager` 配置改为 `includeNdefEntitlement: false`，使原生构建只声明 Apple 当前支持的 `TAG` 值，同时继续通过 Core NFC 读写 NDEF 标签。
- 生产 AASA 的 `appID` 必须同步为 `YVJ6GJG87B.com.onereality.onetapreality`；Android `assetlinks.json` 不变。

## 2026-07-30：Alpha 前发布标识与遗留 City Key 载荷收敛

- 当前正式产品名称为 OneTapReality。所有活跃的协作规范、运行清单、公开 API 标识、示例和可生成的 City Key 载荷不得继续使用旧产品名或旧域名；`.tralbum` 仅作为已有本地导出文件格式保留，不作为品牌或 URL 协议。
- `/api/health` 的 `service` 字段统一为 `onetapreality-api`，维持 `contractVersion: 1` 与字段结构不变。客户端只用它显示连通状态，因此这是一次同仓库前后端契约同步，而不是 API 版本升级。
- City Key 解析器只迁移其离线载荷前缀至 `onetapreality://` 与 `https://onetapreality.com/`；它仍是未接入路由和原生 NFC 的纯解析器，不能被宣传为可扫码或碰卡直达的功能。实体 City Key 深链将在单独决策后连同 Expo 路由、AASA、App Links 与真机验收一起实现。
- 不在本次仓库修复中创建或改动 Railway、Cloudflare、R2、Resend、EAS 或 App Store Connect 资源。独立 staging 仍是 Alpha 隔离测试的外部前置条件，只有完成 DNS、服务、数据库、私有 bucket、密钥隔离与手动演练后才能发放 `alpha` 构建和 staging 测试卡。

## 2026-08-17：本地中文字体包收敛

- 保留现有页面字体映射与视觉样式，不改变主视觉、标题和正文字体角色。
- 本地字体资源收敛为 `XiMaiXiHuan.ttf`、`ChaoHuaTitleA.ttf`、`ChaoHuaTypewriter.ttf`、`MaoKenZhuYuan.ttf` 和 `LXGWNeoZhiSongPlus.ttf` 五个文件；其余字体资源删除。
- 相册编辑页仅提供上述五款字体，不新增远程字体、第三方服务、依赖或客户端秘密。

## 2026-08-17：相册阅读到编辑的页码与导航栈

- 从相册阅读页进入编辑时，必须把当前阅读页的 `pageId` 和索引传给编辑器；目标页不存在时才回退到第一页。
- 保存并退出画布后必须回到现有的相册详情页，而不是在导航栈中创建新的详情页；重复“编辑—保存”后，返回主页只需要一次返回操作。
- 仅调整本地 Expo 路由状态和页面游标，不新增网络请求、持久化字段、第三方服务或客户端秘密。
# 2026-08-17：本地字体非阻塞后台加载

- App 首屏不得等待自定义字体；目标字体尚未注册时使用系统临时字体，页面、相册阅读和编辑立即可用。
- 五个本地字体在 App 启动后通过单一后台队列串行加载；用户选择尚未就绪的字体时，该字体提升为队首，但相册数据仍保存目标字体 ID，不保存临时字体。
- 用户主动选择未加载字体时显示可关闭的加载进度提示；关闭只隐藏提示，不取消后台任务。加载完成后画布自动切换到目标字体。
- 加载失败继续使用系统临时字体并允许重试；不新增远程字体、第三方服务、分析、账号数据或新的持久化字段。

## 2026-08-17：已保存相册的未保存编辑恢复草稿

- 已保存相册仍然只在用户点击“保存当前修改”或“保存并退出画布”后更新正式相册。
- 稳定的编辑事务还会写入未保存编辑恢复草稿；草稿仅保存在当前设备，并按账号隔离和相册隔离。
- 恢复草稿不上传，也不改变正式相册，且不纳入礼品共享快照。
- 若正式相册版本不匹配，则丢弃恢复草稿，避免覆盖较新的内容。

## 2026-08-17：画布恢复与保存仅使用本地诊断事件

- 开发构建与指向 staging API 的内部构建可记录画布属性事务、恢复草稿恢复或丢弃、恢复写入重试以及正式保存边界的本地诊断事件；production 构建必须关闭。
- 诊断只使用固定事件名、内部相册/页面/元素 ID、属性类别、固定状态与固定错误码，不记录账号隔离键、邮箱、token、用户文字、照片 URI、完整错误或错误消息。
- 诊断仅写入本机 `console.info` / `console.warn`，不得新增网络请求、分析 SDK、持久化、第三方服务或客户端秘密；诊断自身失败不得改变编辑、恢复、保存或导航行为。

## 2026-08-18：画布临时保存与布局稳定性

- 相册编辑页提供“保存当前修改”和“保存并退出画布”两种本地正式保存入口：两者均持久化当前页面、等待并清除恢复草稿；前者完成后停留在编辑页并可继续编辑，后者才返回相册详情。
- 临时保存完成后，以正式保存的页面快照继续当前编辑会话，不能被陈旧的恢复草稿、异步刷新或手势收尾覆盖。
- 正式保存后重新读取相册时，图片元素的归一化 `x`、`y`、`width`、`height` 和 `rotation` 必须与提交快照一致；不新增数据库字段、远程请求、第三方服务或客户端秘密。

## 2026-08-18：画布选中手势稳定性

- 画布元素的选中层级在 React 渲染线程预先解析，Reanimated UI 工作线程只读取有限数字，避免跨线程调用普通 JavaScript 函数导致 Expo Go 在选中任意元素时退出。
- 照片沿用旧版稳定宿主树：触摸宿主直接承载原生照片视图并自身绘制选中边框；不挂载独立选中叠层或角点拉伸手柄。
- 照片仍支持选中、拖动、双指缩放和旋转；文本、贴纸和相框保留既有角点拉伸手柄。
- 该调整仅改变本地画布编辑交互，不改变保存数据、预览几何、网络请求、第三方服务或客户端秘密。

## 2026-08-18：1.1.1 staging TestFlight 阶段

- 版本 1.1.1 仅通过 `staging-testflight` EAS profile 构建并提交到 App Store Connect 的既有内部测试路径；该 profile 固定使用 staging API，不构成 production 或公开 App Store 发布。
- iOS 构建号由 EAS 远端自动递增，保留 Apple 要求的单调增长，不在仓库中硬编码或手动回退构建号。
- 此阶段仅面向已获准的内部 TestFlight 演练；不新增外部测试者、群组、支付、分析、第三方服务或客户端秘密。

## 2026-08-18：PDF 导出采用原始画布清晰度

- Expo Go 与 TestFlight 的 PDF 导出统一按画布原始尺寸截图，不再使用三倍高清截图；保持现有 PDF 页面比例、分享入口与导出内容不变。
- 该调整降低 iOS 原生 PDF 引擎在多页相册导出时的内存占用；不改变相册页数上限，也不新增网络请求、依赖、第三方服务或客户端秘密。
## 2026-08-20：画布预览与正式保存使用同一编辑快照

- 页面管理缩略图继续复用 `CanvasPage`/`CanvasElement`，按当前设备主画布宽度等比缩放文字与内容度量；选择边框只覆盖显示，不占用或裁切画布内容。
- “保存当前修改”和“保存并退出画布”都先向 `BookCanvasEditor` 请求一次稳定 `{ pages, cursor }` 快照；文字、换行、字号、字色、文字框几何和最后操作页必须在同一快照内。
- 保存不要求用户先关闭键盘或样式面板；无效草稿回退到最后有效值，未稳定的变换不开始正式写入。
- 保持现有本地恢复草稿、账号隔离、正式相册 schema、礼品共享、NFC 和 staging 安全规则；不新增网络请求、依赖、支付、分析、第三方服务或客户端秘密。

## 2026-08-21：相册详情页提供只读页面总览

- 相册详情页在进入画布编辑前提供“页面预览”，以与编辑器“页面管理”一致的双列缩略图查看整册页面。
- 只读预览允许点击页面并跳到详情阅读器中的对应页，但不提供新增、删除、多选、批量操作或长按拖动排序。
- 普通相册与内置示例相册都可使用只读预览；现有编辑、分享、礼品绑定和页面管理行为保持不变。
- 预览直接读取当前本地页面数据，不新增持久化字段、网络请求、依赖、第三方服务、分析、支付或客户端秘密。

## 2026-08-21：相册详情操作入口与整册删除位置

- 相册详情标题栏仅保留分享和编辑图标；详情内容不再重复显示“编辑相册”和“分享相册”文字按钮。
- “页面预览”和“绑定到礼品”放在相册阅读器下方；示例相册只显示页面预览和既有创建入口。
- 整册删除从标题栏移入普通相册的只读页面预览底部，示例相册与页面管理模式不显示该入口。
- 点击整册删除必须先显示原生二次确认；取消不写入、不导航且保留预览，确认后才沿用现有回收站与返回首页流程。
- 本次仅重排本地入口，不新增持久化字段、网络请求、依赖、第三方服务、分析、支付或客户端秘密。

## 2026-08-21：已保存旅行册编辑页允许修改名称与日期

- 已保存旅行册进入画布编辑页后，在画布上方显示旅行册名称与“城市 · 日期”；名称通过双击进入原地编辑，日期通过单击打开本地日期选择器。
- 名称、日期与页面内容属于同一个显式保存事务，只在用户点击“保存当前修改”或“保存并退出画布”后写入正式旅行册；直接退出不改变正式数据。
- 名称为空或只有空格时禁止正式保存并显示现有标题校验提示；日期限制为 2000 年至当天，并按本地日历日解析。
- 元数据临时状态按账号和旅行册身份隔离，切换会话不得复用；保存失败保留当前编辑内容并允许重试。
- 本次复用现有本地 SQLite、保存按钮和日期选择依赖，不新增数据库字段、网络请求、第三方服务、分析、支付或客户端秘密。

## 2026-08-20：中国地图完整取景、固定南海附图与分级地级标签

- 中国省级边界和地级行政区标签统一使用随仓库固定的 `cn-atlas` 2023 版离线快照，来源提交固定为 `6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f`；生成与运行时均不得联网，也不新增地图 SDK、定位、分析、支付、第三方服务或客户端秘密。
- 主图按中国主体实际边界和安全边距生成完整 `viewBox`，海南最大多边形保留在主体图；海南其余离散南海多边形生成固定附图。概览和全屏地图共用该主体与附图结构，避免南海数据压缩主体或黑龙江东缘被裁切。
- 生成不可变的全部地级行政区标签目录，字段包含六位区划码、官方名称、审核后的常用短名和主图归一化坐标；生成时校验 34 个省级区域、区划码唯一、短名与坐标有效、南海附图非空，以及现有 36 个产品城市均能映射。
- 全屏地图只在视口中央 72% × 64% 范围排布城市名，外围 4% 为透明度过渡带。缩放低于 1.6 时仅显示省会、自治区首府和直辖市；从 1.6 起按固定名额、稳定优先级和屏幕尺寸碰撞避让逐步增加其他地级标签，并用约 140ms 透明度动画与缩放迟滞抑制阈值闪烁。
- 省会/直辖市优先于现有可点击产品城市，产品城市优先于其余地级行政区；同级按距视口中心距离和区划码稳定排序。圆点、文字和 44pt 点击区保持固定屏幕尺寸，不随地图缩放变大。
- 只有现有 36 个产品城市保留点击、旅行状态、搜索、弹窗、详情跳转和 VoiceOver；其余地级标签仅作不可点击、不可聚焦的地图文字背景，不扩展城市档案、路由、数据库或 `CityMapProps` 公共接口。
- 地图、省界、产品城市圆点和所有标签共用同一 UI 线程视口变换；双指缩放跟随手势焦点，平移结束使用受边界约束的短距离惯性。手势逐帧路径不更新 React 状态且不调用 `runOnJS`。
- 概览卡只显示完整主体图、固定南海附图和现有访问圆点，不显示城市文字；全屏地图才启用分级标签。该离线示意图不替代自然资源主管部门审核通过的标准地图，生产发布前继续执行既有审图核验。

## 2026-08-20：中国地图竖屏对齐、安全区与标签性能收敛

- 全屏地图使用一个由实际视口尺寸计算的主图内容框；省界、南海附图、产品城市圆点和城市名称都以该内容框为唯一坐标基准，并共享同一视口变换，禁止再以设计时默认尺寸独立投影标签层。
- 地级标签目录排除区划码不以 `00` 结尾的 32 个省直辖县级市或县；继续保留直辖市、地级市、自治州、地区、盟、香港、澳门、台湾和现有台北标签，不扩大产品城市、路由或数据库范围。
- 工作区只挂载当前可能显示的省会和分级候选标签，数量上限保持为省会集合加 24 个非省会候选；碰撞选择只在工作区完成布局、手势结束或缩放层级稳定后更新。手势逐帧只变换已挂载标签的位置、反向字号缩放和边缘透明度，不重建全部标签目录。
- 全屏头部直接使用安全区 inset，并为 inset 缺失的 iPhone 竖屏环境提供顶部兜底值；关闭按钮保持 44pt 点击区且不得与状态栏、灵动岛或屏幕边缘重叠。
- 本次仅修正本地地图数据筛选、原生布局和手势性能，不新增依赖、网络请求、地图 SDK、定位、分析、第三方服务或客户端秘密。

## 2026-08-20：中国地图深度缩放、边缘留白与全产品城市打卡

- 全屏地图缩放范围调整为 1×–6×；双击按 1×、2×、4×、6×、1× 循环，双指缩放继续围绕手势焦点并受同一边界函数约束。
- 平移边界在地图内容之外保留视口级空白，使主体边缘的现有产品城市也能被拖入中央显示和点击区域；地图仍不可无限拖离视口。
- 所有现有 36 个产品城市点击后统一打开既有城市打卡弹窗并复用现有相册记录流程；弹窗复用现有本地中国地图、城市标题/口号与无 spots 时的 `0 / 0` 默认视觉。
- 341 个地级行政区标签继续仅作不可点击背景，不新增城市档案、地图 SDK、网络请求、依赖、第三方服务或客户端秘密。

## 2026-08-21：南海附图移至左下海域

- 中国地图主体尺寸、投影和交互范围保持不变；南海附图保持 `132 × 172` 的固定画布尺寸，从右下角移至左下海域，使用左侧 `16`、底部 `12` 的固定边距，避免遮挡台湾。
- 地图数据生成阶段必须校验附图完整落在主图 `viewBox` 内，且附图外框不得与 34 个省级区域中的任何边界包围盒相交；概览卡与全屏地图继续共用同一生成结果。
- 本次仅调整离线地图附图布局与生成校验，不改变城市标签、缩放、平移、打卡、相册或公共接口，也不新增依赖、网络请求、第三方服务或客户端秘密。

## 2026-08-24：1.1.2 外部 TestFlight Beta 放行范围

- `1.1.1 (22)` 永远只保留在内部 staging 测试组，不加入任何外部 TestFlight 组；首个外测候选版本为 `1.1.2`，使用 EAS 远端分配的下一个单调递增 iOS 构建号。
- 外测包使用独立 `beta-external` store distribution profile，API 固定连接 staging，发布受众固定为 `external-beta`，只允许从干净且已提交的工作树构建。外测包不得包含服务端 Secret、审核验证码、生产写入能力或内部制卡模块。
- 外测产品完整移除商店、商品、购物袋、订单、收藏、虚构配送/优惠券以及开发者、管理员、后端状态、NFC 制卡和原始异常表面。`/activate` 只显示面向收礼者的安全提示；内部制卡工具仅允许进入显式内部构建。
- 本地旅行册归属于 `guest` 或 `account:<normalizedEmail>`。未登录用户可创建、编辑、删除和导出 guest 旅行册；登录仅用于认领、发布、邀请和协作。首次登录必须明确选择继续使用 guest 库或将其原子迁移到当前账号，不得静默迁移；退出后回到 guest 库，不同账号继续隔离。
- 隐私页拆分“删除本机旅行册”和“永久删除账号及云端数据”。账号删除必须在 App 内完成挑战验证，立即撤销全部会话，并在 24 小时内永久停用账号拥有的礼品及删除关联共享快照、媒体、邀请、成员、管理请求、验证码、账号和可识别审计数据；只删除该账号本地库，独立 guest 库不受影响。失败任务持久重试并通知既有支持邮箱。
- Beta 服务端可为精确匹配的专用 Apple 审核邮箱提供固定审核验证码与可重置数据，但邮箱和验证码只存在于服务端 Secret 与 App Store Connect Review Notes。该能力只在 `external-beta`/staging、生效邮箱精确匹配且有速率限制时启用；production 预检必须证明其关闭。
- 邀请制共享礼品提供举报当前快照、屏蔽/移除成员或邀请者、以及受邀成员主动退出能力。举报原因固定为色情、骚扰、仇恨、暴力、垃圾信息和其他；举报后立即对举报者隐藏并通知既有支持邮箱。只增加自有数据库处置记录，不引入第三方审核服务。
- iOS 最低版本继续为 15.1。外测包提供只读 NDEF URL 的 App 内“扫描礼品”，只接受当前环境的 `/gift/<token>` HTTPS 链接，不读取或保存 NFC UID、不写卡、不记录 token；同时继续验证 iPhone XS 及更新机型的后台碰卡。照片导入直接使用系统选择器，不预先索取完整照片库权限；导出保存只申请 add-only/write-only 权限，并提供中英文照片读取、保存和 NFC 用途说明。
- 外测仅保留一次一本的 PDF 分享，隐藏 `.tralbum`；反馈入口打开 `support@onetapreality.com` 邮件或引导使用 TestFlight 截图反馈，不将本机保存误称为已提交。所有服务端错误映射为稳定、可行动的中文提示，不暴露 Alpha、R2、SQLite、Canvas、staging、内部角色名或原始异常。
- 本轮只进行外部 TestFlight，不提交公开 App Store。首批 10 人全部通过邮件邀请，不启用公共链接，不授予 App Store Connect 权限；Apple Beta Review 通过且内部 smoke 完成后一次通知全部 10 人。出现跨账号数据、错误环境写卡、账号删除失败、审核凭据外泄或启动崩溃时立即停止 Beta 登录并移除或过期构建、停用测试礼品。
- 本范围不新增支付、分析、广告或新的第三方服务；网站隐私说明、App Privacy、Beta 元数据、审核账号说明和支持流程必须在外测提交前与真实行为一致。
## 2026-08-27：相册照片分页与 15 个本地模板

- 新建相册草稿和相册内新增页面都采用“先选择照片、再选择模板”的顺序；创建草稿时提供整册快速配置与逐页配置，两种模式共享同一份照片分页状态。
- 模板组织为 5 个套系 × 1/2/3 张照片版本，共 15 个本地模板。“应用到全部页面”按套系自动匹配各页照片数量；4–12 张照片的页面保持自由排版并明确提示跳过。
- 新增单页选择 1–3 张照片时只展示对应的 5 个模板；超过 3 张时提示模板限制，但允许使用现有自由排版继续。取消照片或模板选择时不创建页面。
- `CanvasLayout` 只在既有 JSON 中增加可选模板 ID，不修改 SQLite 表结构；旧页面无模板 ID 时按自由排版读取。模板切换只改变图片几何，保留文字、贴纸、相框、背景与其他画布元素。
- 用户手动改变图片几何、添加或删除图片后页面转为自由排版；之后仍可重新选择匹配模板。新照片继续遵循账号隔离和“先持久化、后写入画布”的安全边界。
- 所有模板、预览、分配与照片默认本地；不新增网络服务、依赖、支付、分析、照片像素分析或客户端秘密。完整设计见 `docs/superpowers/specs/2026-08-27-album-photo-page-templates-design.md`。

## 2026-08-27：用本地布局标记区分计划照片页

- `CanvasLayout` 增加可选 `photoPlanVersion: 1`，仅用于本地 JSON 中识别由页面计划生成的照片页，支持草稿重试恢复单照片自由排版页面。
- 标记只在本地布局规范化、恢复草稿与共享页面解析时保留有效值 `1`；未知值丢弃，不修改 SQLite 表结构，不增加顶层 `pagePlans` 持久化字段。
- 标记不进入远程 AI 请求、云端契约或礼品共享快照；共享发布构造快照时必须丢弃该字段。编辑器的本地布局元数据保留规则继续适用，照片模板切换或手动几何编辑不清除该计划来源标记。

## 2026-08-28：模板旋转单位与所有相册编辑入口统一

- 画布元素的持久化旋转继续统一使用弧度；“手账错落”等模板以设计角度声明旋转，但生成布局时必须转换为弧度，模板缩略图、草稿预览和正式画布使用同一单位。
- 带有效模板 ID、且图片几何仍匹配该模板的旧页面允许在本地规范化时修复历史模板角度值；自由排版页面和用户手动旋转数据不得被自动覆盖。
- “照片与模板”入口在编辑画布的每一页固定显示，不依赖页面来自新草稿、旧版相册、已保存本地相册或共享相册，也不依赖旧页面的 `kind` 值。无照片页面从该入口先选择照片；有照片页面可直接修改照片数量或模板。
- 新草稿、旧相册更新、已保存相册再次编辑和共享相册更新复用同一 `BookCanvasEditor` 照片布局事务；保存后继续持久化模板 ID、照片顺序和正确的弧度旋转，不新增数据库字段。
- 本次只修复本地模板布局、旧数据兼容和既有编辑入口，不新增网络服务、依赖、支付、分析、第三方服务或客户端秘密。

## 2026-08-28：照片布局弹层显示已选图片与即时效果预览

- 新建照片页及页面内再次调整“照片与模板”时，弹层内容顺序统一为：已选择图片、重新选择照片、模板选择、布局效果预览。
- 已选择图片必须以真实本地照片缩略图显示在“重新选择照片”按钮正上方，并显示“已选择图片”标题；更换照片成功后同一位置立即更新。
- 1–3 张照片时，模板列表下方显示较大的 3:4 布局效果预览；切换模板时预览即时更新，尚未选择模板时显示当前自动自由排版效果。
- 4–12 张照片继续显示“模板仅支持 3 张及以内照片，仍可自行排版”及自由排版预览；不显示不适用的模板选项。
- 预览只读取当前弹层中的照片 URI 和本地模板布局，不提前写入页面、不改变取消/确认/照片暂存事务，也不新增持久化字段、网络请求、依赖、分析、支付、第三方服务或客户端秘密。

## 2026-08-28：统一照片与模板入口、八张上限与无损裁剪

- 编辑器移除独立“添加照片”按钮；页面照片的单张添加、拖动排序、拖入垃圾桶删除、模板切换与裁剪统一收口到“照片与模板”事务，取消时整体回滚，应用时形成一次撤销记录。
- 单页照片上限由 12 张统一收敛为 8 张。旧页面超过 8 张时，仅在进入编辑器后的未保存草稿中按原顺序拆页；原页保留前 8 张和非图片元素，溢出照片进入紧随其后的自由排版页，总保存前不写入正式相册。
- `CanvasImageElement` 在既有布局 JSON 中增加可选无损裁剪参数，封面布局增加同类裁剪参数；参数只保存归一化焦点与 1–4 倍缩放，不修改或复制原始照片文件。
- 画布、模板预览、封面、只读相册、共享礼品与导出截图复用同一裁剪渲染规则。旧数据及无效参数安全回退到居中 1 倍，无需 SQLite 迁移。
- 本次继续复用本地 Expo Image、Gesture Handler 与 Reanimated，不新增第三方服务、网络上传、支付、分析、照片内容识别或客户端秘密。

## 2026-08-28：裁剪手势连续性与裁剪入口图标

- 照片缩略图的删除区只在长按拖动手势真正进入激活状态后显示；普通点击进入或退出裁剪不得改变拖动状态，手势结束或取消时必须清理删除区。
- 全屏裁剪器以 UI 线程共享值作为手势期间的唯一焦点与缩放状态，直接按原图 cover 几何约束照片位置；松手时不得先清空视觉位移再异步提交裁剪，避免回弹、跳位和卡顿。
- 画布照片与封面的裁剪入口统一使用四角直线组成的标准裁剪符号，不使用依赖系统字体的近似字符；图标继续完全本地绘制且不新增依赖。

## 2026-08-29：数据库维护第二阶段基于最新主线重新编号

- 已进入主线的 `0008_shared_album_covers` 至 `0013_gift_relationship_tombstones` 保持不可变；第二阶段候选改为追加 `0014_database_phase2.sql`，不得覆盖或改写既有迁移。
- 第二阶段仅移除统一账号认证已不再使用、且生产复核为空的 `gift_email_codes` 与 `gift_sessions`，验证第一阶段的 8 项约束，并将最低 schema 版本提升至 14。
- migration 继续使用排他锁、空表保护、无 `CASCADE` 删除与事务失败回滚；生产备份、恢复验证、migration、Railway 部署和首次维护调用仍需分别批准。
- 本候选不新增依赖、服务、云端绑定或费用项目，也不改变礼品、共享相册、审计事件或 R2 媒体的保留逻辑。
