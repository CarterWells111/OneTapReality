# NFC 后续交接

Expo Go 不包含第三方原生 NFC 模块；真实礼品卡必须使用包含 `react-native-nfc-manager` 的原生 EAS 构建。当前 TestFlight 已支持 NFC 礼品初始化与验证。

Alpha 测试卡写入 `https://staging.onetapreality.com/gift/<token>`，正式卡写入 `https://onetapreality.com/gift/<token>`。两域均需部署准确的 Universal/App Link 关联文件。标签只保存高熵 URL，不读取或保存 NFC UID；token 只以 pepper hash 保存，写卡清单只在受限操作环境短暂产生。发生 P0 时停止写卡和邀请、关闭 `GIFT_SHARING_ENABLED`，并使用管理员停用接口删除已发布内容。

