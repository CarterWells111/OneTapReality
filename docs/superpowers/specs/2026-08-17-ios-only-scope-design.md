# iOS-only 产品范围设计

## 目标

OneTapReality 当前及可预见计划仅面向 iPhone/iOS。仓库不再声明 Android 原生应用、Android 构建入口或 Android App Links，避免内部配置和公开站点暗示 Android 可用。

## 配置边界

- `app.json` 保留 iOS、Web 与跨平台插件，删除整个 `expo.android` 配置。
- `eas.json` 删除 Android 专用 development profile；其余 profile 继续仅通过明确的 `-p ios` 发布流程使用。
- `package.json` 删除 `android` 启动脚本，保留 iOS、Web 和通用开发脚本。
- Android 图标文件暂不删除；它们不再被配置引用，仅作为历史未引用素材保留。

## 网站与链接

- 网站继续提供 Apple AASA 和 iOS 礼品链接回退。
- 删除 `assetlinks.json`、Worker Android 响应分支、静态站构建占位符及对应 header。
- 不改变礼品 HTTPS URL、API、数据库或 NFC token 安全逻辑。

## 兼容代码与限制

React Native 内现有 Android 条件分支、类型与样式保持不变；这些是依赖兼容代码，不构成产品支持承诺。Expo Go 可能继续显示 `expo-media-library` 的 Android 通用警告，完整照片权限与 NFC 只使用 iOS development/TestFlight build 验收。

## 文档与验证

新决策取代“稍后重新评估 Android”的旧范围。发布、隐私、安全和 NFC 文档统一为 iOS-only。测试必须证明 Android Expo/EAS/npm/App Links 配置均不存在，同时 iOS Bundle ID、AASA、EAS profiles、本地数据库与跨平台运行代码保持稳定。
