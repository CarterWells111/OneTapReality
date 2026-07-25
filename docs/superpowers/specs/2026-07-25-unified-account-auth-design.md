# 统一账户、登录与 NFC 权限识别设计

## 目标

为 OneTapReality 增加全 App 的邮箱验证码登录与统一身份。用户可游客使用本地旅行册；登录后可识别管理员、NFC 礼品管理者、受邀浏览者和普通用户，并在受限页面安全地恢复到原访问路径。

## 账户与安全模型

- `users` 每个规范化邮箱一条记录，包含稳定 ID、邮箱、创建时间和最近登录时间；不保存密码或客户端秘密。
- `auth_email_codes` 保存一次性验证码的 pepper 哈希、过期时间、消费时间和创建时间。验证码为六位、短时有效，并沿用每邮箱发送限流。
- `auth_sessions` 保存账户 ID、30 天会话 token 的 pepper 哈希、过期时间、撤销时间和创建时间。原始 token 只返回一次并由客户端 SecureStore 保存。
- 所有 API 先从 bearer token 获取当前账户，再在服务端计算授权：`admin` 来自 `GIFT_ADMIN_EMAILS`，礼品 `owner`/`viewer` 来自现有按邮箱保存的 `gift_members`。客户端不能传递或覆盖角色。
- 旧礼品专用会话在发布后失效。旧认证表不会删除，但新 API 只使用统一账户会话；测试用户重新输入验证码即可恢复访问。

## 登录与页面流程

`/login` 提供邮箱输入、发送验证码、验证码验证、重新发送、错误和加载状态。验证成功后创建或读取账户、保存会话，并跳回 `returnTo` 指定路径。

App 根部新增 `AuthProvider`，独立于现有 `ProfileProvider`。它恢复 SecureStore 会话、请求当前账户、提供登录/登出和受限跳转。登出只移除认证凭据，不影响本地旅行册或个人资料。

- 个人页展示登录状态、已验证邮箱和管理员标识；设置页提供账户入口与登出。
- “我的纪念品”、`/activate` 与 `/gift/[token]` 未登录时跳转登录，成功后回到原路径。
- `/activate` 仅管理员可进入 NFC 开发者台；非白名单仅收到无权限状态。
- `/gift/[token]` 由服务端返回未认领、礼品管理、受邀只读或无权限状态；不向无权限账户返回相册数据。

## API 与兼容边界

新增统一 API：`POST /api/auth/request`、`POST /api/auth/verify`、`GET /api/auth/me` 和 `POST /api/auth/logout`。验证接口返回 `{ accessToken, user: { id, email, isAdmin } }`；当前用户接口返回相同的非敏感身份信息。

现有礼品与管理员 API 改用统一的 `requireAuthenticatedUser`。礼品成员仍以邮箱匹配，管理员 API 除会话外额外检查 Railway 白名单。旧 `/api/gift-auth/request` 和 `/api/gift-auth/verify` 暂作为发布期兼容入口，内部调用统一认证服务并签发新会话。

## 数据迁移与验收

新增不可变 Drizzle migration，只创建账户、验证码和会话表及唯一/查询索引；不删除历史礼品认证表，也不修改现有礼品成员记录。账户在验证码验证事务中按邮箱幂等创建。

验收覆盖首次注册、重复登录、验证码过期/限流/一次性使用、会话过期/撤销/登出、白名单管理员、owner/viewer/未知用户授权、游客跳转并返回、本地旅行册不受登录影响，以及旧会话被拒绝并引导重新登录。
