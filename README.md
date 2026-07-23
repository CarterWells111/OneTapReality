# OneTapReality｜一触如初

OneTapReality｜一触如初是一个本地优先的情侣旅行纪念册演示 App。用户主动选择照片，填写旅行信息，获得可编辑的旅行册草稿，并将其保存在设备中。

## 本版能力

- 创建、编辑、保存和删除本地旅行纪念册
- 从系统相册多选照片（仅在点击选择时请求权限）
- 杭州、上海、深圳城市收藏预览与本地解锁状态
- 本地演示草稿生成器；不接入真实 AI；设置中提供不上传数据的手动后端接口检查
- Expo Go 可直接运行的 NFC“模拟碰一碰”体验

## 本地启动

本项目固定使用 **Expo SDK 54**，请使用与你安装版本相匹配的 Expo Go。

```bash
npm install
npm run start
```

用 iPhone 上的 Expo Go 扫描终端二维码。若局域网发现失败，使用 `npm run start -- --tunnel`。

## 本地启动后端

开发期不需要分别启动前端和 API。Expo dev server 同时提供 App bundle 和 `/api/*`，Expo Go 会自动把相对 API 请求指向当前 dev server。PostgreSQL 是独立基础设施，必须先在本机或 Docker 中运行。

首次启动：

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

如果本机没有 PostgreSQL，可先用 Docker 创建开发数据库：

```powershell
docker run --name adventurex-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=adventurex -p 5432:5432 -d postgres:17
```

以后只需执行 `docker start adventurex-postgres`。编辑 `.env`，确认 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adventurex`，并将 `DEVICE_TOKEN_PEPPER` 换成仅用于本机的随机字符串。开发期保持 `EXPO_PUBLIC_API_ORIGIN` 为空。若使用已安装的 PostgreSQL，创建 `adventurex` 数据库并按实际用户名、密码和端口修改 URL。

直接验证开发后端：

```bash
npm run verify:backend -- http://localhost:8081
```

成功时输出：

```json
{"health":200,"register":201,"create":201,"list":200,"delete":204}
```

如果启动时仍看到“Using API routes requires the web.output to be set to `server`”提示，先按 `Ctrl+C` 停止旧进程，确认当前目录是项目根目录，再清除 Expo 缓存重启：

```powershell
Get-Location
npx expo config --type public
npm run start -- --clear
```

`npx expo config --type public` 的输出中应包含 `web: { output: 'server' }`。如果没有，说明启动命令不是从本项目目录执行，或当前代码还未包含 API Routes 配置。

## 模拟 Railway 生产启动

生产环境与开发环境使用同一批 Expo API Routes，但 Railway 运行的是导出后的 Node server：

```powershell
npm run build:server
npm run start:server
```

该命令仍需要 `.env` 中的 `DATABASE_URL`，默认监听 `PORT=3000`。另开终端验证：

```bash
npm run verify:backend -- http://127.0.0.1:3000
```

`build:server` 使用 API-only export，不构建依赖本地 `expo-sqlite` 的 Web App。Railway 部署配置、变量清单和上线后操作见 [docs/backend/RAILWAY.md](./docs/backend/RAILWAY.md)。

Railway 生成域名后，把 native 构建环境中的公开地址设为：

```env
EXPO_PUBLIC_API_ORIGIN=https://your-service.up.railway.app
```

随后重新构建 App。动态 Expo config 会同时把该地址写入 API client 和 Expo Router `origin`。这是公开服务地址，不是秘密；`DATABASE_URL` 与 `DEVICE_TOKEN_PEPPER` 只能配置在 Railway 后端服务。

## 验证后端接入

### 方式一：检查 App 页面

1. 启动 `npm run start` 或 `npm run web`。
2. 打开 App 的“设置”→“后端实验”。
3. 点击“检查后端连接”。
4. 页面显示“后端连接正常”即表示 `/api/health` 和 `/api/capabilities` 都已成功调用。

该页面只检查服务能力，不会自动注册设备、上传照片或同步本地旅行册。

### 方式二：跨平台 API smoke check

```bash
npm run verify:backend -- http://localhost:8081
```

脚本自动验证 health、匿名设备注册、旅行册创建、列表可见性和删除清理，不打印 access token。若返回 `database_unavailable`，检查 PostgreSQL 是否运行及 `DATABASE_URL` 是否正确；若提示表不存在，执行 `npm run db:migrate`；若返回 `network_unavailable`，确认 origin 与当前服务端口一致。

## 检查命令

```bash
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
```

## 隐私与限制

所有纪念册内容仍仅保存在本机 SQLite 中。本版不自动同步、不上传图片、不识别人脸或地点、不使用账号、分析埋点、支付、订单或网络 AI。设置中的后端实验页只有在用户主动点击时检查服务能力，不发送旅行册或照片内容。真实 NFC 和云端 AI 属于后续 Development Build 阶段，具体边界见 [docs](./docs)。

## 演示路径

1. 首页点击“创建纪念册”。
2. 选择至少一张照片，填写标题、城市和日期。
3. 生成并编辑旅行册草稿，然后保存。
4. 在“城市”查看解锁状态与模拟碰一碰。

