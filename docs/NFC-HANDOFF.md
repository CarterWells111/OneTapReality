# NFC 后续交接

Expo Go 不包含第三方原生 NFC 模块。本版使用 `CityKeyResolver` 和“模拟碰一碰”页面展示交互路径。

后续真机方案：NTAG213 标签写入 HTTPS NDEF URL；配置 Universal Link 与 `apple-app-site-association`；使用 Development Build 接入 `react-native-nfc-manager`。标签写入、域名、Apple Team 配置和真实扫码测试均不属于本仓库首版验收。

