# 安全与隐私

相册权限仅在用户点击“选择照片”时申请。照片 URI、旅行信息和草稿仅存放在本机 SQLite 数据库中。

本版没有账号、云同步、遥测、广告、支付或网络请求。用户可在“我的”页面二次确认后删除全部本地旅行数据。

SQL 写入必须使用参数绑定。不得将私密配置、个人照片或访问令牌写入仓库。

后端接口使用安装随机 ID 注册匿名设备，并以 SecureStore 保存不透明 bearer token。服务端只保存 token hash 和带 pepper 的摘要；所有旅行册查询按设备隔离。服务端 DTO 禁止照片 URI、图片二进制、本地路径、API key 和其他秘密。服务端环境变量不得以 `EXPO_PUBLIC_` 开头，也不得从客户端模块导入。

Railway 只保存 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN` 与 `DEVICE_TOKEN_PEPPER` 等服务端变量。`EXPO_PUBLIC_API_ORIGIN` 只能包含公开 HTTPS origin，会进入客户端 bundle；不得把 Turso token、pepper 或其他秘密放入任何 `EXPO_PUBLIC_` 变量。`server.cjs` 监听 Railway 注入的 `PORT`，并关闭 Express 的 `x-powered-by` 响应头。

