# Beta 礼品恢复与双 iOS App 并存设计

## 目标

在不删除现有 TestFlight Beta、不迁移或覆盖其本地旅行册的前提下，通过同一 App Store Connect 应用和同一 Bundle ID 的 staging 内部 TestFlight 构建原位更新 Beta，恢复管理员礼品初始化、用户认领和主动发布流程。同时增加可与 Beta 并存的独立 iOS Development Build；两个 App 的本地数据彼此隔离，但登录同一测试账号后读取同一套 staging 礼品、成员、共享相册、媒体和版本号。

本设计不增加普通旅行册自动同步，不操作 production，不加入支付、分析、新第三方服务或客户端秘密。EAS 云构建、TestFlight 提交、App Store Connect、DNS 和 AASA 修改均不属于第一阶段。

## 已确认根因

当前问题不是 Expo Router 无法解析 `/activate`，也不是 iOS 完全没有接管 Universal Link。用户看到的“礼品尚未准备好，请联系赠送者；如需帮助，请联系 support@onetapreality.com”与提交 `2fb3eb0` 引入的外部 Beta 占位实现逐字一致；提交 `83509bd` 随后通过构建受众和 Metro 模块替换，把内部 `DeveloperNfcConsole` 从外部 Beta bundle 中隔离。

因此仍写有 `/activate` 的空卡在外部 Beta 中必然停在占位页，而早期 `internal` Alpha 能进入制卡流程。恢复方案必须保留外部/public 与内部工具的构建级隔离，不能仅靠运行时隐藏按钮。

## 方案选择

采用同 Bundle ID 的 staging 内部 TestFlight 恢复 Beta，再安装独立 Development Build：

- `staging-testflight` 继续使用 `com.onereality.onetapreality`、现有 App 名称和 App Store Connect 记录，只连接 staging，并以内部构建受众包含管理员制卡入口。内部测试员从 TestFlight 更新现有 Beta，而不是删除重装。
- Development Build 使用 `OneTapReality Dev`、`com.onereality.onetapreality.dev` 和 `onetapreality-dev`，采用 `developmentClient: true` 与 `distribution: internal`，只连接同一 staging 后端。
- production 保持正式身份和正式 origins，并在构建级排除管理员制卡实现、开发链接入口和 staging 配置。

不采用让外部 Beta 重新打包内部管理工具的方案，因为它破坏既有外测面隔离并增加误用和审核风险。不采用“先构建 Development Build 再制卡”的方案，因为它不满足先恢复现有 Beta 的顺序。

## 单一、显式的构建配置

`app.config.ts` 维护经过校验的构建变体表。EAS profile 必须传入受支持的显式 `APP_VARIANT`，不得根据域名包含关系、请求结果、礼品 token 或模糊环境变量推断身份。每个变体一次性确定：

- App 名称；
- iOS Bundle ID；
- URL scheme；
- API origin；
- 礼品 URL origin；
- release audience；
- associated domains；
- 可见构建标签。

配置展开时拒绝未知变体和不一致组合。运行时只读取构建时已校验并写入 Expo `extra` 的公开非秘密配置。API 客户端、礼品链接解析、NFC URL 策略和环境标识共享这一来源，不再各自硬编码 origin。

`staging-testflight` 与 Development Build 的 API origin 都是 `https://api-staging.onetapreality.com`，礼品 origin 都是 `https://staging.onetapreality.com`。production 只使用正式 origins，且其展开配置不得包含 development Bundle ID、开发入口或 staging origin。

## Beta 原位恢复流程

内部 TestFlight Beta 打开 staging `/activate` 后：

1. 未登录用户进入统一登录页，`returnTo` 保留 `/activate`。
2. 登录完成后返回管理员 NFC 管理台；服务端继续通过管理员白名单授权。
3. 管理员预留 staging 礼品，把同一张空卡从 staging activation URL 改写为唯一 staging `/gift/<token>` URL，并在同一 NFC 会话读回验证。
4. 只有写入和读回成功后才调用激活 API；失败保留既有可重试预留，不创建重复礼品。
5. 用户再次碰卡进入 `/gift/[token]`。未登录时完整 token 路径编码进 `returnTo`；登录后返回原路径，执行认领或受邀成员激活。
6. Owner 从“我的礼品”进入管理页，明确选择一册 Beta 本机旅行册并执行现有两阶段发布。上传共享页面和所选照片副本，完成提交后生成或递增共享相册版本；本机原旅行册不被改写或自动上传。

现有礼品入口只为未认领礼品显示登录操作。恢复时补齐已绑定礼品的未登录入口，使受邀成员也能在保留 token 的前提下登录；未知、停用和初始化中的礼品继续使用安全状态提示。

## Development Build 与双 App 深链

不同 Bundle ID 使 Beta 和 Development Build 可同时安装，并自然拥有各自独立的 SQLite 容器、SecureStore、照片目录和登录 session。两者都保持本地数据库名 `luyi.db` 和既有照片相对目录规则；不复制、迁移或共享本地文件。

第一阶段不申请新域名或修改 AASA。staging Universal Link 只由 Beta 声明和接收，Development Build 不声明同一 associated domain，避免两个 App 争抢相同 HTTPS 链接。

Development Build 提供仅开发变体可打包和显示的“粘贴/输入礼品测试链接”入口。入口只接受：

- HTTPS；
- 精确 host `staging.onetapreality.com`；
- 严格 `/gift/<token>` 路径；
- 无用户名、密码或非预期端口。

解析成功后只导航到现有礼品入口，不绕过登录、礼品状态、成员激活、角色授权或服务端校验，不持久化、记录或硬编码 token。`onetapreality-dev` scheme 只标识 Development Build，不替代 staging HTTPS 礼品权限。

若未来需要 Development Build 直接接收 Universal Link，应另行批准独立开发域名或 AASA 路径设计；不在本阶段隐式增加外部资源。

## 共享数据和版本语义

Beta 与 Development Build 使用相同 staging API，因此同一测试账号读取相同数据库内部礼品 ID、共享相册 ID、成员角色和版本。两端都不以本地旅行册 ID 或显示编号匹配云端对象。

发布继续携带 `baseVersion` 并使用服务端 compare-and-swap。任一端发布成功后，另一端刷新读取递增后的同一共享相册版本。viewer 保持只读；editor/owner 的权限在创建上传会话和完成提交时都由服务端复核，开发入口不能放宽权限。

网络或上传失败不改变现有已发布版本，也不删除本地旅行册。环境不匹配在触发 NFC 原生会话或发布 API 前即被阻止。

## 测试策略

遵循测试先行，但按用户要求减少微小阶段复检。每组行为先增加最小失败测试并确认因缺失行为失败；完成相关实现后运行该组目标测试。功能完成后进行一次集中回归，最终再运行完整门禁。

自动化至少覆盖：

1. Beta 配置仍输出 `com.onereality.onetapreality`。
2. Development 配置输出 `com.onereality.onetapreality.dev`、独立名称和 scheme。
3. Development Build 只能使用 staging API 和礼品 origin。
4. Beta 原位升级不改变 `luyi.db`、认证存储键和本地照片目录规则。
5. `/gift/<token>` 登录 `returnTo` 完整保留 token。
6. 未登录初始化、登录回跳、礼品认领、进入“我的礼品”、选择本地旅行册和两阶段发布。
7. 两个逻辑客户端连接同一内存 PostgreSQL 后读取相同礼品和共享相册 ID/version。
8. 一端发布新版本后，另一端刷新读取递增版本。
9. viewer 不能发布，editor/owner 权限不被开发入口绕过。
10. 错误环境不调用 NFC 写入，也不调用发布 API。
11. production 展开配置和模块图不包含 Development Bundle ID、开发入口或 staging origin。

集中质量门禁为：

```text
npm ci
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
npm run beta:preflight:ios
```

如增加 Development Build 专用预检，则在同一最终门禁中运行。

## 实施与工作区隔离

当前工作目录的分支落后于本地 `origin/main`，并包含未提交的管理员礼品编号工作。功能实施应从最新可用 `origin/main` 建立隔离 worktree，避免覆盖、混入或清理现有改动。新增“双版本并存与开发版独立身份”决策必须在功能代码之前写入该基线的 `docs/DECISIONS.md`。

第一阶段只产生代码、测试、文档和本地验证结果，不自动执行 EAS Build、TestFlight 提交、App Store Connect 修改、DNS/AASA 修改、数据库部署或 staging/production 写操作。

## 第一阶段报告与后续审批

第一阶段报告必须列出：真实根因、修改文件、测试结果、Beta 原位升级安全条件、Development Bundle ID、两端 API origin、双 App 深链方案和待批准的外部操作。

后续操作保持独立审批：

1. 批准并生成同 Bundle ID 的 staging TestFlight 修复构建；
2. 批准提交到指定内部测试范围；
3. 在不删除旧 Beta 的情况下通过 TestFlight 更新，并记录更新前后本地旅行册数量；
4. 真机验证 staging 初始化、认领和主动发布；
5. 另行批准生成 `com.onereality.onetapreality.dev` internal/ad-hoc Development Build；
6. 双 App 同账号读取、权限和版本递增验收。

任一步发现 production 访问、本地旅行册数量下降、跨账号访问、错误环境写卡或权限绕过，都立即停止，不继续下一外部步骤。
