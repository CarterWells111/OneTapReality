# NFC 发布交接

实体空卡先写入 `https://onetapreality.com/activate`。只有已通过邮箱验证码且存在于 Railway `GIFT_ADMIN_EMAILS` 的开发者，才能在原生 Development Build 或生产 App 中将其初始化并改写成唯一的 `https://onetapreality.com/gift/<token>`。Expo Go 不包含 NFC 原生模块，不能用于读写卡验收。

普通用户触碰礼品链接后，未登录时进入统一邮箱登录；已登录的首位用户自动认领。拥有者可在“我的纪念品”管理页选择本地旅行册并手动发布，最多邀请两位 `viewer` 或 `editor`（总数最多三人），并可随时切换受邀成员权限。本地编辑不会自动上传。

NFC 标签只保存 HTTPS URL；服务端只保存加 pepper 的 token 哈希，不读取或保存卡片 UID。礼品永久停用时，访问立即撤销，私有 R2 媒体由维护任务重试删除。

生产验收必须使用 iOS/Android Development Build 或生产构建，并验证 `/.well-known/apple-app-site-association` 与 `/.well-known/assetlinks.json`。Android `assetlinks.json` 需要 release keystore SHA-256；在该值配置完成前，不应宣称 Android App Link 已验收。

## Alpha staging 隔离

启用独立 staging 后，测试卡只写入 `https://staging.onetapreality.com/gift/<token>`，并由 staging 服务以 `GIFT_URL_ORIGIN=https://staging.onetapreality.com` 生成礼品链接。正式卡只写入正式域名。两套环境必须使用独立 PostgreSQL、私有 R2 bucket、peppers 和管理员测试邮箱。

若发生 P0 事件，先关闭 `GIFT_SHARING_ENABLED`，停止写入新卡和发放邀请，再停用受影响礼品；管理员停用接口须在停测期间继续可用。

## 受邀成员首次激活（2026-08-16）

邀请 viewer 或 editor 只创建资格，不授予相册读取。两者都必须登录邀请邮箱对应的统一账号，并从礼品高熵链接完成首次 NFC 激活。激活成功且相册已发布后，两者都能获得包含全部页面和媒体的完整相册预览；未发布礼品允许完成激活，但不会返回页面或媒体。

激活记录绑定当前环境的 `users.id` 与当前 `gift_members.id`。删除成员会级联删除激活；重新邀请产生新成员记录，因此必须重新触碰。重新发布快照沿用现有成员激活，不要求重复触碰。礼品停用和 `GIFT_SHARING_ENABLED` 停测开关会立即阻止读取。

staging 与 production 的礼品、成员、激活记录、数据库和私有 R2 对象不得混用。礼品链接只能作为持有证明，不能证明请求一定来自实体卡而非被转发的同一链接。

editor 使用完整 Canvas 编辑云端共享快照并直接发布新版本，不改本地原件。提交携带 `baseVersion`；冲突返回 `409 gift_album_version_conflict` 并要求重新加载。已有媒体由服务端验证归属，新媒体经当前环境私有 R2 临时对象校验后提升为不可变对象。整册删除、移除成员和修改权限只能由 owner 直接执行；editor 只能申请并等待 owner 批准。成员移除、权限撤销、礼品停用或停测会立即拒绝读取和未完成提交。客户端不保存 token，且不新增第三方服务、支付或分析。
