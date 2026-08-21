# NFC 现状报告（2026-08-21）

## 自动测试

- 已覆盖固定 staging API/gift origin、私有 R2 bucket 与显式确认；production 或空确认在任何远程写入前失败。
- 已覆盖 plus 邮箱派生、五场景幂等 seed、增量 manifest、部分失败回滚、清理重试、精确数据库批次匹配和白名单回滚。
- 已覆盖六个真实礼品 route、本地三册 demo 相册的幂等生成、账号隔离实现路径、inspect/token 脱敏、PR 自动清理和只读 guard。
- 生成的本地 Lab 源码已实际加入 Expo 路由并通过 lint、typecheck 与 `build:server`，随后由清理函数删除且 guard 通过。清理后的完整仓库验证为 172 个 Jest suites / 1034 个 tests 加 24 个 Node tests 全部通过，lint、typecheck 与 server build 也通过。

## staging 模拟

实现已就绪，但本次代码实施未持有受控 base 邮箱、四次验证码、staging 数据库连接或清理密钥，因此没有创建远程礼品、修改 `ALPHA_ALLOWED_EMAILS` 或声称完成 staging 手工验收。负责人按 `NFC-STAGING-LAB.md` 执行后，应记录 owner 认领/发布、viewer 首次激活只读、editor 首次激活与新版本发布、disabled/invalid 错误以及多账号本地相册隔离的实际结果；记录中不得包含 token、验证码、邮箱全文或私人照片。

## 发现并修复的问题

- 媒体维护端点因已有租约返回 `skipped` 时不能被误判为清理成功；现在会保留 manifest 并要求重试。
- 部分 seed 失败后不能盲目重复写入；现在重跑 seed 会先对账远端成功状态再续跑，选择 `prepare-pr` 放弃批次时会尽力退休仍未认领的 active 卡、停用已绑定礼品、执行 R2 维护并保留未完成项。
- inspect、普通日志和 guard 不输出原始礼品 token；原始 token 只存在于已忽略、权限收紧的本地 manifest 与生成页面。
- 数据库删除要求批次 note、全部 card/gift ID 和 disabled 状态与 manifest 精确一致，否则事务在删除前拒绝执行。

## 仍待实体卡验证

三张 staging 实体卡仍须验证真实 NDEF 写入、写后读回、标签容量、iPhone 锁屏唤起、Universal Link 接管与实际射频触碰可靠性。staging 模拟只能验证深链进入 App 后的业务流程，不能关闭这些发布门槛。
