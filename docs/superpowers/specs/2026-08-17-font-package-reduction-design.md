# 中文字体包精简设计

## 目标

缩减 OneTapReality 本地中文字体资源和相册编辑页字体选项，同时保持现有页面的字体映射与视觉样式不变。

## 保留范围

最终仅保留以下五个字体文件：

- `XiMaiXiHuan.ttf`
- `ChaoHuaTitleA.ttf`
- `ChaoHuaTypewriter.ttf`
- `MaoKenZhuYuan.ttf`
- `LXGWNeoZhiSongPlus.ttf`

现有页面继续使用当前的主视觉、标题和正文字体映射。相册编辑页字体资源与字体选项同步精简为这五款，不保留指向已删除字体的引用。

## 实现边界

- 删除 `assets/fonts` 中其余 14 个字体文件。
- 更新 `src/features/typography/fonts.ts`，保留现有页面字体常量和映射，仅精简编辑器字体源与选项。
- 不调整页面布局、字号、字重、颜色或其他排版样式。
- 不新增依赖、远程字体、网络请求、分析、支付或第三方服务。

## 验证

- 先增加自动测试，断言字体目录、应用字体映射和相册字体选项只引用预期文件，并确认测试在精简前因多余字体而失败。
- 删除资源和引用后运行该测试。
- 完成阶段运行 `npm run lint`、`npm run typecheck`、`npm run test:ci`；字体资源会进入 Expo 生产打包，因此额外运行 `npm run build:server`。

## 风险控制

主要风险是 Metro 在构建时遇到失效的静态 `require`，或已有页面字体映射被误改。测试和生产构建共同验证资源集合、静态引用与 Expo 打包结果。删除目标只来自已确认的 14 个非保留字体文件。
