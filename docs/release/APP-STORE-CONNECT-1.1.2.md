# App Store Connect 填写稿：1.1.2 外部 Beta

本文件只保存可公开文案、占位符和人工检查项。真实审核邮箱、固定验证码、礼品链接、联系人姓名和电话只在发布负责人获批后填写到 App Store Connect，真实凭据只填写在 App Store Connect Review Notes，不得提交到 Git、客户端环境变量、Issue、截图或日志。

## Test Information

### Beta App Description

OneTapReality 是一款 iPhone 旅行纪念册应用。你可以在本机选择照片，生成并编辑旅行册；登录后可通过 OneTapReality 礼品卡或测试链接认领、发布，并只与受邀成员共享。本次 Beta 不包含商品购买、支付或配送。

### What to Test

请依次测试：

1. 免登录旅行册：创建、编辑、删除、回收站恢复与账号间本地数据隔离。
2. PDF 导出：一次只导出一本旅行册。
3. 邮箱登录：使用审核账号和 Review Notes 中的固定验证码。
4. 碰卡/链接认领：实体卡和测试链接进入相同礼品页面。
5. owner/viewer/editor 权限：发布、只读、协作编辑、移除和退出。
6. 举报与屏蔽：举报后内容立即对举报者隐藏，屏蔽后双方不能再次邀请。
7. 账号删除：在 App 内完成挑战并永久删除账号及云端数据。

### URLs and feedback

- Feedback Email：`support@onetapreality.com`
- Privacy Policy URL：`https://onetapreality.com/privacy/`
- Marketing URL：`https://onetapreality.com/`

## Beta App Review Information

- Sign-in required：Yes
- Review email：`<APP_REVIEW_EMAIL>`
- Fixed review code：`<APP_REVIEW_FIXED_CODE>`
- Review contact first/last name：`<ACCOUNT_HOLDER_REAL_NAME>`
- Review phone：`<REACHABLE_REVIEW_PHONE>`
- Review contact email：`support@onetapreality.com`

### Review Notes 模板

OneTapReality 的实体卡只承载同一 HTTPS Universal Link，不包含额外数据，也不需要读取 NFC UID。审核无需实体卡，可在 iPhone 上依次打开下列 HTTPS 链接完成等效流程：

- owner 已发布礼品：`<OWNER_GIFT_LINK>`
- viewer 已受邀礼品：`<VIEWER_GIFT_LINK>`
- editor 已受邀礼品：`<EDITOR_GIFT_LINK>`
- 可认领礼品：`<CLAIMABLE_GIFT_LINK>`

登录步骤：打开 App → 选择“登录” → 输入 `<APP_REVIEW_EMAIL>` → 请求验证码 → 输入 `<APP_REVIEW_FIXED_CODE>`。该固定验证码只在隔离 Beta 环境、精确审核邮箱及服务端速率限制下有效；生产环境关闭。登录后，“我的纪念品”提供可重置的 owner、viewer 和 editor 数据。

无卡步骤：在同一 iPhone 上点击上述任一链接；Universal Link 会打开与碰卡完全相同的 `/gift/<token>` App 路由。也可在首页选择“扫描礼品”读取 NDEF URL 卡。

账号删除步骤：设置 → 隐私与数据 → 永久删除账号及云端数据 → 获取删除验证码 → 输入验证码和确认文字 `DELETE`。提交后所有会话立即失效，界面显示删除回执和最迟完成时间。

## App Privacy

在 App Privacy 中逐项申报：

| Data Type | Linked to User | Purpose |
| --- | --- | --- |
| Contact Info → Email Address | Linked to User: Yes | Purpose: App Functionality |
| Identifiers → User ID | Linked to User: Yes | Purpose: App Functionality |
| User Content → Photos or Videos | Linked to User: Yes | Purpose: App Functionality |
| User Content → Other User Content | Linked to User: Yes | Purpose: App Functionality |

- Tracking: No
- 不用于第三方广告、开发者广告、营销、分析或个性化。
- 数据只支持邮箱登录、受邀礼品共享、内容安全、支持与账号删除。

## 分类、年龄分级与公开元数据

- 主分类：旅游
- 次分类：摄影与录像
- 年龄分级如实选择 User-Generated Content，因为受邀成员可发布共享旅行册内容。
- 产品无公开社交、聊天、广告、赌博或不受限网页；内容只在受邀礼品成员间共享，并提供举报、屏蔽和退出。
- 公开名称、副标题、描述、关键词和截图不得承诺订购、上架、优惠券、购物袋、订单、支付、配送或物流。
- Content Rights、地区法规信息和真实截图在正式 App Store 提交前补齐。
- Version Release 选择手动发布。
- 本轮仅提交外部 TestFlight Beta，不创建或提交公开 App Store 版本。

## 提交前人工核对

- [ ] Build 不是 1.1.1 (22)，显示为 1.1.2 且构建号为远端下一个递增值（至少 23）。
- [ ] 外部组使用邮件邀请，不开放公共链接。
- [ ] Review Notes 中四条链接均来自隔离 Beta/staging，且没有复制进仓库。
- [ ] 审核邮箱和固定验证码已由发布负责人从服务端 Secret 安全填写。
- [ ] Review Contact 是账户持有人的真实姓名和可接听电话。
- [ ] Beta App Review 已提交；未点击公开 App Store 的“添加以供审核”。
- [ ] Apple 批准后先完成内部 smoke，再一次通知 10 位测试者。
