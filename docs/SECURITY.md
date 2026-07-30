# 安全与隐私

## 本地与云端数据边界

旅行册默认只保存在设备本地，生成器不读取图像内容。只有用户登录并明确发布 NFC 礼品时，该礼品的共享快照和照片才会上传到私有 R2；邮件、会话和礼品访问名单由服务端处理。

OneTapReality 保留匿名设备 API 的隔离边界，同时为 NFC 礼品使用独立的邮箱验证码账户会话。会话 bearer token 只保存在 SecureStore；服务端只保存带 `GIFT_AUTH_PEPPER` 的哈希。验证码一次性、短时有效并限流。所有账户授权都从服务端 session 推导，客户端不能声明自己是管理员、拥有者或受邀人。

礼品 NFC token 仅以 `GIFT_TOKEN_PEPPER` 加盐哈希存储。`/gift/<token>` 的公开状态接口不返回相册信息；未列入成员名单的账户只能得到无权限结果。每件礼品只允许一位 owner 和最多两位 viewer，成员变更与首次认领均在 PostgreSQL 事务中执行。

R2 桶必须保持私有。授权后的发布请求只收到短期 PUT URL，阅读请求只收到短期 GET URL；发布提交会核对对象存在、Content-Type 与字节数。替换发布和停用先在数据库中撤销访问，再写入持久化媒体清理任务；R2 暂时删除失败绝不能恢复访问权。

Railway 仅保留服务端变量：`DATABASE_URL`、`GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`RESEND_API_KEY`、`GIFT_EMAIL_FROM`、`GIFT_ADMIN_EMAILS`、`GIFT_CARD_CLEANUP_SECRET` 和 `R2_*`。`EXPO_PUBLIC_API_ORIGIN` 只允许公开 API origin，绝不包含秘密。维护端点只接受 `x-gift-maintenance-secret`，应由 Railway Cron 调用。

Alpha 环境还须使用独立的 `GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`DEVICE_TOKEN_PEPPER`、R2 凭据、清理密钥和管理员测试邮箱。`ALPHA_ALLOWED_EMAILS` 仅用于 staging 白名单；不在名单内的邮箱统一得到 `beta_invite_required`。`GIFT_SHARING_ENABLED=false` 会停止新验证码、认领、发布和礼品读取，管理员停用接口保持可用。

生产请求日志不得保留礼品 token 或查询字符串：`/gift/<token>` 与 `/api/gifts/<token>` 均记录为脱敏路径，日志仅保留时间、方法、状态码与延迟。

App Link 部署必须提供 AASA 与 Android assetlinks 文件。发布前在真实 iOS/Android build 中验证，不以 Expo Go 的 NFC 模拟替代原生读写测试。
