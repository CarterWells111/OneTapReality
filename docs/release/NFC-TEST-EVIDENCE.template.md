# NFC 真机测试脱敏证据模板

用途：把已有实体卡结果转成可审核记录，并且只对“未覆盖才补测”的项目再次操作实体卡。

现有声明转录：2026-08-24，产品负责人确认“已用实体卡测试 NFC 功能且未发现问题”。由于该声明没有设备型号、iOS 版本、连续次数、NDEF 回读、锁屏、角色生命周期或错误环境证据，它只证明一次实体碰卡主路径曾成功，不自动勾选下表中的具体门禁；其余项目按“未覆盖才补测”。

安全规则：不得记录完整 URL、token、验证码、邮箱、NFC UID；不得保存卡片序列号、服务端 Secret、对象 key 或未脱敏截图。卡片只使用内部批次代号，礼品链接只记录环境、origin 是否正确和末尾指纹的单向哈希前 8 位。

## 测试信息

| 字段 | 填写值 |
| --- | --- |
| 候选版本 / 构建号 | `1.1.2 (<BUILD_NUMBER>)` |
| Commit / fingerprint | `<SHORT_COMMIT>` / `<FINGERPRINT_PREFIX>` |
| 环境 | `beta/staging` |
| iPhone 型号 / iOS | `<DEVICE>` / `<IOS_VERSION>` |
| 卡片批次代号 | `<SANITIZED_CARD_ID>` |
| 测试日期 / 测试者代号 | `<YYYY-MM-DD>` / `<TESTER_ALIAS>` |

## 既有证据转录

| 项目 | 已覆盖证据日期 | 结果 | 脱敏备注 |
| --- | --- | --- | --- |
| NDEF 写后读回 |  | Pass / Fail / 未覆盖 | 只记录 scheme、host、path 形状 |
| 锁屏唤起 |  | Pass / Fail / 未覆盖 | 记录是否进入正确 App 页面 |
| Universal Link |  | Pass / Fail / 未覆盖 | 实体卡和测试链接是否同一路由 |
| 连续碰卡可靠性 |  | Pass / Fail / 未覆盖 | 次数与成功次数，不记录 URL |
| owner/viewer/editor 生命周期 |  | Pass / Fail / 未覆盖 | 使用匿名角色代号 |
| 永久停用 |  | Pass / Fail / 未覆盖 | 访问是否立即拒绝、清理是否完成 |
| 错误环境拒绝 |  | Pass / Fail / 未覆盖 | 只记录被拒绝的环境类别 |

## 只补测缺项

- [ ] 对上表标为“未覆盖”或候选改动直接影响的项目补测。
- [ ] 至少一台旧于 iPhone XS 的设备通过 App 内“扫描礼品”读取；不依赖后台碰卡。
- [ ] iPhone XS 或更新机型验证后台/锁屏碰卡。
- [ ] App 内扫描只接受当前环境的 HTTPS `/gift/<token>` NDEF URL。
- [ ] 外域、错误环境、query/hash、非 URL NDEF、已过期礼品均被安全拒绝。
- [ ] 扫描流程没有读取 UID、写卡或输出 token 日志。

## 异常与复验

异常编号：`<ISSUE-ID-OR-NONE>`

脱敏现象：`<NO URL/TOKEN/EMAIL/CODE/UID>`

修复提交：`<COMMIT-OR-N/A>`

复验结果：`<PASS/FAIL/PENDING>`

发布负责人签字/日期：`<NAME>` / `<YYYY-MM-DD>`
