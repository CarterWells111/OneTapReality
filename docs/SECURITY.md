# 安全与隐私

相册权限仅在用户点击“选择照片”时申请。照片 URI、旅行信息和草稿默认仅存放在本机 SQLite 数据库中；登录不会自动同步这些内容。

NFC 礼品是明确发布的可选共享功能。邮箱验证码创建账户与 30 天会话；礼品管理者发布后，服务端保存礼品成员邮箱、共享快照和私有 R2 媒体。用户可在礼品管理中停用礼品，服务端删除该礼品的共享快照和媒体；本机“删除所有数据”只删除本机内容。产品不使用广告、支付或分析 SDK。

SQL 写入必须使用参数绑定。不得将私密配置、个人照片或访问令牌写入仓库。

后端接口使用安装随机 ID 注册匿名设备，并以 SecureStore 保存不透明 bearer token。服务端只保存 token hash 和带 pepper 的摘要；所有旅行册查询按设备隔离。服务端 DTO 禁止照片 URI、图片二进制、本地路径、API key 和其他秘密。服务端环境变量不得以 `EXPO_PUBLIC_` 开头，也不得从客户端模块导入。

Railway API Service 只保存 PostgreSQL 引用变量 `DATABASE_URL` 与 `DEVICE_TOKEN_PEPPER` 等服务端变量，并通过 Railway 私有网络访问同项目的数据库。`EXPO_PUBLIC_API_ORIGIN` 只能包含公开 HTTPS origin，会进入客户端 bundle；不得把数据库 URL、pepper 或其他秘密放入任何 `EXPO_PUBLIC_` 变量。`server.cjs` 监听 Railway 注入的 `PORT`，并关闭 Express 的 `x-powered-by` 响应头。

# NFC gift shared albums

NFC tags contain only `https://onetapreality.com/gift/<high-entropy-token>`. Provision them using `node scripts/provision-gifts.cjs <count>` from a restricted operations environment; it emits each write URL once and stores only a peppered token hash.

Railway must supply `DATABASE_URL`, `GIFT_TOKEN_PEPPER`, `GIFT_AUTH_PEPPER`, `RESEND_API_KEY`, `GIFT_EMAIL_FROM`, and the four `R2_*` variables in [`.env.example`](../.env.example). None may be exposed through `EXPO_PUBLIC_` variables or app configuration. The R2 bucket is private; clients receive only short-lived signed upload/read URLs after server-side authorization.

Before production release, deploy `/.well-known/apple-app-site-association` with the actual Apple Team ID and `/.well-known/assetlinks.json` with the release keystore SHA-256. These values cannot safely be guessed in source control; the release owner must add them to the domain deployment.

Alpha 使用独立 Railway/PostgreSQL、私有 R2 bucket、pepper、管理员测试邮箱与 `staging.onetapreality.com`。`ALPHA_ALLOWED_EMAILS` 只能在 staging 设置；`GIFT_SHARING_ENABLED=false` 用于立即暂停邀请码、读取、认领和发布。生产日志必须删除 gift token 与查询参数，且 Railway、R2、Resend、EAS、数据库和 DNS 的写入权限只属于发布负责人。
