# OneTapReality 部署记录

每一次 staging 或 production 的外部服务变更都在对应“外部运维变更” Issue 中关联一份下列记录。先取得发布负责人批准，再执行写入；P0 先按运行手册停测。

```markdown
## 部署记录

- Issue：#
- 时间（含时区）：
- 负责人：
- 批准人：
- 环境：local / staging / production
- 服务：Railway API / PostgreSQL / Cloudflare Workers Cron / Cloudflare R2 / Resend / EAS 或 Expo / Cloudflare DNS 或深链文件 / TestFlight 或 App Store Connect
- 变更摘要：
- 验证证据（脱敏）：
- 回滚动作：
- 最终状态：成功 / 已回滚 / 停测 / 待跟进
- 后续工作：
```

不得记录 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片、完整邮箱名单或原始敏感日志。证据仅保留可共享的时间、构建号、环境、状态码、健康检查结果和脱敏链接。
