# iOS NFC 实体卡 staging 测试手册

本手册只用于首批 iPhone / iOS Beta 的三张内部样卡。不得记录完整 URL、token、验证码或邮箱，也不得把测试卡写成 production 域名。

## 测试对象

| 脱敏卡号 | 环境 | 用途 | 初始状态 |
| --- | --- | --- | --- |
| `IOS-STG-001` | staging | 完整礼品生命周期与 P0 演练 | 空白/可重写，待人工确认 |
| `IOS-STG-002` | staging | 重复写入、读回与锁屏碰卡抽检 | 空白/可重写，待人工确认 |
| `IOS-STG-003` | staging | 第二台 iPhone 或重复碰卡抽检 | 空白/可重写，待人工确认 |

若实际卡片少于三张，停止并记录“数量不足”；不得复用同一张卡冒充三张样卡证据。应用必须是指向 `https://api-staging.onetapreality.com` 的 EAS `alpha` 或 `staging-testflight` 原生构建；前者经 EAS ad-hoc 链接安装，后者只从明确命名为 `Staging` 的 TestFlight 内部群组安装。Expo Go 不能用于 NFC 写入验收。

## 测试前门槛

- [ ] 当前代码来自干净的最新 `main` 候选分支，且内部演练使用 `npm run alpha:preflight:ios`、外部 Beta 使用 `npm run beta:preflight:ios`，对应预检与完整质量门禁均通过。
- [ ] EAS `alpha` 或 `staging-testflight` 构建经过对应的单独批准，安装在支持 NFC 的 iPhone 上；TestFlight 路径还需单独批准提交。记录 profile 与构建号，不记录安装链接中的敏感参数。
- [ ] staging `/api/health` 返回 200、`database=ok`、`schemaVersion>=7`。
- [ ] staging 的 `GIFT_SHARING_ENABLED=true`、`GIFT_URL_ORIGIN=https://staging.onetapreality.com` 已只读复核。
- [ ] 管理员测试邮箱与受邀只读邮箱在 staging 白名单内；测试记录只写角色，不写地址。
- [ ] production Railway 自动部署保持关闭，本次不访问 production 数据库或 R2 bucket。

## A. 三张卡逐张写入与读回

对 `IOS-STG-001`、`IOS-STG-002`、`IOS-STG-003` 分别执行：

1. 在 iPhone 设置中确认 NFC 可用，打开 OneTapReality `alpha` 或 `staging-testflight` 原生构建，核对记录的 profile 与构建号，并以 staging 管理员角色登录。
2. 打开 Developer NFC Console，点击 `Prepare blank card`；只有应用提示贴卡时才把目标空白卡靠近 iPhone 顶部，完成第一次扫描并等待准备成功提示。
3. 点击 `Initialize current blank card`，按提示用同一张卡完成第二次扫描。应用会先创建最长 15 分钟的预留，再把 activation URL 替换为唯一 staging 礼品 URL，并在同一 NFC 会话读回校验；超时后停止，不复用旧预留。
4. 等待服务端激活完成，确认管理台显示该卡为 `active 状态` 且 ready for customer claim。若仍是 `initializing`，只使用界面提供的重试流程，不重新创建另一张卡。
5. 只核对屏幕显示的域名为 `staging.onetapreality.com`，不要复制、截图或记录完整礼品 URL。
6. 完全关闭 App 并锁屏；再次贴卡，确认 iOS 系统提示出现，点击后打开 OneTapReality 的礼品路由。
7. 记录卡号、iPhone 型号、iOS 版本、构建号、两次扫描结果、写入结果、读回结果、`active` 状态和锁屏碰卡结果。失败只记录错误类别，不记录原始日志中的敏感值。

任一张卡写入值与读回值不一致、打开 production 域名、无法由锁屏碰卡唤起或出现未知礼品时，立即停止整批测试。

## B. `IOS-STG-001` 完整礼品生命周期

1. Owner 角色通过碰卡进入礼品页，请求并完成邮箱验证码登录。
2. 确认首位已验证用户成功认领，之后不再允许其他账号成为 owner。
3. 从本机测试旅行册明确发布一份最小共享相册，确认媒体只进入 staging 私有 R2。
4. 邀请一个 staging 只读角色，确认其可以查看但不能修改、发布、管理成员或停用。
5. 使用非成员角色确认无权读取相册元数据。
6. Owner 永久停用礼品，确认 owner、只读成员和非成员均不能继续读取共享内容。
7. 等待既有维护流程后，用脱敏聚合/状态证据确认媒体删除任务完成；不得查询或记录 R2 object key。

## C. P0 停测演练

此步骤会修改 staging Railway 变量，必须单独批准；不得在 production 执行。

1. 记录开始时间、批准人、staging 环境和当前构建号。
2. 将 staging `GIFT_SHARING_ENABLED=false`，等待部署稳定。
3. 确认礼品读取、认领、发布和新验证码均被暂停；管理员停用能力仍可使用。
4. 停止发卡和邀请，保留脱敏状态码与界面结果。
5. 将 staging `GIFT_SHARING_ENABLED=true`，等待部署稳定并重新完成健康检查、登录和礼品读取回归。
6. 若恢复失败，保持停测并按 `ALPHA-STAGING.md` 处置，不得转向 production 验证。

## D. 通过条件

- 三张不同实体卡均准确写入、准确读回并通过 iPhone 锁屏碰卡。
- `IOS-STG-001` 完成登录、认领、发布、受邀只读、未授权拒绝、停用与对象删除。
- P0 开关阻断范围与管理员停用例外符合预期，并成功恢复。
- 全程只访问 staging；无 token、验证码、完整邮箱、照片、Secret 或 object key 进入记录。
- `docs/operations/REHEARSAL-RECORD.md` 和 `NFC-CARD-BATCH-LOG.md` 的相应项目由发布负责人根据脱敏证据标记结果。

全部条件通过前，不得申请 production 礼品预登记、production 卡写入、收款、发货，或把 staging TestFlight 扩大到当前获准人员之外。
