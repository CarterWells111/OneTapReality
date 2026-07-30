# OneTapReality 团队协作规则

## 唯一事实来源

GitHub Issues 与 GitHub Projects 是 OneTapReality 的唯一任务事实来源。聊天、口头同步、本地分支和个人待办不替代 Issue 状态。

每个工作项必须有唯一负责人、范围、目标环境、风险等级、验收条件、依赖和验证证据。协作者可以评论、测试和评审，但不得在没有协调的情况下并行实现同一项工作。

## 看板状态

只使用以下状态：

1. `Backlog`：已记录，尚未排期。
2. `Ready`：范围、负责人和验收条件齐全，可以开始。
3. `In progress`：负责人已认领，正在实施。
4. `Review`：等待 PR、设计或运维方案评审。
5. `Internal Alpha`：已合并，等待或正在内部真实环境验证。
6. `Blocked`：缺少决策、权限、依赖或外部状态。
7. `Done`：验收证据已关联，且没有未处理的发布动作。

负责人开始工作前把 Issue 移到 `In progress`；发现重复工作时，停止新分支或新写卡，先在既有 Issue 协调归属。

## 角色与权限

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 发布负责人 / 全栈 | API、数据库、发布、运行手册、最终合并和外部写入批准 | 把生产 secret 分享给其他协作者 |
| 辅助开发 | 已认领 Issue 的代码、测试和 PR | 直接合并或操作外部服务 |
| 硬件 | 卡批次、写卡、抽检和实体反馈 | 记录完整礼品 URL/token 或操作云端秘密 |
| UI 与内容 | 设计、宣传、商店素材、文案与可访问性验收 | 绕过 PR 修改发布配置 |

只有发布负责人写入 Railway、PostgreSQL、Cloudflare R2、Resend、EAS、Cloudflare、App Store Connect、DNS 和数据库。其他成员通过 Issue、PR、测试结果与脱敏记录协作。

## 工作项生命周期

1. 使用对应 Issue Form 创建工作项，先搜索是否已有相同主题。
2. 指定一位负责人，并填好环境、风险、验收条件和依赖。
3. 负责人将状态设为 `In progress` 后开始；代码变更必须走分支与 PR。
4. PR 使用仓库模板，关联 Issue，附上测试或脱敏证据。
5. 涉及外部服务、实体卡或 production 时，必须关联运维或 NFC 卡批次 Issue；没有发布负责人批准不得执行。
6. 内部验证进入 `Internal Alpha`；验收证据齐全后才进入 `Done`。

## 外部变更与 P0

任何 Railway、PostgreSQL、R2、Resend、EAS、Cloudflare、TestFlight、App Store Connect 或 DNS 变更，先创建“外部运维变更” Issue，并在 [部署记录](DEPLOYMENT-LOG.md) 写入脱敏证据和回滚动作。

任何卡批次使用“NFC 卡批次” Issue，并在 [卡批次记录](NFC-CARD-BATCH-LOG.md) 写入物理卡号范围、环境和抽检结果。测试卡只能对应 staging，正式卡只能对应 production。

P0 事件先执行 [Alpha staging 与 P0 运行手册](ALPHA-STAGING.md) 的停测流程，再创建 P0 Issue 记录脱敏事实；Issue 不得延迟 `GIFT_SHARING_ENABLED=false`、暂停发卡或受影响礼品停用。

## 每周 20 分钟同步

按看板从左到右，只处理以下五项：

1. 已发布或已验证的工作与证据。
2. 每个 `Blocked` 项的单一解除负责人和截止时间。
3. 下周每位成员唯一优先工作项。
4. 计划中的外部变更、批准人和回滚准备。
5. NFC 卡批次的环境、写入数、抽检结果与停用数。

会议结束前，负责人当场更新 Issue 状态、下一步和关联链接；没有 Issue 的工作不纳入排期。

## 脱敏规则

不得记录 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片、完整邮箱名单或原始敏感日志。需要证明时，使用环境名称、时间、Issue 链接、卡批次 ID、状态码、构建号和脱敏截图说明。
