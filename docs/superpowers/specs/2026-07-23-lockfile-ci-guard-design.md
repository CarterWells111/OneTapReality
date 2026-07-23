# Lockfile 与生产构建合并门禁

## 背景与根因

Railway 部署在 Build image 阶段失败。本地使用最新 `main` 和 npm 11.12.1 执行
`npm ci` 可稳定复现：`package-lock.json` 缺少仍被依赖图要求的
`@emnapi/core` 与 `@emnapi/runtime` 节点。

该缺口由新增依赖时重写 lockfile 引入。日常开发使用已有 `node_modules` 时不会暴露，
而 Railway 每次从空环境执行干净安装，因此直到合并部署后才失败。

## 目标

- 修复当前损坏的 lockfile，使干净安装和 Railway 同款生产构建通过。
- 在 Pull Request 合并前自动执行干净安装，阻止相同问题再次进入 `main`。
- 同时验证项目声明支持的最低 Node 20.19 与当前 Node 24 运行线。
- 保持 `engines` / `devEngines` 为最低版本及以上，不改回封闭版本范围。

## GitHub Actions

新增 `.github/workflows/quality-gate.yml`，在以下时机运行：

- 针对 `main` 的 Pull Request；
- push 到 `main`。

工作流包含两个检查：

1. `lockfile-minimum`：Node 20.19，执行 `npm ci --ignore-scripts`，验证最低支持
   Node/npm 组合能够从 lockfile 完成干净安装。
2. `quality`：Node 24，依次执行 `npm ci`、`npm run lint`、
   `npm run typecheck`、`npm run test:ci` 和 `npm run build:server`。

工作流只授予 `contents: read`，并按分支取消过期并发运行。npm 缓存键由
`package-lock.json` 决定，但缓存不能绕过 `npm ci` 的一致性检查。

## 合并保护

工作流首次在远端产生检查后，将 `lockfile-minimum` 与 `quality` 设置为 `main`
的必需状态检查。保留已有分支保护配置，不覆盖其他规则。若仓库套餐或权限不支持
分支保护，保留工作流并明确报告该外部限制，不伪装为已强制。

## 仓库规范

在 `AGENTS.md` 与执行检查表中增加以下规则：

- 修改 `package.json` 依赖时必须同时提交匹配的 `package-lock.json`。
- 合并前必须从干净依赖状态运行 `npm ci`。
- 涉及生产依赖、构建配置或 Expo 路由时必须运行 `npm run build:server`。
- 不得以已有 `node_modules` 下的 `npm install` 或开发服务器可启动替代干净安装验证。

## 验证

- 先用当前 lockfile 观察 `npm ci` 因缺失 peer 节点失败。
- 重建 lockfile 后，从空依赖目录运行 `npm ci`。
- 运行 lint、typecheck、全量测试和 `npm run build:server`。
- 对工作流配置增加静态测试，验证触发条件、两个 Node 版本和全部质量命令。
- 推送分支，确认 GitHub Actions 实际通过，再配置并读取回 `main` 必需检查。

## 范围外

不修改 Railway 数据库、环境变量、部署启动命令、应用业务逻辑、Node/npm 最低版本
范围，也不引入第三方 Git hook 或新的 CI 服务。
