# 中国地图深度缩放与全产品城市打卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全屏中国地图扩展到 6× 缩放与带边缘留白的平移范围，并让全部 36 个产品城市直接复用现有打卡相册流程。

**Architecture:** `city-workspace.ts` 作为缩放和平移边界的唯一纯函数来源，`city-map.tsx` 的捏合、双击和惯性全部复用这些常量与函数。全屏路由不再按插画白名单分流，所有注册城市统一打开已有 `CityCheckinModal`；弹窗现有的本地中国地图作为无专属插画城市的默认视觉。

**Tech Stack:** Expo Router、React Native、React Native Gesture Handler、Reanimated、Jest、Testing Library React Native。

---

### Task 1: 6× 缩放与视口级平移留白

**Files:**
- Modify: `src/features/cities/city-workspace.ts`
- Modify: `src/features/cities/city-map.tsx`
- Modify: `src/features/cities/index.ts`
- Test: `__tests__/city-workspace.test.ts`
- Test: `__tests__/city-map-interactions.test.tsx`

- [ ] **Step 1: 写边界函数失败测试**

在 `__tests__/city-workspace.test.ts` 中导入 `workspaceMaxScale` 和 `workspacePanOverscanRatio`，断言：

```ts
expect(clampWorkspaceViewport({ scale: 9, translateX: 0, translateY: 0 }, size).scale)
  .toBe(workspaceMaxScale);
expect(workspaceMaxScale).toBe(6);
expect(workspacePanOverscanRatio).toBeGreaterThanOrEqual(0.5);
expect(getWorkspaceTranslationLimits(1, size)).toEqual({
  x: size.width * workspacePanOverscanRatio,
  y: size.height * workspacePanOverscanRatio,
});
```

再用 `OfflineChinaMapAdapter` 中最靠近地图边缘的产品城市坐标，证明在 6× 和最大平移量下，其屏幕投影可以进入视口中央区域。

- [ ] **Step 2: 运行边界测试并确认红灯**

Run: `npx jest __tests__/city-workspace.test.ts --runInBand`

Expected: FAIL，因为 `workspaceMaxScale` / `workspacePanOverscanRatio` 尚未导出且当前最大缩放仍为 3.5。

- [ ] **Step 3: 实现统一缩放和留白常量**

在 `src/features/cities/city-workspace.ts` 中加入并导出：

```ts
export const workspaceMinScale = 1;
export const workspaceMaxScale = 6;
export const workspacePanOverscanRatio = 0.5;
```

`getWorkspaceTranslationLimits` 先按 1–6 限制缩放，再把每个轴对应的半个视口加入边界：

```ts
return {
  x: Math.max(0, (contentWidth * boundedScale - size.width) / 2) + size.width * workspacePanOverscanRatio,
  y: Math.max(0, (contentHeight * boundedScale - size.height) / 2) + size.height * workspacePanOverscanRatio,
};
```

`clampWorkspaceViewport` 复用 `workspaceMinScale` 与 `workspaceMaxScale`，并从 `src/features/cities/index.ts` 导出新常量。

- [ ] **Step 4: 运行纯函数测试并确认绿灯**

Run: `npx jest __tests__/city-workspace.test.ts --runInBand`

Expected: PASS。

- [ ] **Step 5: 写手势缩放层级失败测试**

在 `__tests__/city-map-interactions.test.tsx` 中把捏合上限断言改为 6，并新增连续双击断言：

```ts
expect(scalesAfterDoubleTaps).toEqual([2, 4, 6, 1]);
```

同时断言双击和捏合仍不在逐帧 `onUpdate` 中调用 `runOnJS`。

- [ ] **Step 6: 运行手势测试并确认红灯**

Run: `npx jest __tests__/city-map-interactions.test.tsx --runInBand`

Expected: FAIL，当前捏合封顶 3.5，双击仅在 2.4 附近切回 1。

- [ ] **Step 7: 实现 1×→2×→4×→6×→1× 双击循环**

在 `src/features/cities/city-map.tsx` 中导入 `workspaceMaxScale`，捏合继续通过 `clampWorkspaceViewport` 限制。新增纯 worklet 层级解析：

```ts
const nextDoubleTapScale = (currentScale: number) => {
  "worklet";
  if (currentScale < 2) return 2;
  if (currentScale < 4) return 4;
  if (currentScale < workspaceMaxScale) return workspaceMaxScale;
  return 1;
};
```

双击继续围绕点击焦点计算平移，并由 `clampWorkspaceViewport` 约束。

- [ ] **Step 8: 运行地图交互聚焦测试**

Run: `npx jest __tests__/city-workspace.test.ts __tests__/city-map-interactions.test.tsx __tests__/city-map.test.tsx --runInBand`

Expected: PASS，圆点和 44pt 点击区既有断言保持通过。

- [ ] **Step 9: 提交缩放与边界改动**

```bash
git add src/features/cities/city-workspace.ts src/features/cities/city-map.tsx src/features/cities/index.ts __tests__/city-workspace.test.ts __tests__/city-map-interactions.test.tsx
git commit -m "feat: expand China map zoom and pan bounds"
```

### Task 2: 全部 36 个产品城市统一打开打卡相册

**Files:**
- Modify: `src/app/city-map/index.tsx`
- Test: `__tests__/city-map-fullscreen-layout.test.tsx`
- Test: `__tests__/city-map.test.tsx`

- [ ] **Step 1: 写全部注册城市打卡入口失败测试**

在 `__tests__/city-map-fullscreen-layout.test.tsx` 中 mock `CityCheckinModal` 为带 `testID="city-checkin-modal-${city}"` 的节点，遍历 `cityRegistry` 并触发每个产品城市的 `CityMap.onCityPress`：

```ts
for (const { id } of cityRegistry) {
  fireEvent(screen.getByTestId("fullscreen-city-map-city-map"), "cityPress", id);
  expect(screen.getByTestId(`city-checkin-modal-${id}`)).toBeTruthy();
}
```

为全屏路由中的 `CityMap` 增加稳定 testID 或通过 mock 捕获 `onCityPress`；断言未知地级标签不会进入该回调。

- [ ] **Step 2: 运行路由测试并确认红灯**

Run: `npx jest __tests__/city-map-fullscreen-layout.test.tsx --runInBand`

Expected: FAIL，因为当前只有 `checkinCities` 白名单打开弹窗，其余城市跳转详情。

- [ ] **Step 3: 移除打卡图片白名单分流**

在 `src/app/city-map/index.tsx` 删除 `checkinCities` 导入，将处理器收敛为：

```ts
const handleCityPress = React.useCallback((city: City) => {
  setCheckinCity(city);
}, []);
```

保持 `CityCheckinModal`、`useMemories`、相册保存和关闭逻辑不变。无专属打卡点的城市继续显示弹窗已有的本地中国地图、城市标题、口号与 `0 / 0 处足迹`，作为默认本地视觉。

- [ ] **Step 4: 验证产品城市和背景标签行为**

Run: `npx jest __tests__/city-map-fullscreen-layout.test.tsx __tests__/city-map.test.tsx --runInBand`

Expected: PASS；36 城均可触发弹窗，地级背景标签仍 `pointerEvents="none"`、`accessible={false}`。

- [ ] **Step 5: 提交全城市打卡改动**

```bash
git add src/app/city-map/index.tsx __tests__/city-map-fullscreen-layout.test.tsx __tests__/city-map.test.tsx
git commit -m "feat: open check-in flow for every product city"
```

### Task 3: 完整回归与交付

**Files:**
- Verify: `docs/DECISIONS.md`
- Verify: `docs/superpowers/specs/2026-08-20-china-map-deep-zoom-checkin-design.md`

- [ ] **Step 1: 运行全部地图聚焦测试**

Run: `npx jest __tests__/city-workspace.test.ts __tests__/city-map-interactions.test.tsx __tests__/city-map.test.tsx __tests__/city-map-fullscreen-layout.test.tsx --runInBand`

Expected: PASS。

- [ ] **Step 2: 运行仓库门禁**

Run: `npm run lint`

Expected: exit 0。

Run: `npm run typecheck`

Expected: exit 0。

Run: `npm run test:ci`

Expected: 0 failed suites/tests。

Run: `npm run build:server`

Expected: exit 0 并导出 `dist`。

- [ ] **Step 3: 检查变更整洁度**

Run: `git diff --check`

Expected: exit 0，无空白错误。

- [ ] **Step 4: 在 iPhone 竖屏原生预览中手工验收**

确认 6× 缩放、四级双击循环、地图边缘留白、边缘城市可拖入中央、所有产品城市可打开打卡弹窗、关闭按钮不越界。若 Expo Web 仍被仓库既有 `expo-sqlite` WASM 问题阻塞，记录该限制且不把 Web 错误误归因于本次地图改动。
