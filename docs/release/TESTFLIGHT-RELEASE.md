# iOS TestFlight 发布手册

从任意平台（含 Windows）用 EAS 云端构建 iOS production 或 staging 内部测试包，提交到 App Store Connect 后再经 TestFlight 分发。

本文与 `scripts/release-ios-testflight.cjs` 配套：脚本负责全部可自动化的步骤，本文说明前置条件、权限边界，以及必须由人完成的部分。所有固定值以仓库内 `app.json` / `eas.json` 为准，**不要照抄本文之外的旧指南**。

> 本文只覆盖 TestFlight 分发。不要点击 App Store Connect 的「添加以供审核」，那是公开上架流程。

## 一条命令

```
node scripts/release-ios-testflight.cjs
```

全程非交互，失败即中止并打印原因，适合直接交给 agent 执行。可选参数：

| 参数 | 用途 |
| --- | --- |
| `--no-submit` | 只构建，不提交 |
| `--build-id=<id>` | 跳过构建，提交一个已存在的包 |
| `--skip-checks` | 跳过 lint / typecheck / test / build:server（不建议） |
| `--allow-dirty` | 允许工作区有未提交改动时构建 |
| `--profile=<name>` | 换构建 profile，默认 `production` |

环境变量 `EAS_CLI` 可固定 eas-cli 版本（默认 `eas-cli@latest`）。

## Staging TestFlight 内部演练

`staging-testflight` 是 store 分发签名，但客户端只连接 `https://api-staging.onetapreality.com`。它只用于获准内部成员在真实 iPhone 上完成 staging NFC 三卡与 P0 演练，不得访问 production 数据或礼品。

云端构建与 App Store Connect 提交是两个独立审批点。批准构建后执行：

```powershell
node scripts/release-ios-testflight.cjs --profile=staging-testflight --no-submit
```

构建完成并核对 EAS 详情中的 profile、Bundle ID、版本和 staging origin 证据后，取得另一项提交批准，再使用上一步打印的真实 build ID：

```powershell
node scripts/release-ios-testflight.cjs --profile=staging-testflight --build-id=<approved-build-id>
```

Apple 处理完成后，只能把该构建加入名称明确包含 `Staging` 的内部测试群组，不添加外部测试者。测试说明写明 `Staging NFC card rehearsal`。不得点击 App Store 的公开审核或发布操作。本配置 PR 本身不运行以上命令。

## 脚本做了什么

1. **仓库状态** — 工作区必须干净。EAS 归档的是工作目录，未提交的改动会一起打进包里。
2. **`npm ci`** — 从干净状态安装。
3. **lockfile 跨平台完整性检查** — 见下方「为什么这一步在前面」。
4. **lint / typecheck / test:ci / build:server** — 四道质量闸。
5. **Expo 配置解析核对** — 用该 profile 的 `EXPO_PUBLIC_API_ORIGIN` 跑 `expo config`，核对 bundle ID、EAS projectId、expo-router origin 与出口合规字段是否与 `app.json` 一致。`app.config.ts` 在解析时注入 router origin，所以不带正确的环境变量跑出来的配置是错的。
6. **EAS 账号与构建号** — `whoami` 确认登录，`build:version:get` 读取远端构建号（`appVersionSource: remote` + `autoIncrement`，构建号由 EAS 自增，不要手改）。
7. **发起构建** — `eas build --platform ios --profile <已批准的 profile> --non-interactive --no-wait`；staging 必须显式使用 `staging-testflight`。
8. **轮询直到完成** — 每 30 秒查一次，最长 90 分钟。
9. **提交** — `eas submit --id <build-id>`，使用存放在 EAS 服务器上的 App Store Connect API Key。

### 为什么 lockfile 检查排在质量闸之前

EAS 在 macOS arm64 上跑 `npm ci --include=dev`。npm 按运行平台解析 lockfile，因此**在 Windows 上生成的 lockfile 可能缺少只有 macOS 需要的条目，同时本地 `npm ci` 完全正常**。云端要到 15 秒左右才报错，但那之前已经压缩并上传了几百 MB 的归档，一轮试错好几分钟。

`scripts/check-release-lockfile.cjs` 按 npm 的模块解析规则遍历 lockfile，报出任何在树中找不到的依赖或必需 peer，把这个错误提前到本地几秒钟内暴露。它也可以单独跑：

```
node scripts/check-release-lockfile.cjs
```

## 前置条件与权限边界

| 能力 | 需要什么 |
| --- | --- |
| 发起构建 | EAS 账号是项目所属组织的成员即可（**Developer 角色就够**）。签名证书与描述文件存放在 EAS 服务器上，不需要本机有 Apple 账号。 |
| 提交到 TestFlight | App Store Connect 的写入权限。只有 **Account Holder / Admin / App Manager** 三种角色能上传和管理 TestFlight 构建。 |

**关键点：提交不必由管理员本人执行。** 只要 App Store Connect API Key（角色 App Manager）已经存放在 EAS 服务器上，任何组织成员都能跑 `eas submit`，无需 Apple 登录。查看当前是否已配置：

```
npx eas-cli@latest credentials --platform ios
```

选准备使用的 profile，确认列表里已有 **App Store Connect API Key**。询问「是否登录 Apple 账号」时**选 No** —— 那一步走的是 Apple Developer Portal（管证书用），如果你的 Apple ID 不在开发者团队里会直接报 `You have no team associated with your Apple account`，而这跟提交能力无关。

若尚未配置，需要 Apple 账户持有人**一次性**操作：

1. App Store Connect → 用户和访问 → 集成 → App Store Connect API → 生成密钥，角色选 **App Manager**
2. 下载 `.p8`（只能下载一次）
3. 由持有人自己执行 `npx eas-cli@latest credentials --platform ios`，选 production → App Store Connect API Key → 上传

密钥随后存放在 EAS 服务器端，**不需要在任何人之间传递 `.p8` 文件或 Apple 密码**。

## 必须由人完成的部分

脚本跑完后，Apple 处理约 5–10 分钟，然后在 App Store Connect 里：

1. **出口合规申报** — 按实际行为回答。本 App 的 `ITSAppUsesNonExemptEncryption` 为 `false`，只使用 HTTPS 与 Keychain/SecureStore（均属豁免），通常选「否」。
2. **加入测试群组** — TestFlight → 内部测试 → 新建或选择群组 → 添加构建 → 填写「测试内容」。
3. **内部测试员** 必须先是 App Store Connect 团队用户。以个人身份注册的 Apple 账户**可以**在 App Store Connect 添加用户，但这些用户不计入 Apple Developer Program 团队 —— 对内测来说够用。
4. 内部测试**不需要**点击「添加以供审核」；外部测试的首个构建需要经过 TestFlight Beta 审核。

真机验收清单见 [QA-CHECKLIST.md](./QA-CHECKLIST.md)。

## 已知失败模式

下面每一条都是实际踩过的。

| 现象 | 原因与处理 |
| --- | --- |
| `Install dependencies` 阶段失败，`npm error code EUSAGE` / `Missing: <pkg> from lock file` | Windows 生成的 lockfile 缺少 macOS 需要的条目。**在 Windows 上重新生成救不了** —— `npm install`、`--package-lock-only`、`--os=darwin --cpu=arm64` 都补不出来。把缺失的包显式加进 `devDependencies`（版本需满足报错里的范围），`npm install` 后用 `check-release-lockfile.cjs` 复验。典型来源是某个 optional 依赖的**非可选 peer**：该 optional 包在 win32 上不安装，npm 便连它的 peer 一起跳过。 |
| 构建日志看不到具体报错 | `eas build:view` 和 `--json` 都不返回阶段日志，挂着等（不加 `--no-wait`）也只打印概括。**必须登录 expo.dev 在网页上看**；未登录时 store 分发的构建页只显示 `No internal distribution build exists at this URL`。 |
| `eas credentials` 报 `You have no team associated with your Apple account` | 你的 Apple ID 不在 Apple Developer 团队里。这只影响 Developer Portal（证书管理），**不影响构建和提交** —— 询问是否登录 Apple 时选 No 即可。 |
| `eas submit` 要求 Apple 登录 | EAS 上没有 App Store Connect API Key。按上文让账户持有人配置一次。 |
| `npm error code ECOMPROMISED` / `Lock compromised` | npm 缓存里有中断的 npx 安装。删掉 `_npx` 下没有 `package.json` 的目录后重试（Windows 路径 `%LOCALAPPDATA%\npm-cache\_npx`）。 |
| EAS 自动创建了一个名字奇怪的新项目 | 在错误的目录跑了 eas 命令。cmd.exe 的 `cd` **不跨盘符**，要用 `cd /d` 或 `pushd`。检查提示符确实位于仓库根目录再执行，并删掉误建的项目与它写出的 `app.json`。 |
| 构建号重复 | 构建号由 EAS 远端自增，不要手改 `app.json`。 |
| TestFlight 里图标或名称不对 | 两者在构建时打进二进制，旧构建不会更新，必须重新构建并提交。 |
| git 报 `dubious ownership` | `git config --global --add safe.directory <仓库路径>` |

## 与 Alpha 隔离验收的关系

`production` profile 产出指向 production API 的 TestFlight beta，不能用于 staging 隔离验收。`alpha` profile 指向 staging，且是 `distribution: internal` 的 ad-hoc 分发，技术上无法提交到 TestFlight。`staging-testflight` 则是 `distribution: store` 且只指向 staging API，可作为 [EXECUTION-CHECKLIST.md](../EXECUTION-CHECKLIST.md) 与 [ALPHA-STAGING.md](../operations/ALPHA-STAGING.md) 规定的受限内部演练安装路径。

三种 profile 不得互换环境或省略名称：staging TestFlight 命令必须显式传入 `--profile=staging-testflight`。任何 staging 内部构建都不代表 production、外部 TestFlight 或公开 App Store 已放行。
