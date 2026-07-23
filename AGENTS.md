# 旅忆协作契约

1. 先阅读 `docs/AI-CONSTRAINTS.md` 和 `docs/EXECUTION-CHECKLIST.md`，再修改功能代码。
2. 任何新增范围先写入 `docs/DECISIONS.md`，不得隐式加入云服务、支付、登录、分析或真实 NFC。
3. 新行为遵循测试先行：先写失败测试、确认失败、实现最小代码、再跑全量检查。
4. 所有图片、文案和数据默认本地；严禁在客户端放置 API Key 或秘密。
5. 每个完成阶段运行 `npm run lint`、`npm run typecheck` 和 `npm run test:ci`。
6. 不对远端执行裸 `git push --force`；覆盖远端只允许使用 `--force-with-lease`。
7. 依赖变更必须同步更新 `package.json` 与 `package-lock.json`，并从干净状态运行 `npm ci`。
8. 涉及依赖、Expo 路由或生产构建的变更必须运行 `npm run build:server`；开发服务器可启动不能替代该检查。

