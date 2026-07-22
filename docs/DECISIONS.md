# 决策记录

## 2026-07-22：首版本地优先

选择 Expo Go、SQLite 和本地演示生成器，以保证三天内可离线展示。真实 AI、NFC、商城和账号不进入首版。

## 2026-07-22：远端覆盖策略

远端 `CarterWells111/Tralbum` 的现有 README 将在本地验收完成后被完整项目覆盖。推送必须使用 `--force-with-lease`，远端 SHA 改变则停止。

## 2026-07-22：Expo SDK 54 兼容

项目依赖固定到 Expo 54.0.36、Expo Router 6.0.24、React Native 0.81.5 和 React 19.1.0，以匹配现场设备上的 SDK 54 Expo Go。SDK 57 的模板依赖与 lockfile 已重建，不再混用。

## 2026-07-22：草稿预览闭环的最小集成范围

为满足“生成后确认、未确认不进入首页、可保留/重试/丢弃”的 P0 验收，允许 Issue #3 修改 `memories-provider` 和创建页，并新增预览路由。预览页只通过 Provider 调用本地仓储公开 API；重试只使用 `DemoDraftGenerator`，不新增网络、模型 SDK、账号、支付或真实 NFC。

