# OneTapReality 外部 Beta 首月观察手册

## 状态、范围与费用边界

三张 iOS 实体 NFC 卡已完成验收，外部 TestFlight 已发布。外部 Beta 仅连接 staging，首月预计 10–20 位真实用户；production 只做健康与维护状态检查，不统计 Beta 用户行为，也不把两套环境的数据合并。

观察使用现有 TestFlight、Railway、PostgreSQL、Cloudflare Worker、R2、Resend 和支持邮箱。不增加分析 SDK、崩溃 SDK或第三方服务，不新增付费监控、数据库、队列、快照或云备份。平台账单没有可验证权限时必须写“待人工确认”，不得猜测为零。

自动任务只允许公开健康接口 GET、GitHub 只读查询和独立 staging 只读角色执行的只读聚合 SELECT。不得向自动任务提供 production 数据库凭据。不得执行 POST、维护 POST、migration、deployment、`pg_dump`、写 SQL、smoke 写入、部署、密钥读取或任何云端配置变更。不得使用写权限替代只读角色，不得输出邮箱、Token、对象键、连接串或用户内容。

自动任务、staging 只读角色、production 只读密码轮换、凭据配置、提交、推送及 PR 必须分别批准。本手册本身不授予这些权限。

## 每日简报：北京时间 09:00

日报固定为七节：结论、用户影响、技术健康、数据与维护、反馈与安全、费用边界、今日行动。只展示聚合数字、时间、状态码和脱敏错误码；没有权限的项目标记“无法验证”或“待人工确认”。

### 自动只读检查

1. 从远端 `main` 读取健康契约和本手册，确认观察规则未被旧分支覆盖。
2. 对 staging `/api/health` 连续 3 次 GET，记录 HTTP、`database`、`schemaVersion` 和耗时中位数：
   - 三次都必须为 HTTP 200、`database="ok"`，Schema 达到远端 `main` 当前最低要求。
   - 中位耗时超过 2 秒为警告；任一次健康失败或 5xx 为阻断。
3. 对 production `/api/health` 做一次 GET；不查询或推断外部 Beta 用户行为。production 最近维护状态不属于自动检查。
4. staging 数据库仅做以下聚合 SELECT：
   - `app_maintenance_state` 最近开始/完成时间、租约和错误码；超过 90 分钟未完成为警告，超过 2 小时为 P1。
   - `gift_media_cleanup_jobs` 各状态、到期 pending、过期 processing、最大 attempts 和 dead letter；任何死信或过期 processing 为 P1，积压连续两日报告增长为 P1。
   - `account_deletion_jobs` 按 pending/processing/completed 统计，并汇总开放任务中 `last_error_code` 非空、attempts 大于 0 及 `complete_by` 已过期的数量；会话未立即撤销或任务超过 24 小时为 P0。
   - 超过既定保留期的验证码、会话、限流、发布会话和终态清理任务数量。
   - `gift_content_reports` 未处理数、支持通知失败数及最老未处理时长；不得选择举报正文或身份字段。
   - users、gifts、NFC 激活、shared albums、发布、viewer/editor 和账号删除的总量及与前一日报的差值；不进行个人画像或逐用户跟踪。

### 每日人工核对

- production 最近维护状态由负责人每日人工核对现有 Railway 脱敏状态或既有只读证据；无法安全确认时标记“待人工确认”，不得把 production 数据库凭据交给自动任务。
- TestFlight：启动崩溃、会话异常、截图反馈和受影响人数。
- 支持邮箱：把有效反馈计入“启动、登录、NFC、相册、共享、删除、性能、其他”，不把正文复制到 Git、日报、Issue 或聊天。
- Cloudflare：Worker 仍为 Free、只有现有小时级 Trigger、无 R2/KV/D1/Queues/付费观测绑定，调用错误无异常。
- Railway、R2、Resend：检查现有免费指标、资源趋势、发送失败和当期费用；不创建新监控。

## 分级响应

### P0：立即申请停测

- 跨账号数据或用户看到不属于自己的内容。
- 外部 Beta 写入 production，或 staging/production 礼品来源混用。
- Secret、审核凭据、完整礼品链接或敏感用户信息泄露。
- 冷启动或 Universal Link 启动出现普遍、可复现崩溃。
- 账号删除后访问未立即撤销，或 production 数据被外部 Beta 访问。

自动任务只能报告证据和建议，不自行关闭服务、移除测试者、停用礼品、修改数据库或云端配置。负责人按既有停测手册批准具体处置。

### P1：当天处理

- 登录、NFC、认领、共享发布或读取等核心流程阻断。
- 健康异常持续 10 分钟、维护中断超过 2 小时、死信或过期 processing。
- 账号删除超期、举报支持通知持续失败，或两名以上用户复现同一严重问题。

### P2：进入周复盘

单用户可绕过的问题、非阻断 UI、偶发延迟和一般建议。日报记录数量与影响，不承诺当天发布修复。

## 每周复盘：每周一北京时间 09:15

周报使用最近七天的日报和现有平台免费指标，固定包含：

- API 2xx/4xx/5xx、健康延迟、Railway CPU/内存/网络及异常重启。
- TestFlight 启动崩溃、有效反馈、受影响人数和未关闭 P1/P2。
- 新增用户、礼品认领、NFC 激活、共享发布、viewer/editor 使用和账号删除的聚合变化。
- 清理队列峰值、死信、维护中断、R2 对象数量/容量变化及 Resend 失败。
- Cloudflare Worker 调用/错误、Railway/R2/Resend 当期费用及零新增费用边界。
- 本周已修复问题及回归证据；下一周最多三个优先事项。

任何需要登录测试账号、发送邮件、创建礼品、执行 smoke 或修改远端状态的周检项目，必须另行批准且不得由自动任务代做。

## 首月节奏与月末 Go/No-Go

1. 第一周保持约 10 人，建立技术、反馈和费用基线。
2. 第二周仅在无 P0、无未解决 P1且维护和账号删除正常时扩大到最多 20 人；邀请和群组调整由负责人手工批准。
3. 第三周覆盖不同 iPhone/iOS、弱网、重复碰卡、角色协作、停用恢复及七天延迟删除。
4. 第四周汇总稳定性、问题关闭、成本和反馈，结论只能是“继续 Beta”“修复后继续”或“暂停”。

月末通过要求：0 个 P0、没有超过 24 小时未处理的 P1、至少 28 天完整日报和 4 次周报；没有超过 2 小时的维护中断、未解决死信、持续积压或账号删除超期；外部 Beta 始终只访问 staging；没有 Secret 泄漏或未批准的新费用项目；真实用户已覆盖本地相册、登录、NFC、认领、owner/viewer/editor、发布、停用恢复、举报/屏蔽和账号删除。

任一要求未满足时不得宣称首月通过，也不得自动扩大测试、连接 production 或申请公开 App Store 发布。

## 日报模板

```markdown
# OneTapReality 外部 Beta 每日观察 — <北京时间日期>

## 结论
状态：正常 / 警告 / P1 / P0

## 用户影响
<聚合数量与已知影响；无个人数据>

## 技术健康
<staging 三次健康结果、耗时中位数、production 健康>

## 数据与维护
<维护、队列、删除、保留期、举报和聚合日增量>

## 反馈与安全
<分类计数、TestFlight 人工核对状态、P0/P1/P2>

## 费用边界
<免费计划/绑定/费用状态；无法验证则待人工确认>

## 今日行动
<最多三项，只建议、不自动执行写操作>
```
