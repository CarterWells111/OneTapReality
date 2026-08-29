# 安全与隐私

## 本地与云端数据边界

旅行册默认只保存在设备本地，生成器不读取图像内容。只有用户登录并明确发布 NFC 礼品时，该礼品的共享快照和照片才会上传到私有 R2；邮件、会话和礼品访问名单由服务端处理。

OneTapReality 保留匿名设备 API 的隔离边界，同时为 NFC 礼品使用独立的邮箱验证码账户会话。会话 bearer token 只保存在 SecureStore；服务端只保存带 `GIFT_AUTH_PEPPER` 的哈希。验证码一次性、短时有效并限流。所有账户授权都从服务端 session 推导，客户端不能声明自己是管理员、拥有者或受邀人。

礼品 NFC token 仅以 `GIFT_TOKEN_PEPPER` 加盐哈希存储，客户端不保存 token。`/gift/<token>` 的公开状态接口不返回相册信息；未列入成员名单的账户只能得到无权限结果。每件礼品只允许一位 owner 和最多两位受邀 viewer/editor，owner 可随时切换其权限，成员变更与首次认领均在 PostgreSQL 事务中执行。链接只证明链接持有，不能证明请求来自实体 NFC 碰卡。

R2 桶必须保持私有。授权后的发布请求只收到短期 PUT URL，阅读请求只收到短期 GET URL；发布提交会核对对象存在、Content-Type 与字节数。替换发布和停用先在数据库中撤销访问，再写入持久化媒体清理任务；R2 暂时删除失败绝不能恢复访问权。

viewer 和 editor 都必须以匹配邀请邮箱的账号完成首次 NFC 激活，之后才能读取完整相册预览。editor 可使用完整 Canvas 直接发布云端共享快照的新版本，但本地原件不会自动上传且不会被 editor 修改。提交必须携带 `baseVersion`；版本冲突返回 `409 gift_album_version_conflict` 并要求客户端重新加载。已有媒体引用由服务端验证属于当前礼品；新媒体先写入当前环境的私有 R2 临时对象，经类型、大小和归属校验后提升为不可变对象。

editor 对整册删除、移除成员或修改权限只能创建管理申请，由 owner 批准或拒绝；owner 可直接管理。每次读取、上传会话和发布提交都重新检查成员、角色、激活、礼品状态与停测开关，因此成员移除、权限撤销或礼品停用后立即拒绝访问及悬挂提交。staging 与 production 的账号、激活、版本、数据库、R2 和秘密严格隔离。本范围不新增第三方服务、支付、分析或客户端秘密。

Railway 仅保留服务端变量：`DATABASE_URL`、`GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`RESEND_API_KEY`、`GIFT_EMAIL_FROM`、`GIFT_ADMIN_EMAILS`、`GIFT_CARD_CLEANUP_SECRET` 和 `R2_*`。`EXPO_PUBLIC_API_ORIGIN` 只允许公开 API origin，绝不包含秘密。维护端点仅接受 POST 与 `x-gift-maintenance-secret`；调用方是无存储绑定的 Cloudflare Workers Free 小时级 Cron，Worker Secret 与 Railway 的 `GIFT_CARD_CLEANUP_SECRET` 必须一致且不得提交到仓库。独立 Railway 定时服务已停用，成功的礼品写请求仅在维护逾期时执行受租约和预算限制的兜底维护。

Alpha 环境还须使用独立的 `GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`DEVICE_TOKEN_PEPPER`、R2 凭据、清理密钥和管理员测试邮箱。`ALPHA_ALLOWED_EMAILS` 仅用于 staging 白名单；不在名单内的邮箱统一得到 `beta_invite_required`。`GIFT_SHARING_ENABLED=false` 会停止新验证码、认领、发布和礼品读取，管理员停用接口保持可用。

生产请求日志不得保留礼品 token 或查询字符串：`/gift/<token>` 与 `/api/gifts/<token>` 均记录为脱敏路径，日志仅保留时间、方法、状态码与延迟。

Universal Link 部署必须提供 Apple AASA。发布前在真实 iOS Development Build/TestFlight 中验证，不以 Expo Go 替代原生 NFC 读写测试；当前产品不发布 Android App Links。
# 2026-08-16 local account and viewer activation boundary

Local memories, drafts, recycle-bin rows and sandbox photo directories are scoped by the normalized verified email. Signed-out clients do not mount protected local routes or execute repository writes. Cross-account identifiers are treated as not found, and local cleanup only targets the active account directory.

Inviting a gift viewer creates eligibility only. Shared snapshots and private R2 media remain unreadable until the matching authenticated account presents the high-entropy gift token to the viewer activation endpoint. Activations are environment-local and cascade with membership deletion; disabling gift sharing or the gift itself blocks reads immediately. The token proves possession of the URL, not physical NFC contact, and clients do not persist it.
