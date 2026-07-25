# NFC 发布交接

实体空卡先写入 `https://onetapreality.com/activate`。只有已通过邮箱验证码且存在于 Railway `GIFT_ADMIN_EMAILS` 的开发者，才能在原生 Development Build 或生产 App 中将其初始化并改写成唯一的 `https://onetapreality.com/gift/<token>`。Expo Go 不包含 NFC 原生模块，不能用于读写卡验收。

普通用户触碰礼品链接后，未登录时进入统一邮箱登录；已登录的首位用户自动认领。拥有者可在“我的纪念品”管理页选择本地旅行册并手动发布，最多邀请两位只读访问者（总数最多三人）。本地编辑不会自动上传。

NFC 标签只保存 HTTPS URL；服务端只保存加 pepper 的 token 哈希，不读取或保存卡片 UID。礼品永久停用时，访问立即撤销，私有 R2 媒体由维护任务重试删除。

生产验收必须使用 iOS/Android Development Build 或生产构建，并验证 `/.well-known/apple-app-site-association` 与 `/.well-known/assetlinks.json`。Android `assetlinks.json` 需要 release keystore SHA-256；在该值配置完成前，不应宣称 Android App Link 已验收。
