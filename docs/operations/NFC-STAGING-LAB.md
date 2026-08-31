# NFC Staging 测试实验室运行手册

本手册只用于现有独立 staging。工具不会连接 production，不会修改产品 API 或 schema，也不会把验证码、access token 或礼品 token 输出到终端。生成页面 `src/app/nfc-lab-local.tsx` 与 manifest `.data/nfc-staging/active.json` 仅存在于本机，并被 Git 精确忽略。

## 负责人准备

1. 确认 staging Railway 的 `GIFT_SHARING_ENABLED=true`、`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，R2 bucket 为 `onetapreality-staging`。不得复制或改动 production 配置。
2. 选择一个支持 `+` 别名投递的受控 base 邮箱。工具会派生 `+nfc-owner`、`+nfc-viewer`、`+nfc-editor`。
3. staging 对所有格式有效邮箱开放验证码登录，三个 `+nfc-*` 派生地址无需追加或移除 `ALPHA_ALLOWED_EMAILS`。确认 `GIFT_ADMIN_EMAILS` 仍只包含获准开发者，不得修改 production。
4. 在当前 PowerShell 会话设置下列值。不要写入 `.env`、文档、聊天或 shell 历史共享记录：

```powershell
$env:NFC_TEST_API_ORIGIN='https://api-staging.onetapreality.com'
$env:NFC_TEST_GIFT_ORIGIN='https://staging.onetapreality.com'
$env:NFC_TEST_R2_BUCKET='onetapreality-staging'
$env:NFC_TEST_CONFIRMATION='CREATE-NFC-STAGING-LAB'
$env:NFC_TEST_ADMIN_EMAIL='<现有 staging 管理员邮箱>'
$env:NFC_TEST_BASE_EMAIL='<受控 base 邮箱>'
$env:EXPO_PUBLIC_API_ORIGIN='https://api-staging.onetapreality.com'
```

清理前还需在同一受控会话提供 staging 的 `GIFT_CARD_CLEANUP_SECRET` 与 `DATABASE_URL`。它们是服务端秘密，绝不能使用 `EXPO_PUBLIC_` 前缀。

## 创建与检查批次

运行 `npm run nfc:test:seed`，依次输入管理员和 owner 别名收到的六位验证码。命令创建五个礼品场景、两个带私有 R2 本地图片的共享相册、一个仅本地生成的无效 token，并安装 `/nfc-lab-local` 页面。viewer/editor 只被邀请，不会被脚本预激活。部分创建失败时，状态和 token 会增量保留在本地 manifest；修复临时问题后重跑同一命令会先对账远端认领、成员、相册和停用状态，再从未完成步骤继续。若决定放弃批次，直接运行 `nfc:test:prepare-pr`，它会尽力回滚已创建资源并保留所有仍需重试的项目。

运行本地 App 后打开 `/nfc-lab-local`。页面显示当前账号和每个场景要求的角色；六个“模拟碰卡”按钮只导航到真实 `/gift/<token>`，不 mock API、不绕过登录或权限。点击“插入当前账号 3 册 demo 相册”会通过现有 `MemoriesProvider` 和 Canvas 生成逻辑，幂等创建杭州、上海、香港相册；相册按规范化登录邮箱隔离。

推荐顺序：

1. owner：未认领卡完成认领；owner 场景查看管理页和已发布内容。
2. viewer：先登录 viewer，再点击 viewer 模拟碰卡，确认首次激活后只读；不能发布或管理。
3. editor：先登录 editor，再点击 editor 模拟碰卡，确认首次激活后可编辑并发布新版本。
4. disabled：确认显示永久停用；invalid：确认显示链接无效。
5. 在三个账号间登出并切换，分别插入 demo 相册，确认本地相册互不可见。
6. 运行 `npm run nfc:test:inspect`，分别完成四次邮箱登录。输出只包含 card/gift ID、状态、成员激活和相册版本，不包含 token。

## 清理与 PR 门禁

测试完成后运行 `npm run nfc:test:prepare-pr`。固定顺序是：停用 bound 礼品、退休 unclaimed 卡、执行并核对 R2 清理、严格按 manifest 中的 card/gift ID 删除本批数据库记录，然后删除本地 Lab 与 manifest 并执行只读 guard。管理员与 owner 的验证码登录仍是执行停用与清理的授权前提；清理不得为了白名单回滚再向三个 `+nfc-*` 派生邮箱额外请求验证码、修改 `ALPHA_ALLOWED_EMAILS` 或把开放登录误判为残留。

任何 R2、数据库或本地工件清理失败都会保留 disabled 数据与 manifest；重新运行同一命令继续，不要手工删除 manifest。

最后运行：

```powershell
npm run nfc:test:guard
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
git status --short
```

`nfc:test:guard` 是纯只读门禁；发现本地测试页面、活动 manifest、长礼品 route/token 或 production 配置残留即失败。发起 PR 前必须通过。

## 实体 NFC 边界

模拟按钮只验证 App 收到 NFC 深链后的认证、认领、邀请激活、权限、相册与停用流程。它不能替代三张实体卡的 NDEF 写入、写后读回、标签容量、锁屏唤起、Universal Link 和射频可靠性验收；这些仍按 `IOS-NFC-CARD-TEST.md` 执行。
