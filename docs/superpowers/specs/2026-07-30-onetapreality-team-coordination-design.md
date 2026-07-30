# OneTapReality 团队协作记录设计

**目标：** 让四人团队通过统一的 GitHub 工作项、PR 与脱敏运维记录同步 App、后端、实体 NFC 卡和发布进度，避免重复工作与生产误操作。

## 范围与边界

本设计只创建仓库内模板和说明文件，不创建或修改任何 GitHub Issue、Project、标签、成员权限、Railway 服务、数据库、R2 bucket、Resend、EAS、DNS、TestFlight 或 App Store Connect 设置。

`OneTapReality` 是当前唯一项目名称。仓库远端改名和旧名称的全局替换单独处理；本工作包不变更 bundle identifier、API 域名、数据库、卡片记录或外部服务名称。

## 方案选择

采用“GitHub 为唯一事实来源 + 仓库内模板为操作契约”。相比只在文档里记任务，它能把每项任务与 PR、CI 和最终部署连接起来；相比引入额外的 Notion、飞书或表格，它不需要复制状态或新增账户权限。

GitHub Project 的实际列、字段、标签和首批工作项将在模板合并并获得单独外部写入批准后创建。仓库文件先定义所有人必须使用的最小字段，确保看板配置和日后自动化有稳定契约。

## 信息模型

每一个 Issue 都必须有：

- 唯一负责人；协作者不等于负责人。
- 范围：`app`、`api`、`ops`、`nfc`、`ui` 或 `content`。
- 环境：`local`、`staging`、`production` 或 `n/a`。
- 风险：`P0`、`P1`、`P2`。
- 明确验收条件、依赖关系和关联 PR/部署记录。

运行状态只使用 `Backlog`、`Ready`、`In progress`、`Review`、`Internal Alpha`、`Blocked`、`Done`。任务开始前，负责人必须把状态改为 `In progress`；如已有其他负责人，先在 Issue 协商而不是并行重复实现。

## 仓库文件

- `.github/ISSUE_TEMPLATE/feature.yml`：产品、App、API、UI 或文案功能工作项。
- `.github/ISSUE_TEMPLATE/operations.yml`：Railway、PostgreSQL、R2、Resend、Cloudflare、EAS、TestFlight 或 App Store Connect 变更。要求环境、批准人、回滚和脱敏证据。
- `.github/ISSUE_TEMPLATE/nfc-card-batch.yml`：实体卡批次、目标环境、写入结果和抽检；只记录批次 ID 与卡号范围，禁止写入完整礼品 URL/token。
- `.github/ISSUE_TEMPLATE/p0-incident.yml`：立即停测事件、影响、开关动作、处置记录与恢复批准。
- `.github/PULL_REQUEST_TEMPLATE.md`：关联 Issue、环境影响、验证证据、文案/隐私影响和发布负责人确认。
- `docs/operations/TEAM-COORDINATION.md`：角色边界、Issue 生命周期、每周同步议程和工作交接规则。
- `docs/operations/DEPLOYMENT-LOG.md`：每次外部服务变更的脱敏记录模板。
- `docs/operations/NFC-CARD-BATCH-LOG.md`：实体卡批次的脱敏记录模板。

## 权限与敏感数据

发布负责人是生产和 staging 写入的唯一持有人。辅助开发、UI 和硬件协作者通过 Issue、PR、测试结果和脱敏记录协作，不获得 Railway、R2、Resend、EAS、数据库或 DNS secret。

所有模板都必须提醒使用者不要写入 API key、数据库连接串、完整礼品 URL/token、登录验证码、个人照片、原始日志或完整邮箱名单。遇到 P0 时，先在运行手册执行停测，再填写事件记录；Issue 不是替代处置的等待队列。

## 验收与验证

- 仓库中存在四个 Issue Form、一个 PR 模板和三份操作文档。
- 每个模板都含负责人、环境、验收/证据和敏感数据禁令；运维、NFC 与 P0 模板额外含批准/回滚或停测字段。
- `TEAM-COORDINATION.md` 将四位成员的职责、看板状态和每周同步格式写清楚。
- 全仓扫描当前操作文档、模板与 PR 模板时，不出现旧项目名称，也不包含示例 secret、完整礼品 token 或验证码。
- 不调用 GitHub、Railway、R2、Resend、EAS、Cloudflare 或 Apple 的写入 API。
