# 架构

应用使用 Expo Router、TypeScript 和 `expo-sqlite`。路由只放在 `src/app`，业务代码放在 `src/features`、`src/services`、`src/storage` 与 `src/components`。

SQLite 保存纪念册、照片顺序和旅行册页内容。城市解锁由已保存纪念册的城市字段推导，不保存重复状态。

`DraftGenerator` 与 `CityKeyResolver` 是稳定边界：本版分别由本地演示实现和模拟 NFC 实现提供。未来云端实现只能替换服务层，不能改变页面层或将秘密放入客户端。

