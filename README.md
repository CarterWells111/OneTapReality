# OneTapReality｜一触如初

OneTapReality｜一触如初是一个本地优先的情侣旅行纪念册演示 App。用户主动选择照片，填写旅行信息，获得可编辑的旅行册草稿，并将其保存在设备中。

## 本版能力

- 创建、编辑、保存和删除本地旅行纪念册
- 从系统相册多选照片（仅在点击选择时请求权限）
- 杭州、上海、深圳城市收藏预览与本地解锁状态
- 本地演示草稿生成器；不接入真实 AI；设置中提供不上传数据的手动后端接口检查
- Expo Go 可直接运行的 NFC“模拟碰一碰”体验

## 本地开发总览

本项目固定使用 **Expo SDK 54**，请使用匹配版本的 Expo Go。开发环境由三部分组成：

- PostgreSQL：独立进程，保存匿名设备与脱敏的后端实验数据。
- Expo dev server：一个进程同时提供 App bundle 和 `/api/*`，不需要分别启动前端与 Node API。
- App SQLite：仍是旅行册的唯一业务数据源，不会自动同步到 PostgreSQL。

### 新开发者首次搭建

1. 在项目根目录安装依赖并创建本地环境文件：

   ```powershell
   Copy-Item .env.example .env
   node --version
   npm --version
   npm ci
   ```

   项目最低要求为 Node `>=20.19.4` 和 npm `>=10.8.2`；满足最低要求的更高版本也可使用。`package.json` 中的 `engines` 与 `devEngines` 分别供 Railway 和 npm 执行这些最低版本约束。

2. 编辑 `.env`。本地开发保持公开 origin 为空，并为 pepper 设置仅供本机使用的随机长字符串：

   ```env
   EXPO_PUBLIC_API_ORIGIN=
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adventurex
   DEVICE_TOKEN_PEPPER=replace-with-your-random-local-secret
   PORT=3000
   ```

   若使用已安装的 PostgreSQL 而不是 Docker，请先创建 `adventurex` 数据库，并按实际用户名、密码和端口修改 `DATABASE_URL`。

3. 启动 Docker Desktop，检查数据库容器是否已经存在：

   ```powershell
   docker ps -a --filter "name=adventurex-postgres"
   ```

   如果没有任何容器，首次创建 PostgreSQL：

   ```powershell
   docker run --name adventurex-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=adventurex -p 5432:5432 -d postgres:17
   ```

   如果容器已经存在但处于停止状态：

   ```powershell
   docker start adventurex-postgres
   ```

4. 等待 PostgreSQL 接受连接：

   ```powershell
   docker exec adventurex-postgres pg_isready -U postgres -d adventurex
   ```

   预期包含 `accepting connections`。

5. 应用 migration，并确认初始框架：

   ```powershell
   npm run db:migrate
   docker exec adventurex-postgres psql -U postgres -d adventurex -c "\dt"
   ```

   预期包含 `devices`、`memories`、`memory_pages`；Drizzle 还会在 `drizzle` schema 中维护 migration 记录。这些业务表首次创建后可以是空表。

6. 启动 App 与 API：

   ```powershell
   npm run dev
   ```

   用 Expo Go 扫描二维码。若局域网发现失败：

   ```powershell
   npm run dev -- --tunnel
   ```

7. 在另一个终端验证后端：

   ```powershell
   Invoke-RestMethod http://localhost:8081/api/health
   npm run verify:backend -- http://localhost:8081
   ```

   完整 smoke check 成功时输出：

   ```json
   {"health":200,"register":201,"create":201,"list":200,"delete":204}
   ```

### 日常开发与维护

正常情况下每天只需：

```powershell
# Windows 上先确认 Docker Desktop 已启动
docker start adventurex-postgres
npm run dev
```

`docker start` 提示容器已运行可以忽略。`npm run db:migrate` 不需要每天执行；仅在首次创建数据库或拉取到新的 `drizzle/*.sql` 时执行。

拉取代码后的维护顺序：

```powershell
npm ci
npm run db:migrate
npm run lint
npm run typecheck
npm run test:ci
```

如果修改服务端 schema：

1. 修改 `src/server/db/schema.ts`。
2. 执行 `npm run db:generate` 生成新的递增 migration。
3. 审查生成的 SQL；不要修改已经应用过的 migration。
4. 执行 `npm run db:migrate` 和 `npm run verify:backend -- http://localhost:8081`。
5. 提交 schema、SQL 和 `drizzle/meta/*`。

开发结束后按 `Ctrl+C` 停止 Expo。数据库可以继续运行；如需停止：

```powershell
docker stop adventurex-postgres
```

### npm 与锁文件规范

- 执行安装或项目脚本时出现 `EBADDEVENGINES`，表示当前 Node 或 npm 低于项目最低要求。先运行 `node --version` 与 `npm --version`；Node 必须为 `20.19.4` 或更高版本，npm 必须为 `10.8.2` 或更高版本。
- `package.json` 是直接依赖的来源，`package-lock.json` 由满足最低要求的 npm 生成，不手工编辑。
- 普通安装和 Railway 复现使用 `npm ci`；只有在明确新增、升级或删除依赖时才使用 `npm install`。
- 发生合并冲突时，先正确解决 `package.json`，不要逐行合并锁文件，也不要无条件选择某一侧的锁文件。
- 解决 `package.json` 后，使用下面的命令重新生成并验证锁文件：

  ```powershell
  npm install --package-lock-only
  npm ci
  ```

- 删除整个 `package-lock.json` 后重新解析所有依赖只作为最后手段；提交前检查锁文件 diff，避免夹带无关依赖升级。

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

Railway 部署成功后，不需要每天手动启动线上前后端：PostgreSQL 与 OneTapServer 会持续运行；连接 GitHub 的 Service 会在 `main` 更新后自动构建并重新部署。

Railway 生产 API 已部署在：

```env
EXPO_PUBLIC_API_ORIGIN=https://onetapserver-production.up.railway.app
```

`eas.json` 的 `production` profile 已固定使用该公开地址。创建 iOS 或 Android 生产构建：

```bash
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest build -p android --profile production
```

动态 Expo config 会同时把该地址写入 API client 和 Expo Router `origin`。本地 `npm run start` 不使用 `production` profile，继续通过相对 `/api/*` 连接同一个 Expo dev server。Railway 域名是公开地址，不是秘密；`DATABASE_URL` 与 `DEVICE_TOKEN_PEPPER` 只能配置在 Railway 后端服务。

## 后端验证与调试流程

App 的“设置 → 后端实验”只验证两件事：

- `/api/health` 能否连接 PostgreSQL 并执行 `SELECT 1`。
- `/api/capabilities` 是否返回预期接口能力。

它不会展示数据库内容，也不会注册设备、同步本地旅行册或上传照片。因此 `devices`、`memories` 和 `memory_pages` 都是空表时，页面仍应显示“后端连接正常”。health 也不验证业务表是否已经由 migration 创建。

从底层到上层依次检查：

```powershell
# A. Docker 容器
docker ps -a --filter "name=adventurex-postgres"

# B. PostgreSQL 就绪状态和端口
docker exec adventurex-postgres pg_isready -U postgres -d adventurex
Test-NetConnection localhost -Port 5432

# C. migration 与业务表
npm run db:migrate
docker exec adventurex-postgres psql -U postgres -d adventurex -c "\dt"

# D. Expo API；保持 npm run dev 在另一终端运行
Invoke-RestMethod http://localhost:8081/api/health
Invoke-RestMethod http://localhost:8081/api/capabilities

# E. 匿名注册与 CRUD 全链路
npm run verify:backend -- http://localhost:8081
```

health 成功时返回：

```json
{"service":"adventurex-api","contractVersion":1,"database":"ok"}
```

smoke check 成功时返回：

```json
{"health":200,"register":201,"create":201,"list":200,"delete":204}
```

smoke 脚本会删除自己创建的测试旅行册，但会保留一条匿名测试设备记录；它不会打印 access token 或上传照片。

### 常见问题定位

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `docker start` 返回 `No such container` | 数据库容器从未创建 | 执行首次搭建中的 `docker run ... postgres:17` |
| 无法连接 Docker API | Docker Desktop 未启动 | 启动 Docker Desktop，等待引擎就绪 |
| `pg_isready` 未显示 `accepting connections` | PostgreSQL 尚未启动或正在初始化 | 查看 `docker logs adventurex-postgres` 后重试 |
| `Test-NetConnection` 的 `TcpTestSucceeded` 为 `False` | 5432 未监听或被其他服务占用 | 检查容器状态、端口映射和本机 PostgreSQL |
| capabilities 正常，但 health 返回 `503 database_unavailable` | Expo API 正常，数据库未启动或 `DATABASE_URL` 错误 | 启动 PostgreSQL 并检查 `.env` |
| health 正常，但注册/CRUD 提示表不存在 | 数据库可连接，但 migration 未应用 | 执行 `npm run db:migrate` 并用 `\dt` 验证 |
| App 显示 `Network unavailable` | Expo dev server 不可达或 API origin 不正确 | 确认 `npm run dev` 正在运行；真机发现失败时使用 `--tunnel` |
| 提示 `web.output` 必须为 `server` | 启动目录/分支错误或 Expo 缓存陈旧 | 在项目根目录检查 `npx expo config --type public`，再执行 `npm run start -- --clear` |
| npm 返回 `EBADDEVENGINES` | 当前 Node 或 npm 低于项目最低要求 | 升级至 Node `>=20.19.4`、npm `>=10.8.2`，再执行 `npm ci` |

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

