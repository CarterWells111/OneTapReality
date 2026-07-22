# 旅忆 Tralbum

旅忆是一个本地优先的情侣旅行纪念册演示 App。用户主动选择照片，填写旅行信息，获得可编辑的旅行册草稿，并将其保存在设备中。

## 本版能力

- 创建、编辑、保存和删除本地旅行纪念册
- 从系统相册多选照片（仅在点击选择时请求权限）
- 杭州、上海、深圳城市收藏预览与本地解锁状态
- 本地演示草稿生成器；不接入真实 AI 或网络服务
- Expo Go 可直接运行的 NFC“模拟碰一碰”体验

## 本地启动

本项目固定使用 **Expo SDK 54**，请使用与你安装版本相匹配的 Expo Go。

```bash
npm install
npm run start
```

用 iPhone 上的 Expo Go 扫描终端二维码。若局域网发现失败，使用 `npm run start -- --tunnel`。

## 检查命令

```bash
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
```

## 隐私与限制

所有纪念册内容仅保存在本机 SQLite 中。本版不上传图片、不识别人脸或地点、不使用账号、分析埋点、支付、订单或网络 AI。真实 NFC 和云端 AI 属于后续 Development Build 阶段，具体边界见 [docs](./docs)。

## 演示路径

1. 首页点击“创建纪念册”。
2. 选择至少一张照片，填写标题、城市和日期。
3. 生成并编辑旅行册草稿，然后保存。
4. 在“城市”查看解锁状态与模拟碰一碰。

