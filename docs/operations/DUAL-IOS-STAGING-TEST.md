# Beta 恢复与双 iOS App staging 验收

本手册只描述获准后的执行顺序。仓库代码完成不代表云构建、TestFlight 提交、App Store Connect、安装或实体卡写入已获授权；每一项外部变更都必须单独批准。全程不得访问 production，也不得记录礼品 token、验证码、完整邮箱、照片 URI 或用户内容。

## 1. Beta 更新前：只记录本机旅行册数量

1. 在现有 TestFlight Beta 中打开“我的旅行册”，只记录更新前的本地旅行册数量、App 版本和 buildNumber，不截图旅行册内容。
2. 确认 Bundle ID 是 `com.onereality.onetapreality`，当前安装来自同一个 App Store Connect App 记录。
3. 不要删除 Beta，不要卸载重装，不要迁移、导出、覆盖或清理 SQLite、SecureStore、照片目录。
4. 若无法读取数量或手机存储异常，停止更新并报告；不得用 Development Build 读取或修复 Beta 本地数据。

## 2. Beta 原位更新：保持本地容器

1. 单独批准后，使用 `staging-testflight` profile 生成并提交原 Bundle ID 的内部 TestFlight 构建，只连接 `https://api-staging.onetapreality.com`。
2. Apple 账号必须已是 App Store Connect 内部测试员；通过 TestFlight 的“更新”安装，不删除旧 Beta。
3. 更新后立即再次记录本地旅行册数量，并与更新前逐项比较。数量不一致即停止，不执行礼品发布。
4. 此安全判断依赖 Bundle ID、`luyi.db`、SecureStore 键和本地照片目录规则保持不变；真机更新前后数量仍是最终证据。

## 3. Beta：初始化、绑定与主动发布

1. Beta 独占 staging Universal Link：`https://staging.onetapreality.com/activate` 和 `/gift/<token>` 默认由 Beta 接收。
2. 以获准的 staging 管理员账号确认 `/activate` 打开内部初始化界面，不再显示外部 Beta 的“礼品尚未准备好”占位页。
3. 只对 staging 测试实体卡执行初始化和读回；确认 URL 域名为 `staging.onetapreality.com`，不复制完整 URL。
4. 未登录打开礼品链接，登录后必须回到原礼品路径；完成认领后礼品出现在“我的纪念品”。
5. 明确选择一本现有本地旅行册并按发布按钮。只有此显式操作上传共享相册页面和所选照片；不增加普通旅行册自动云同步。
6. 记录脱敏的内部 `giftId`、`albumId` 和共享版本号，确认媒体位于 staging 私有存储。不得记录 token 或对象 URI。

## 4. Development：并存安装与跨 App 版本验证

1. 单独批准 `development` internal/ad-hoc 构建后，确认名称 `OneTapReality Dev`、Bundle ID `com.onereality.onetapreality.dev`、顶部 `DEVELOPMENT · STAGING`。
2. 安装时不得要求删除 Beta。两个 Bundle ID 不复制本地容器，SQLite、SecureStore、照片目录和登录 session 分别独立。
3. Beta 独占 staging Universal Link；Development Build 使用手动粘贴 staging HTTPS 礼品链接的开发入口，不声明同一个 Associated Domain，不绕过登录、成员、状态或服务端权限。
4. 使用同一 staging 测试账号登录。Beta 与 Development 连接同一套 staging API、PostgreSQL 和私有媒体存储，并读取同一 `giftId`、`albumId`、成员角色和 version。
5. viewer 只能读取；editor/owner 才可按既有规则显式发布。任一端发布新版本后，另一端刷新应读到同一 `albumId` 和递增的 version。
6. Development 不读取 Beta 的本地旅行册；普通旅行册继续默认只在各自 App 本机保存，staging 内容不得自动复制或提升到 production。

验收完成后回传构建链接、提交 SHA、脱敏测试证据与剩余真机待办。正式实体卡不得写入 staging URL，测试实体卡不得写入 production URL。
