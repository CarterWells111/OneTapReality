# OneTapReality 1.1.2 外部 Beta 放行清单

状态：已发布并进入首月观察。外部 TestFlight 继续只连接 staging；后续构建、上传、群组调整、公开 App Store 发布或其他云端变更仍需分别批准。

未来一个月预计 10–20 位真实用户，日常与每周证据、分级响应和月末 Go/No-Go 门槛以 [`EXTERNAL-BETA-OBSERVATION.md`](../operations/EXTERNAL-BETA-OBSERVATION.md) 为唯一权威手册。

## 固定边界

- 1.1.1 (22) 永不加入外部组；候选必须是 1.1.2 的远端下一个递增构建号。
- 只使用 `beta-external`，API 与礼品链接均固定到隔离 Beta/staging。
- 商店、订单、配送、开发者控制台、后端状态和原始异常不进入外测包。
- 不新增支付、分析、广告或第三方服务。
- 本轮只做外部 TestFlight，不提交公开 App Store。

## 本地候选门禁

以下命令只有在用户明确批准构建后才执行；在批准前只允许聚焦测试、lint、typecheck 和静态检查。

```text
npm ci
npm run check:lockfile
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
npm run beta:preflight:ios -- --profile beta-external
```

最终 archive 还必须人工核对：TAG-only NFC entitlement、Associated Domains、中英文照片读取/照片保存/NFC 用途说明、隐私清单，以及 `ITSAppUsesNonExemptEncryption=false`。

## staging 审核能力门禁

本节只描述变量名和允许公开的固定值。真实审核邮箱、固定验证码、fixture secret 与 claim token 必须由发布负责人直接填写到 Railway staging 的受保护变量界面，不得进入终端参数、聊天、Git、Issue、截图或日志。

在取得单独的 staging 配置批准后，API Service 必须具备：

```env
ALPHA_ALLOWED_EMAILS=
GIFT_URL_ORIGIN=https://staging.onetapreality.com
RELEASE_AUDIENCE=external-beta
APPLE_REVIEW_ACCESS_ENABLED=true
APPLE_REVIEW_EMAIL=<受保护变量>
APPLE_REVIEW_CODE=<受保护变量>
APPLE_REVIEW_FIXTURE_SECRET=<43 位 base64url 受保护变量>
APPLE_REVIEW_CLAIM_TOKEN=<43 位 base64url 受保护变量>
```

`ALPHA_ALLOWED_EMAILS=` 的空值是有意开放有效邮箱登录的配置；`GIFT_ADMIN_EMAILS` 保持不变，继续独立控制开发者与管理员权限。

production 的 `APPLE_REVIEW_ACCESS_ENABLED` 必须保持未设置或明确为 `APPLE_REVIEW_ACCESS_ENABLED=false`，并且不得配置其余 `APPLE_REVIEW_*` 凭据。变量变更后先验收 `/api/health` 为 200、`database=ok`、`schemaVersion>=14`，再由发布负责人在受保护会话中完成：

1. **审核登录 smoke**：精确审核邮箱使用固定验证码登录，确认 owner、viewer、editor 和可认领 fixture 已重置；错误邮箱不能使用固定验证码。
2. **账号删除挑战 smoke**：审核账号请求删除挑战应成功且不发送邮件，响应和日志不得包含固定验证码；不要在发布前提交最终 `DELETE`。完整删除使用获准的 disposable staging 账号另测。
3. smoke 过程不得打印或复制邮箱、固定验证码、礼品链接或 Secret；只记录通过/失败、时间和脱敏错误码。

以上任一项未完成时，不得发起 `beta-external` EAS 构建。仓库静态 preflight 不读取 Railway，人工门禁不能被本地全绿结果替代。

## App Store Connect 与审核

1. 使用 [APP-STORE-CONNECT-1.1.2.md](./APP-STORE-CONNECT-1.1.2.md) 的已审阅文案。
2. 上传与外部组分配是两个审批点；EAS submit 不配置外部 groups。
3. 上传处理完成后，手动加入既有外部组并提交 Beta App Review。
4. 不开放公共链接，不给测试者 App Store Connect 权限。
5. Apple 批准后先由内部人员完成 cold-start、登录、Universal Link、App 内扫描、PDF 和删除 smoke。
6. 内部 smoke 通过后，一次向全部 10 人发出邮件邀请。

仓库中的 `website/privacy/index.html` 已与 [PRIVACY.md](./PRIVACY.md) 对齐；把它发布到现有隐私 URL 属于云端变更，必须在用户另行批准后完成并复核线上内容，本轮本地实现不会自行部署。

## 10 人执行材料

- 测试者与设备分配：[BETA-TESTER-MATRIX.template.md](./BETA-TESTER-MATRIX.template.md)
- 实体卡脱敏证据：[NFC-TEST-EVIDENCE.template.md](./NFC-TEST-EVIDENCE.template.md)
- 完整产品验收：[QA-CHECKLIST.md](./QA-CHECKLIST.md)

测试者不记录或转发完整礼品 URL、token、验证码、邮箱、NFC UID 或任何审核凭据。反馈优先使用 TestFlight 截图反馈；需要补充时发邮件至 `support@onetapreality.com`。

## 观察与响应

不新增分析 SDK。每日人工查看 TestFlight crash/session/截图反馈、支持邮箱和 staging health 的脱敏状态；自动观察按权威手册执行。不得在监控、Issue 或聊天中粘贴邮箱、礼品链接、token、验证码、对象 key 或 Secret。

以下任一 stop condition 触发立即停止 Beta 登录，移除或过期受影响构建，并停用测试礼品：

- 跨账号数据：guest、账号 A、账号 B 或礼品成员看到不属于自己的内容。
- 错误环境写卡：任何 Beta/staging 操作生成 production 礼品 URL，或反向混用。
- 账号删除失败：会话未立即撤销、礼品未停用、任务超出 24 小时或反复失败无人处理。
- 审核凭据外泄：邮箱、固定验证码或审核礼品链接进入 Git、日志、截图或非授权渠道。
- 启动崩溃：冷启动或 Universal Link 启动发生可复现崩溃。

恢复测试前必须记录影响范围、停测时间、修复提交、回归证据和发布负责人批准；不得仅靠重试继续开放。
