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
