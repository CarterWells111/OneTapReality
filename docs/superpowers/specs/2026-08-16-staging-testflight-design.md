# Staging TestFlight 内部分发设计

## 目标与边界

为 iOS 内部成员提供通过 TestFlight 安装的 staging 原生构建，以便在真实 iPhone 上完成 NFC 实体卡测试。构建继续使用现有 App Store Connect 应用、Bundle ID 与 EAS project，但客户端 API 只能指向 `https://api-staging.onetapreality.com`。

本改动只修改仓库配置、静态校验、测试和发布文档。PR 不启动 EAS Build、不提交 App Store Connect、不加入 TestFlight 群组、不部署 Railway，也不修改数据库或任何云端配置。云端构建和 TestFlight 提交仍需后续分别批准。

## 方案比较

1. **推荐：新增 `staging-testflight` profile。** 使用 App Store 分发签名、远端自增 build number、staging API 和独立 submit profile。名称能清楚区分环境，且不会误用现有 production profile。
2. 复用 `production` profile 并在命令行临时覆盖 API。配置不留可审计证据，容易把 production API 或错误环境打入二进制，因此不采用。
3. 继续只使用 `alpha` ad-hoc 内部分发。它能真机测试，但每台 iPhone 需登记 UDID，且不能提交 TestFlight，不满足内部成员通过 TestFlight 安装的目标。

## 配置设计

- `eas.json` 新增 `build.staging-testflight`：
  - `distribution: "store"`，生成可提交 App Store Connect 的 iOS 包；
  - `environment: "preview"`，避免 store 构建默认加载 EAS production environment；
  - `autoIncrement: true`，沿用 EAS 远端版本源；
  - 仅暴露 `EXPO_PUBLIC_API_ORIGIN=https://api-staging.onetapreality.com`；
  - 不包含数据库、R2、Resend、礼品 pepper 或其他服务端秘密。
- `eas.json` 新增同名 `submit.staging-testflight`，引用现有 App Store Connect App ID `6794186067`，并固定分发到现有内部群组 `OneTapReality开发员测试`。
- 保留现有 `alpha` 内部分发和 `production` profile，不改变它们的用途或 API origin。
- 发布脚本必须显式传入 `--profile=staging-testflight`，并在运行时强制先 `--no-submit` 构建、后 `--build-id` 提交的两段式审批；不改变默认 production 行为，也不在 PR 中执行脚本。

## 安全与操作流程

本地门禁确认 profile 是 store 分发、只指向 staging、使用现有 iOS 身份且不含服务端秘密。合并配置后，后续流程分成两个独立审批点：

1. 批准 EAS 云端构建，并在构建前只读审计 EAS `preview` 环境变量名，生成 staging TestFlight 候选包；
2. 构建验证通过后，确认目标群组 `OneTapReality开发员测试` 已启用自动分发且其他内部群组均关闭自动分发，再批准提交 App Store Connect 到该固定群组。

不得点击公开 App Store 的“添加以供审核”。内部测试版的测试说明必须标注 staging；实体卡只能使用 staging URL，禁止测试生产礼品或生产数据。

## 测试与验收

- 先新增失败测试，要求 `staging-testflight` build/submit profile 存在并满足 store、EAS preview environment、staging origin、autoIncrement、App ID、固定内部群组和无服务端秘密约束。
- 发布脚本测试要求续传命令保留 profile，并在提交已有 build ID 前校验项目、平台、分发类型、profile 与完成状态。
- 再新增最小配置使测试转绿，并更新决策、执行检查表和 TestFlight 手册。
- 最终运行干净安装、lockfile 检查、数据库检查、lint、typecheck、完整测试、server build、iOS staging bundle export 和静态 iOS 预检。
- PR 只证明仓库配置和本地模拟构建门禁通过；真正的 iOS 签名、原生编译和 TestFlight 上传只能由后续获批的 EAS 云端任务验证。

## 回滚

若配置或 PR 有问题，撤销该 PR 即可；现有 `alpha` 与 `production` profile 不受影响。若后续云端构建失败，停止提交并保留构建日志；若已上传但不应继续测试，从 TestFlight 内部群组移除该构建，不发布 App Store。
