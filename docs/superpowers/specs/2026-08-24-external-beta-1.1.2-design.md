# OneTapReality 1.1.2 外部 Beta 设计

## 目标与放行定义

1.1.2 是首个可提交 Apple Beta App Review 的外部 TestFlight 候选。放行意味着外部安装包只呈现真实可用、隐私表述准确且可由审核员完整验证的产品路径；只连接隔离 staging；支持免登录本地旅行册、登录后的礼品协作、账号删除、共享内容治理和 App 内 NFC 扫描；构建、归档、元数据与网站政策相互一致。

`1.1.1 (22)` 不升级为外测构建。1.1.2 使用 EAS 远端单调递增的下一个构建号。外测提交前必须通过代码门禁、归档审计、内部 smoke 与 Apple Beta Review；本设计不授权公开 App Store 提交。

## 构建受众与模块边界

运行时增加受控的 `releaseAudience` 概念，至少区分 `internal` 与 `external-beta`。`beta-external` profile 使用 `distribution: store`、staging API 和 `releaseAudience: external-beta`，并要求干净提交。受众由构建配置注入，不从用户输入、远端响应或本地存储覆盖。

外测路由清单采用 allow-list 思路：本地旅行册、城市、礼品认领/协作、隐私、支持与账号设置可以进入；商店、商品详情、购物袋、订单、收藏、开发者控制台、后端状态和 `nfc-demo` 不得出现在导航、链接配置或外测 bundle 的模块图中。`/activate` 保留为稳定公开路由，但外测实现只渲染“礼品尚未准备好，请联系赠送者”，且不能静态或动态导入 `DeveloperNfcConsole`。内部构建通过构建级文件替换或独立入口获得制卡能力，避免依赖容易被误配的 UI 条件隐藏。

外测脚本对路由、禁用字符串、内部模块 import 和 production host 执行静态扫描。用户可见服务端错误只由稳定错误码映射产生；原始 `message` 仅用于服务端结构化诊断，客户端不得直接渲染。

## 本地库所有权与身份转换

本地旅行册的所有者键为：

```ts
type LocalLibraryOwner = "guest" | `account:${string}`;
```

邮箱通过现有规范化函数得到小写、去首尾空格的账号身份。仓储层的所有读取、写入、删除、草稿、回收站和导出都显式接收当前 owner，不能用“是否登录”隐式推导数据库过滤条件。升级迁移将当前历史账号库保持在其原账号命名空间；无法可靠归属的本机记录保留到 guest，不丢弃或上传数据。

App 启动和退出登录后选择 `guest`。guest 可创建、编辑、删除、恢复和导出本地旅行册，不触发登录。认领、发布、邀请、成员管理和共享编辑在动作边界调用账号要求，而不是锁住本地首页。

首次登录到某账号且设备存在 guest 数据时，显示阻塞式选择：

- “继续使用本机访客旅行册”：本次会话仍浏览 guest 库，云端动作使用已登录账号；以后可从设置再次迁移。
- “迁移到此账号”：在一个本地事务内把 guest 旅行册及其页、媒体引用、草稿和回收站记录改属当前账号。出现命名或主键冲突时生成确定的新本地主键，迁移全部成功后才清空 guest；失败则完整回滚。

选择状态按设备与账号保存，但不默认执行迁移。切换账号不会显示其他账号库。永久删除账号成功受理后立即清除该 `account:<email>` 本地库和相关本地身份状态，但保留 guest 与其他账号库。

## 账号删除协议与任务

登录账号可在 App 内完成两阶段删除：

```http
POST /api/account/deletion-challenge
200 { "challengeId": "...", "expiresAt": "..." }

DELETE /api/account
{ "challengeId": "...", "code": "123456", "confirmation": "DELETE" }
202 { "receiptId": "...", "completeBy": "..." }
```

挑战码沿用现有邮件发送服务、速率限制、散列存储和短期有效期，不在日志中记录明文。挑战绑定用户、用途和会话，单次使用；错误码覆盖未登录、限流、过期、错误验证码和确认文本不符。

`DELETE` 的数据库事务先将账号标记为 `deletion_pending`，生成回执及最迟完成时间，并撤销该用户全部账号会话与礼品会话。账号从此不能新登录或执行云端动作。事务还把账号拥有的礼品设为永久停用，避免清理期间通过旧链接访问。

持久化删除任务按幂等步骤清理：共享媒体对象、共享页/相册、发布会话、邀请、成员和激活记录、管理请求、举报处置关联、验证码、会话、拥有礼品、账号以及可识别审计字段。对象存储删除失败不会恢复账号访问；任务记录下次重试时间和有限诊断，后台维护入口重试，并通过现有支持邮件通知运营。完成后仅保留不可反查用户的回执状态与完成时间。所有清理步骤可重复执行。

隐私页把本地与云端动作准确拆分。删除本机旅行册只删除当前所选本地库并二次确认；永久删除账号走上述挑战、输入验证码、键入明确确认词及最终风险确认。客服邮箱是失败升级路径，不替代删除功能。

## Apple 审核账号

固定审核验证码能力仅由服务端环境变量启用，要求同时满足：环境为 staging、受众为 external-beta、请求邮箱与 Secret 中规范化审核邮箱完全相等、功能开关开启且速率限制通过。production 启动与发布预检要求该功能关闭；客户端环境变量、仓库、日志和普通 API 响应中均不出现审核邮箱或验证码。

首次成功登录审核账号时，幂等重置一套最小数据：owner、viewer、editor 三种礼品和一个可认领礼品。测试数据使用明确的审核前缀并只位于 staging。Review Notes 存储邮箱、验证码、可认领 Universal Link 和逐步操作；实体 NFC 卡仅承载同一 HTTPS URL，因此审核员不持有实体卡也能验证完整认领流程。

## 邀请制内容治理

新增表 `gift_content_reports`、`user_blocks` 与处置字段/记录。所有接口要求已登录且与礼品存在当前关系，复用稳定身份解析和事务：

```http
POST /api/gifts/:giftId/reports
{ "reason": "sexual|harassment|hate|violence|spam|other", "details"?: "..." }

POST /api/gifts/:giftId/blocks
{ "targetUserId"?: "...", "targetEmail"?: "..." }

DELETE /api/gifts/:giftId/membership
```

举报记录当前发布版本，不复制照片内容；事务完成后立即对举报者隐藏该礼品，并通过既有支持邮箱发送不含媒体/token 的处置通知。重复举报幂等返回现有记录。

屏蔽要求目标与调用者曾通过该礼品产生邀请/成员关系，不允许屏蔽自己。事务移除双方在该礼品的邀请/成员访问，并建立规范化用户对屏蔽关系。此后任一方向的邀请、成员新增或认领都在服务端拒绝。退出接口仅适用于受邀 viewer/editor；owner 必须先转移/永久停用，不能用退出绕过所有权。举报、屏蔽与退出的客户端提示均为中文、可行动且不泄露内部角色名。

## NFC、链接与权限

外测首页提供“扫描礼品”。扫描会话只启用 NDEF Reader，选择第一个有效 URI record，解析为 URL 后要求：HTTPS、host 与当前构建允许的 API/Universal Link host 精确一致、路径严格匹配 `/gift/<token>`、无用户名密码、token 符合现有格式。成功后立即结束会话并交给统一 Universal Link 路由；失败只给出“不是有效的 OneTapReality 礼品链接”。

扫描器不调用 UID API、不写 NDEF、不持久化或记录 URL/token，生命周期结束时安全取消原生会话。后台碰卡保留 TAG-only entitlement 和 Associated Domains，并在 iPhone XS 及更新机型验证；旧于 XS 的支持设备通过 App 内扫描验证。

照片导入直接打开系统选择器，不在之前调用完整库权限请求。保存 PDF/图片到照片时只申请 add-only/write-only；只分享文件则不要求照片权限。`Info.plist` 同时包含中文和英文的照片读取、照片保存和 NFC 用途说明，描述与只读/只写行为一致。

## 外部界面与内容准确性

- 移除商店 Tab、商品推广和全部商品/购物袋/订单/收藏/配送/优惠券入口与可深链路由；硬编码姓名、电话、物流状态和价格不进入外测 bundle。
- 城市搜索显示中文正式名称而非 slug。无真实数据的城市不展示虚构打卡数或无响应景点按钮；未完成插画统一使用正式通用图形，不使用虚线 placeholder。城市管理、空态和错误全部中文化。
- 首页隐私文案固定为：“本地草稿默认保存在此设备；只有你主动发布礼品时，所选内容才会上传给受邀成员。”
- 所有原“AI 辅助/本地演示”表述统一为：“本地规则生成的可编辑初稿，不分析照片内容”。不暗示图像分析或远端 AI。
- 外测分享一次只允许一本旅行册，只提供 PDF；多选状态下禁用分享并引导选择一本，不静默选第一本，不显示 `.tralbum`。
- “提交反馈”打开预填主题、版本和设备信息但不含用户内容的 `mailto:support@onetapreality.com`，同时说明 TestFlight 截图反馈。只有邮件客户端真正接管后才称为“打开反馈邮件”，不显示“已提交”。

## 配置、预检与发布证据

`beta-external` profile 明确配置 store distribution、staging API、external-beta audience 与 commit requirement。提交配置不为外部组填写 `submit.ios.groups`，因为构建需上传后在 App Store Connect 手工加入既有外部组并发起 Beta Review。

iOS preflight 接受显式 profile，并校验版本为 1.1.2、profile/audience/API host、Associated Domains、最低系统、TAG-only NFC entitlement、用途文案、隐私清单、非豁免加密、production 审核能力关闭以及无 Secret。外测发布命令不接受 `--allow-dirty` 或 `--skip-checks`，构建前记录提交、版本、远端 build number、runtime fingerprint 与 profile，构建后核对 EAS build ID 和 artifact fingerprint。

仓库存放无 Secret 的 TestFlight 元数据草稿、App Privacy 清单、审核步骤模板、10 人设备/角色矩阵和脱敏 NFC 记录模板。真实审核凭据、联系人电话及测试者邮箱只进入 App Store Connect/安全运营记录。

## 验证与止损

自动化覆盖外测路由/字符串扫描、模块图隔离、guest/账号数据隔离与原子迁移、1.1.1 到 1.1.2 本地升级、删除挑战和幂等清理、Beta-only 审核登录、举报/屏蔽/退出、host 校验、只读 NFC、权限最小化以及配置预检。

干净安装执行 `npm ci`、`npm run check:lockfile`、`npm run lint`、`npm run typecheck`、`npm run test:ci`、`npm run build:server` 和 `npm run beta:preflight:ios -- --profile beta-external`。最终 archive 单独检查 entitlement、domains、Info.plist、PrivacyInfo 与加密声明。

Apple 批准后先由内部人员验证启动、免登录创建/PDF、账号登录、审核链接、三角色读取编辑、举报屏蔽和删除入口，再一次邮件邀请 10 人。测试角色按 3/3/2/2 分配并覆盖至少五种 iPhone 代际、最低可取得支持系统、上一主版本和当前稳定版本。监控 TestFlight crash/session/截图反馈、支持邮箱和 staging health，不加入分析 SDK。

跨账号数据、错误环境写卡、账号删除无法完成、审核凭据外泄或启动崩溃均为立即止损条件：关闭 Beta 登录、从组中移除或过期构建、停用测试礼品并保留非敏感事件时间线供修复验证。

## 非目标

本轮不实现购买、支付、配送、公开内容发现、聊天、广告、分析 SDK、自动图像审核、新的第三方服务、公开 TestFlight 链接或公开 App Store 发布。也不把 staging 审核能力带入 production。
