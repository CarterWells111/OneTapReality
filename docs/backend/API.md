# 后端 API 契约

## 范围

这是接口骨架，不改变 app 当前的本地优先行为。除健康检查、能力探测和手动实验页外，现有页面不会自动调用这些接口。

## 公共接口

### `GET /api/health`

返回服务与数据库状态：

```json
{
  "service": "onetapreality-api",
  "contractVersion": 1,
  "database": "ok"
}
```

数据库不可用时返回 `503`，但不暴露连接字符串或底层错误。

### `GET /api/capabilities`

```json
{
  "contractVersion": 1,
  "features": {
    "deviceRegistration": true,
    "memoryCrud": true,
    "automaticSync": false,
    "photoUpload": false
  }
}
```

## 匿名设备

### `POST /api/devices/register`

请求：

```json
{ "installationId": "client-generated-random-id" }
```

响应 `201`：

```json
{
  "contractVersion": 1,
  "deviceId": "server-generated-uuid",
  "accessToken": "opaque-base64url-token"
}
```

重复注册同一个安装 ID 时轮换旧 token。服务端只保存 token hash。

## 旅行册

所有旅行册接口都要求：

```text
Authorization: Bearer <accessToken>
```

创建请求与更新请求使用相同的脱敏 payload：

```json
{
  "title": "旅行标题",
  "city": "hangzhou",
  "travelDate": "2026-07-22",
  "status": "saved",
  "photoCount": 2,
  "pages": [
    {
      "id": "page-1",
      "position": 0,
      "kind": "cover",
      "headline": "标题",
      "body": "正文",
      "photoSlot": 0,
      "layout": {
        "aspectRatio": 1,
        "elements": [
          {
            "id": "image-1",
            "type": "image",
            "photoSlot": 0,
            "x": 0,
            "y": 0,
            "width": 1,
            "height": 1,
            "rotation": 0,
            "zIndex": 0
          }
        ]
      }
    }
  ]
}
```

禁止字段：`photoUris`、`photoUri`、`uri`、图片二进制、API key、token 和本地路径。

- `GET /api/memories`：返回当前设备的旅行册列表。
- `POST /api/memories`：创建旅行册，返回 `201`。
- `GET /api/memories/:id`：读取当前设备的单册。
- `PUT /api/memories/:id`：完整替换当前设备的单册。
- `DELETE /api/memories/:id`：硬删除并级联删除页面，返回 `204`。

## 礼品相册发布

礼品 owner 或已激活 editor 使用对应的 `/publish` 路由完成三段式发布：

1. `POST` 提交页面快照及媒体的类型、字节数，服务端创建 30 分钟有效的发布会话并返回 10 分钟有效的私有上传 URL；
2. 客户端直接 `PUT` 图片到返回的 R2 URL；URL 在会话期间失效时，可对同一路由发送已认证的 `PATCH`，请求体只能包含 `{ publicationId, positions, cover }`，服务端重新核对礼品、账号权限、会话有效期与待上传位置后签发指定 URL；
3. 所有对象上传完成后，对同一路由发送 `PUT { publicationId }` 完成发布。

`PATCH` 不创建或延长发布会话，不接受客户端提供的对象 key，也不会发布或改变当前共享版本。只有最终 `PUT` 完成元数据校验与版本比较后才会原子替换当前共享相册；失败或过期的会话不会影响上一版本。

## 错误

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request body is invalid",
    "fields": { "title": "Required" }
  }
}
```

状态码：`400` 输入错误、`401` 未授权、`404` 不存在或不属于当前设备、`409` 冲突、`500` 未捕获服务错误、`503` 数据库不可用。
