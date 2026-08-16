# iOS Beta 实体卡准入设计

## 目标

把四周计划第 1–2 周的 OneTapReality Beta 明确收敛为 iPhone / iOS，完成所有无需实体卡的发布准备，并把最终验收压缩为可重复、可脱敏记录的三张 staging 实体卡真机测试。Android App Links 在第 3–4 周重新评估，但不阻断前两周 iOS Beta。

## 范围与边界

- 当前首批 Beta 只支持 iOS；以 iPhone、iOS Universal Links、EAS `alpha` 原生构建和 staging 礼品卡为准入对象。
- Android release SHA-256、`assetlinks.json` 和 Android 真机验收移入后续 Backlog；不得宣称 Android 已通过，但也不再作为首批 iOS Beta 的红灯项。
- production Railway 自动部署保持关闭。不得在本轮自动执行 EAS 构建、TestFlight 提交、Railway 变量写入、数据库 migration、production 礼品预登记或任何生产写入。
- 所有实体测试卡只使用 staging URL。记录只包含批次 ID、脱敏卡号、设备/系统、步骤结果和异常，不记录完整 URL、token、验证码、邮箱或个人数据。

## 实施结构

1. 用治理测试固化 iOS-only 范围、Android 非阻塞状态、EAS `alpha` staging 配置及实体卡验收文档。
2. 更新决策、执行清单、staging 手册、部署日志、排练记录、QA 清单和 NFC 批次记录，使它们使用同一准入口径。
3. 新增本地只读预检脚本，检查 `eas.json`、`app.json`、iOS Bundle ID、staging Universal Link、NFC 插件和敏感变量边界；脚本不得联网或触发云端构建。
4. 新增 iOS 实体卡测试运行手册，覆盖写卡、读回、锁屏碰卡、登录、认领、发布、受邀只读、停用、对象删除、P0 开关和环境隔离。
5. 本地门禁通过后，对 staging 写入/P0 演练和 EAS 构建分别请求批准；获得构建后由用户在 iPhone 上执行物理触碰，Codex 根据脱敏结果更新验收状态。

## 验收标准

- 治理测试证明 Android 不再阻断首批 iOS Beta，同时文档明确 Android 未完成、不得对外宣传。
- 本地预检以非零退出码拒绝错误 API origin、缺失 staging Associated Domain、错误 Bundle ID、缺失 NFC 插件或疑似服务端 Secret。
- `npm ci`、`npm run db:check`、`npm run lint`、`npm run typecheck`、`npm run test:ci`、`npm run build:server`、`npm run worker:check` 和 iOS Beta 本地预检全部通过。
- 三张 staging 实体卡逐张完成准确写入、读回和 iPhone 碰卡；至少一张完成完整礼品生命周期与 P0 演练。

## 回滚

文档与本地脚本通过普通 Git revert 回滚。staging P0 演练按运行手册恢复 `GIFT_SHARING_ENABLED=true` 并重新回归；EAS 构建不自动分发。任何 production 风险、token 泄漏、错认领或媒体误公开立即停止测试。
