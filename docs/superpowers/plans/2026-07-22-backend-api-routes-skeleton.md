# Expo API Routes 后端接口骨架实施计划

> 该计划在 `codex/backend-api-routes-skeleton` 分支执行。

1. 先记录决策、API 契约、migration 规范和安全边界。
2. 增加失败测试并确认失败原因是缺少实现。
3. 安装依赖，配置 server output、环境变量和 Jest worktree 排除。
4. 实现 Drizzle schema、migration、匿名 token、repository 和 API routes。
5. 实现 client API、SecureStore 凭据和手动实验页。
6. 运行定向测试、全量质量检查和本地 API smoke check。

生产部署、Turso 真实凭据、图片上传、自动同步和账号体系不在本次范围内。
