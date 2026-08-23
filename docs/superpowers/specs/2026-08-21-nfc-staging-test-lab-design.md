# NFC Staging 测试实验室设计

## 目标

在不接触 production、不新增测试后门的前提下，重复准备并清理 NFC 礼品核心场景，让 iOS 本地开发包通过与真实 NFC 相同的礼品路由验证登录、认领、首次激活、共享相册和停用行为。实体 NDEF 与锁屏碰卡不在本轮模拟结论内。

## 结构

单一本地 CLI 负责 `seed`、`inspect`、`prepare-pr` 和 `guard`。`seed` 通过现有 staging HTTP API 交互式登录已批准管理员和 owner 别名，创建五个带唯一批次 note 的礼品，并把不可公开的 token 写入 `.data/nfc-staging/active.json`。CLI 随后生成被 Git 精确忽略的 `src/app/nfc-lab-local.tsx`；页面内的六个按钮只导航到真实礼品路由。

viewer/editor 场景包含由本地图片通过现有签名上传 URL 发布的共享相册，但不预建成员激活。对应别名必须正常请求验证码、登录并点击模拟触碰后才能获得 viewer/editor 权限。本地三册 demo 相册通过现有 `MemoriesProvider` 创建，因此继续遵守账号隔离与照片持久化规则。

## 安全边界

- API origin 固定为 `https://api-staging.onetapreality.com`，礼品 origin 固定为 `https://staging.onetapreality.com`，R2 bucket 必须明确为 `onetapreality-staging`，并要求一次固定确认短语。
- base 邮箱、验证码、access token 和礼品 token 不进入命令行输出、文档或 Git。access token 只保存在运行进程内；原始礼品 token 只存在于被忽略的活动 manifest 和生成页面。
- 测试工具不新增服务端路由或数据库迁移。所有 seed 写入先走现有 admin/owner API；最终物理清理只允许精确匹配 manifest 中的 batch note、card ID、gift ID 和对象 key。
- `guard` 只读检查 tracked 文件与活动 manifest。`prepare-pr` 必须在 staging 清理和临时邮箱回滚确认后删除生成页面与 manifest，再执行 guard。

## 数据与清理

每个批次生成 `unclaimed`、`owner`、`viewer`、`editor`、`disabled` 五个服务端场景和一个仅本地 invalid token。manifest 在每个远程步骤后原子更新，以便中途失败时继续清理。重复 seed 在已有活动批次时拒绝创建第二批；inspect 只输出场景名、卡片/礼品状态、成员激活和相册版本，不输出 token。

清理先通过 owner/admin API 停用 bound 礼品、退休 unclaimed 卡，再触发并确认既有媒体维护。只有对象清理完成后才允许对 manifest 精确列出的测试记录执行数据库删除。失败时保留 disabled 记录和 manifest，下一次运行从未完成阶段继续。发布负责人随后移除三个临时 allowlist 邮箱；工具以验证码请求得到 `403 beta_invite_required` 验证回滚。

## 测试与验收

自动测试覆盖 staging guard、邮箱别名、五场景 orchestration、增量 manifest、脱敏日志、生成页面、三册相册幂等、失败清理重试和 PR 残留检测。Lab 存在与删除后都运行 lint、typecheck、完整测试和 server build。

人工 staging 验收覆盖 owner 认领/发布、viewer 首次激活只读、editor 首次激活并发布新版本、停用/无效 token，以及三个账号之间的本地相册隔离。最终报告明确区分自动测试、模拟深链测试和仍待实体卡验证的项目。
