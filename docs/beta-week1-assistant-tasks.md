# Beta 第 1 周：辅助开发任务认领清单

来源：`docs/beta-plan.md`（四周 Beta 内测计划，2026-08-07 版）
分支：`fix/beta-round-1`
日期：2026-08-08

## 分工背景

按内测计划，辅助开发角色负责：**被认领的代码 Issue、自动测试、回归、错误文案**；
不直接合并 PR 或操作外部服务。本周主责为「为 Beta 路径补齐回归覆盖与缺陷分流」。

## 已认领并完成

| # | 任务 | 变更 | 测试证据 |
|---|------|------|----------|
| 1 | 邮箱验证码请求超时保护，避免按钮无限卡在忙碌态 | `src/services/backend/api-client.ts` 加 10s AbortController | `backend-client.test.ts` 超时中止用例 |
| 2 | 登录/验证错误文案分流（网络不可达 vs 服务端错误） | `src/app/login.tsx` `describeAuthError` | `login-screen.test.tsx` 网络错误与透传用例 |
| 3 | 个人资料编辑返回时自动保存（左上角返回/手势返回） | `src/app/settings/index.tsx` `beforeRemove` 守卫 | `settings-screen.test.tsx` 自动保存与无改动跳过用例 |
| 4 | 隐藏“后端状态”入口 | `src/app/settings/index.tsx` 移除后端状态区块 | 无独立测试（纯入口删除） |
| 5 | 字号进度条拖动崩溃修复 | `src/features/canvas/element-context-menu.tsx` `Gesture.Pan().runOnJS(true)` | `element-context-menu.test.tsx` 通过 |
| 6 | 城市名称标签平滑显示（随缩放淡入淡出，不跳变） | `src/features/cities/city-map.tsx` 标签改 UI 线程动画 | `city-map*.test.*` 25 用例通过 |
| 7 | 城市打卡弹窗改用手绘地图、移除橙/蓝打卡点 | `city-checkin-modal.tsx`、`city-checkin-images.ts` | typecheck 通过 |

## 城市手绘地图识别结果

10 张地图由本地视觉模型 Qwen3-VL-4B 逐张识别地标后对应：

| 文件 | 城市 | 识别依据（地标） |
|------|------|------------------|
| city-01.png | 北京 | 鸟巢、天安门、故宫、长城 |
| city-02.png | 上海 | 东方明珠、外滩、豫园 |
| city-03.png | 成都 | 大熊猫基地、锦里、杜甫草堂 |
| city-04.png | 杭州 | 西湖、灵隐寺 |
| city-05.png | 广州 | 广州塔、沙面 |
| city-06.png | 西安 | 兵马俑、城墙、大雁塔 |
| city-07.png | 武汉 | 黄鹤楼、长江大桥 |
| city-08.png | 深圳 | 地王大厦、深圳湾 |
| city-09.png | 长沙 | 橘子洲、岳麓山 |
| city-10.png | 重庆 | 洪崖洞、长江索道、朝天门 |

> 原映射（city-03=杭州 等）经识别已修正。拉萨、南京、昆明、哈尔滨因无对应图片，
> 从打卡弹窗列表移除，点击后走城市详情页。

## 遗留（需发布负责人/配置）

- 本地 `.env` 缺少 `GIFT_AUTH_PEPPER`、`RESEND_API_KEY`、`GIFT_EMAIL_FROM`（发送验证码必需）。
- 本地无 Docker Desktop / PostgreSQL，数据库不可达。
- 详见 `docs/operations/DEPLOYMENT-LOG.md` 与 RAILWAY 变量清单。

### 2026-08-08 更新：数据库与邮件配置排查进展

- **Docker Desktop 已定位并启动**（`C:\Users\JTST\AppData\Local\Programs\DockerDesktop`）。
  - 注意：本机 `DOCKER_HOST=tcp://localhost:2375` 环境变量是旧的、无效的；
    Docker 4.83 只监听命名管道，需用 `docker -c desktop-linux ...` 或
    `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine`。
- `adventurex-postgres` 容器（postgres:17）已启动，端口 5432。
- `adventurex` 库已应用 migration，schema version = 7。
- **`/api/health` 返回 200** `{"database":"ok","schemaVersion":7}`；capabilities 正常。
- `.env` 已补 `GIFT_EMAIL_FROM`、`GIFT_ADMIN_EMAILS`、`GIFT_SHARING_ENABLED`、
  `GIFT_URL_ORIGIN`（均为文档默认值）。
- **仍缺 2 个秘密变量**（必须从 Railway 控制台复制，无法本地生成）：
  `GIFT_AUTH_PEPPER`、`RESEND_API_KEY`。补齐后验证码即可本地发送。
- 生产后端 `https://onetapserver-production.up.railway.app/api/health` 在线（200），
  若不想配本地邮件，可将 `EXPO_PUBLIC_API_ORIGIN` 指向该地址直接用生产端。

## 下轮候选（第 2 周，按 P0/P1 优先级）

- [ ] 激活/登录链路错误文案的端到端验证（需后端可用后执行 `verify:backend`）。
- [ ] 字号滑块拖动范围的单元测试（当前只有渲染级测试）。
- [ ] 打卡地图图片加载失败时的降级展示测试。
