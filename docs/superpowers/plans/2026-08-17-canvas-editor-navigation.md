# 相册编辑导航实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持相册阅读和编辑的页面游标，并消除重复保存后的导航栈叠加。

**Architecture:** 由 `PageReader` 上报游标，详情页把游标透传给编辑器，`BookCanvasEditor` 按游标初始化；保存以 `dismissTo` 回收编辑路由。

**Tech Stack:** Expo Router、React Native、TypeScript、Jest。

---

### Task 1: 锁定游标和导航回收行为

**Files:**
- Modify: `__tests__/memory-detail-canvas.test.tsx`
- Modify: `__tests__/memory-canvas-editor.test.tsx`
- Modify: `__tests__/book-canvas-editor.test.tsx`

- [ ] **Step 1: 写失败测试**

断言详情页从当前阅读页传递 `pageId` 和 `pageIndex`；断言编辑器使用该游标初始化；断言保存调用 `dismissTo`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx.cmd jest --runInBand --runTestsByPath __tests__/memory-detail-canvas.test.tsx __tests__/memory-canvas-editor.test.tsx __tests__/book-canvas-editor.test.tsx`

Expected: FAIL，因为当前编辑入口只传递相册 ID、编辑器总从第一页开始，保存调用 `replace`。

### Task 2: 最小实现

**Files:**
- Modify: `src/features/canvas/page-reader.tsx`
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Modify: `src/app/memory/[id].tsx`
- Modify: `src/app/memory/[id]/edit.tsx`

- [ ] **Step 1: 实现游标透传和安全回退**

增加可选游标回调与初始化参数，优先按 `pageId` 找到页面，找不到时以合法索引回退，最后回退第一页。

- [ ] **Step 2: 回收编辑路由**

将正式保存后的导航替换为 `router.dismissTo`，目标为带最新游标的相册详情页。

- [ ] **Step 3: 运行聚焦测试确认通过**

Run: `npx.cmd jest --runInBand --runTestsByPath __tests__/memory-detail-canvas.test.tsx __tests__/memory-canvas-editor.test.tsx __tests__/book-canvas-editor.test.tsx`

Expected: PASS。

### Task 3: 最终验证

- [ ] Run: `npm.cmd run lint`
- [ ] Run: `npm.cmd run typecheck`
- [ ] Run: `npm.cmd run test:ci`
- [ ] Run: `npm.cmd run build:server`
