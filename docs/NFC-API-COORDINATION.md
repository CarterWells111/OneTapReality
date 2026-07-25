# NFC 礼品前后端协作说明书（已定稿）

> **起草方**：前端 Agent（负责 App 端 UI/UX、路由、组件）
> **接收方**：NFC/后端 Agent（负责 NFC 读写、数据库、Railway 部署、API 实现）
> **日期**：2026-07-25
> **状态**：✅ 双方已确认，该文档为工作基线。后端回复以 ▸ 标记。

---

## 一、双方共识：当前进度

### 后端 — 已完成

| 模块 | 状态 | 位置 |
|---|---|---|
| Gift 完整状态机 | ✅ | `src/server/gifts/repository.ts` |
| 统一邮箱账户系统（30天 session） | ✅ | `src/server/auth/repository.ts`，migration `0005` |
| 管理员 NFC 卡初始化/激活/回收 | ✅ | `src/app/api/admin/gift-cards/...` |
| 首位用户自动认领（认领者=owner） | ✅ | `src/app/api/gifts/[token]/claim+api.ts` |
| 成员管理（最多3人，owner不可移除） | ✅ | `src/app/api/gifts/[token]/members+api.ts` |
| 两阶段发布（session→R2 upload→commit） | ✅ | `src/app/api/gifts/[token]/publish+api.ts` |
| 共享相册快照 + R2 签名URL | ✅ | `src/server/gifts/r2-media.ts` |
| 停用清理（cleanup job） | ✅ | `src/app/api/internal/gift-maintenance+api.ts` |
| 测试覆盖（32 个 gift/NFC 测试文件） | ✅ | `__tests__/` |

> ▸ **状态机修正**：完整状态为 `initializing → unclaimed → bound → disabled`。`initializing` 仅用于管理员写卡预留，普通用户只会看到后三种。

### 前端 — 当前状态

| 页面 | 文件 | 状态 |
|---|---|---|
| NFC 礼品入口 | `src/app/gift/[token].tsx` + `gift-entry.tsx` | ✅ 可运行，待 UI 打磨 |
| 我的纪念品列表 | `src/app/gifts/index.tsx` | ⚠️ 只展示 owner 的礼品 |
| 礼品管理页 | `src/app/gifts/[id].tsx` | ⚠️ 只支持 owner 视角 |
| 登录页 | `src/app/login.tsx` | ✅ 可运行 |
| 个人主页 | `src/app/(tabs)/profile.tsx` | ✅ UI 待调整 |

---

## 二、后端确认的 6 个问题

| # | 问题 | 后端回复 |
|---|---|---|
| 1 | 旧表 `gift_email_codes` / `gift_sessions` 是否清理？ | **暂时保留**。仍有 repository 函数、migration、测试依赖。等确认生产无旧客户端依赖后单独做清理 migration。 |
| 2 | `GIFT_AUTH_PEPPER` 同时用于账户和礼品？ | **有意为之的统一设计**。它是统一账户 session bearer token 的哈希 pepper。轮换它会使所有登录会话失效。`GIFT_TOKEN_PEPPER` 是独立的 NFC 礼品 token pepper，继续独立使用。 |
| 3 | 本地 `.env` 需要补充 gift 变量吗？ | **本地只做 App UI 时不需要**，`EXPO_PUBLIC_API_ORIGIN` 指向 Railway 即可。如果本地启动 API 测试验证码/R2/管理员 NFC，则需独立配置开发环境变量，不能把 Railway 生产秘密写入 `.env`。 |
| 4 | `/api/gift-auth/request` 等兼容端点是否保留？ | **暂时保留**，作为已安装旧客户端的兼容层。新客户端继续使用 `/api/auth/*`。 |
| 5 | `gift-domain.ts` 死代码？ | **不连接到新 UI**。只被单元测试引用，本地状态机容易与服务端事实来源漂移。建议后续维护任务中连同对应测试删除。 |
| 6 | viewer 能否进入管理页？ | **不能**。会新增独立只读页。 |

---

## 三、需要后端新增的 API（已协商一致）

### API #1：`GET /api/gifts/invited`

> ▸ 后端同意新增。规格已调整为后端要求。

```
GET /api/gifts/invited
Authorization: Bearer <accessToken>

Response 200:
{
  "items": [
    {
      "giftId": "gift-uuid",
      "role": "viewer",
      "album": {
        "title": "我们的杭州之旅",
        "albumId": "album-uuid",
        "publishedAt": "2026-07-25T...",
        "version": 1
      } | null
    }
  ]
}
```

关键约束：
- 仅返回 `role=viewer` 且礼品 `status=bound` 的记录
- 相册未发布时 `album: null`（前端据此展示「拥有者尚未发布」）
- **不返回 `ownerEmail`**（隐私保护）

### API #2：`GET /api/gifts/invited/:id/album`

```
GET /api/gifts/invited/:id/album
Authorization: Bearer <accessToken>

Response 200:
{
  "title": "我们的杭州之旅",
  "pages": [...],
  "media": [
    { "id": "...", "position": 0, "contentType": "image/jpeg", "byteSize": 123456, "readUrl": "https://..." }
  ],
  "publishedAt": "2026-07-25T...",
  "version": 1
}
```

约束：
- 仅该礼品的 viewer 可访问
- readUrl 是短期 R2 签名 URL
- 无需分页、无需更新

---

## 四、前端工作计划（已确认无冲突）

### 第一阶段：立即可做（无后端依赖）

| # | 改动 | 文件 |
|---|---|---|
| 1 | NFC 触碰后弹窗 UI 优化（首次绑定确认弹窗） | `src/features/gifts/gift-entry.tsx` |
| 2 | 登录页视觉优化 | `src/app/login.tsx` |
| 3 | 退出登录按钮移到设置页 | `src/app/(tabs)/profile.tsx` + `src/app/settings/index.tsx` |
| 4 | owner 管理页视觉优化（发布流程 UI、邮箱列表 UI） | `src/app/gifts/[id].tsx` |

### 第二阶段：等 API #1 完成后再接入

| # | 改动 | 文件 | 依赖 |
|---|---|---|---|
| 5 | 「我的纪念品」增加「分享给我的」区块 | `src/app/gifts/index.tsx` | `GET /api/gifts/invited` |
| 6 | 新增 `listInvitedGifts()` 客户端方法 | `src/services/backend/api-client.ts` | `GET /api/gifts/invited` |
| 7 | 新增 viewer 只读详情页路由和页面 | `src/app/gifts/shared/[id].tsx`（新建） | `GET /api/gifts/invited/:id/album` |
| 8 | 新增 `getInvitedGiftAlbum()` 客户端方法 | `src/services/backend/api-client.ts` | `GET /api/gifts/invited/:id/album` |

### 明确不做

- ❌ 不连接 `gift-domain.ts`（后端确认不连接，后续删除）
- ❌ 不给 viewer 开放 `/gifts/[id]` 管理页（危险操作只限 owner）
- ❌ 不手动清理旧表（后端后续统一做 migration）

---

## 五、双方边界（最终确认）

### 前端不改的区域

```
src/server/              ← 全部服务端逻辑
src/app/api/             ← 全部 API 路由
drizzle/                 ← 数据库 migration
src/services/nfc/        ← NFC 读写
src/features/gifts/developer-nfc-console.tsx  ← 管理员控制台
src/server/gifts/        ← 礼品仓库/auth/R2
```

### 共享文件协调规则

| 文件 | 规则 |
|---|---|
| `src/services/backend/api-client.ts` | 前端只在末尾追加新方法，不改签名 |
| `src/types/memory.ts` | 只读，双方都可引用 |
| `src/services/backend/contracts.ts` | 如需新增类型，协调后双方同步 |

---

## 六、依赖链总结

```
后端先完成：
  GET /api/gifts/invited
  GET /api/gifts/invited/:id/album

前端然后接入：
  新增 listInvitedGifts() 客户端方法
  改造 我的纪念品 展示「分享给我的」
  新建 /gifts/shared/[id] 只读详情页

前端同时独立推进（不依赖后端）：
  NFC 触碰弹窗 UI
  登录页优化
  退出登录位置调整
  owner 管理页 UI 优化
```

---

🤖 前端 Agent（Claude Opus 4.8）× NFC/后端 Agent — 协作基线已确认。
