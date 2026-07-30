# App Link 网页回退设计

## 目标

修复 `https://onetapreality.com/activate` 当前返回 404 的问题，并确保
`/activate` 与任意 `/gift/<token>` 在 App 未安装、Universal Link 未接管或
用户主动留在浏览器时显示安全的安装提示页。

## 已批准方案

复用一个静态安装提示页面，由网站 Worker 对以下路径返回 HTTP 200：

- `/activate`
- `/activate/`
- `/gift/<任意非空路径>`

页面只说明需要安装或打开 OneTapReality 后重新触碰 NFC 卡，不显示 URL
中的礼品 token，不请求 Railway API，也不暴露礼品、相册、邮箱或库存信息。
现有首页、隐私页、支持页、AASA 和 Android Asset Links 的响应保持不变；
其他未知路径继续返回 404。

## 实现边界

- 新增一个可复用的静态 App Link 回退页面。
- 网站构建脚本将该页面嵌入 Worker 产物。
- Worker 只根据 pathname 选择页面，不解析、记录或回显 token。
- 不修改原生 App、NFC 写卡逻辑、Railway API、数据库或身份验证。

## 错误与安全行为

- `/gift/` 没有 token 时不作为有效礼品链接，继续返回 404。
- 任意查询参数与片段都不会出现在页面内容中。
- 页面不自动跳转到未知自定义协议，不触发登录或数据读取。
- App 已安装时仍由现有 AASA/Asset Links 优先交给原生 App。

## 测试与验收

先增加失败测试，验证构建后的 Worker：

- `/activate`、`/activate/` 和 `/gift/example-token` 返回 200 与安装提示。
- `/gift/` 和未知路径返回 404。
- 礼品 token 不出现在响应正文。
- AASA 与 Asset Links 内容及 Content-Type 不变。

构建通过后部署现有 Sites 项目，并对生产域名执行只读检查，确认
`/activate`、示例 `/gift/*`、AASA 与 Asset Links 均返回预期结果。
