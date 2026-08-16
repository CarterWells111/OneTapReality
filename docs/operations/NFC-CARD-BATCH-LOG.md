# OneTapReality NFC 卡批次记录

每批实体卡在写入前建立“NFC 卡批次” Issue。该记录只保存物理卡批次与环境验证，不保存礼品链接或用户数据。

```markdown
## NFC 卡批次记录

- Issue：#
- 批次 ID：
- 负责人：
- 环境：staging / production
- 物理卡号范围：
- 域名类别：staging / production
- 写入结果：成功数 / 失败数 / 脱敏失败原因
- 抽检结果：碰卡、深链、环境确认
- 已停用卡数：
- 后续工作：
```

域名类别只能是 `staging` 或 `production`，并且必须与目标环境一致。测试卡不写 production 域名，正式卡不写 staging 域名。

不得记录 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片、完整邮箱名单或原始敏感日志。若卡片异常，记录物理卡号、批次和处理状态，并在关联 Issue 中完成停用或重写流程。

## NFC 卡批次记录：第 1 周内部样卡（staging）

- Issue：待建（NFC 卡批次模板）
- 批次 ID：`IOS-BETA-STAGING-001`
- 负责人：硬件（批次表）；发布负责人复核环境一致性
- 环境：staging
- 物理卡号范围：`IOS-STG-001`、`IOS-STG-002`、`IOS-STG-003`（仅为脱敏测试编号，不是芯片 UID）
- 域名类别：staging（只写 `staging.onetapreality.com/gift/<token>`）
- 写入结果：待按 `docs/operations/IOS-NFC-CARD-TEST.md` 执行
- 抽检结果：待执行（逐张准确读回、iPhone 锁屏碰卡、深链、环境确认）
- 已停用卡数：待执行
- 后续工作：先确认实际卡片数量不少于 3 张，再写入 `docs/operations/REHEARSAL-RECORD.md`；少于 3 张时不得把样卡门槛标绿
