# Node 与 npm 版本治理设计

## 目标

让本地开发、Railway 构建和未来 CI 在进入依赖安装或项目脚本前使用兼容的 Node 20 与固定的 npm 10.8.2，减少不同 npm 版本重写 `package-lock.json` 或导致 `npm ci` 失败的风险。

## 方案

- 保留顶层 `"packageManager": "npm@10.8.2"`。Railpack 优先读取该字段，并通过 Corepack 安装指定 npm。
- 将 `engines.node` 从开放式下限改为 `">=20.19.0 <21"`。Railpack 优先读取该字段选择 Node，满足 Expo SDK 54 的最低要求，同时阻止自动切换至 Node 21 或 22。
- 新增 `devEngines`：
  - `runtime.name` 为 `node`，版本为 `">=20.19.0 <21"`，不匹配时 `error`。
  - `packageManager.name` 为 `npm`，版本为 `"10.8.2"`，不匹配时 `error`。
- 将仅用于测试的 `@testing-library/react-native` 固定为 `13.3.3`。版本 14 要求 Node 22.13 或 24 以上；版本 13.3.3 支持 Node 18 以上，并满足 Expo Router 的可选 peer dependency 范围。
- 将它要求的 `react-test-renderer` 明确固定为 `19.1.0`，与项目 React 版本一致，防止 npm 为根级 peer dependency 选择 19.2。
- 不增加 `.nvmrc`、`.node-version`、自定义 Railpack 安装命令或额外 Railway 变量，避免多份版本来源互相冲突。

## 失败行为

使用不兼容的 Node 或 npm 执行 `npm install`、`npm ci` 或 `npm run` 时，应在工作开始前得到明确的 `EBADDEVENGINES` 错误。使用 `npx --yes npm@10.8.2 ...` 可以在未全局安装目标 npm 时进入约定版本。

## 测试与文档

- 新增配置测试，读取真实 `package.json`，断言 `packageManager`、`engines`、`devEngines` 与 Node 20 兼容测试库版本保持一致。
- 先运行测试确认缺少 `devEngines` 和 Node 上界时失败，再进行最小配置修改。
- README 说明版本不匹配错误及标准恢复命令。
- 完成后运行 npm 10.8.2 干净安装、lint、typecheck、全量测试、服务端构建与 Expo Doctor。

## 范围

本次只调整开发与部署工具链约束，并将测试开发依赖降至 Node 20 兼容版本；不修改生产依赖、运行时业务代码、数据库、API 契约、客户端行为或 Railway 服务变量。
