# 半本书式旅行册草稿编辑器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Follow strict red-green-refactor TDD.

**Goal:** 让草稿确认页成为可自动保存的半本书式 3:4 旅行册编辑器，并让已保存旅行册复用同一受控编辑器。

**Architecture:** 保留现有 StoryPage/Canvas JSON 与 SQLite schema；新增矩形画布计算、轻量翻页判定、共享 `BookCanvasEditor` 和独立串行自动保存控制器。草稿写入不刷新 saved memory 列表，已保存旅行册继续显式保存。

**Tech Stack:** Expo Router、React Native、Gesture Handler、Reanimated、Expo SQLite、TypeScript、Jest、React Native Testing Library 13.3.3。

---

### Task 1：恢复测试基线

**Files:**
- Modify: 使用 `renderAsync` / `fireEventAsync` 的现有测试

- [x] 把 Testing Library v14 API 改为 13.3.3 支持的 `render`、`fireEvent`、`act`。
- [x] 运行相关测试、typecheck 和全量测试，确认现有基线恢复。

### Task 2：矩形画布、翻页规则与贴纸分类

**Files:**
- Modify: `src/features/canvas/canvas-element.tsx`
- Modify: `src/features/canvas/canvas-page.tsx`
- Modify: `src/features/canvas/canvas-assets.ts`
- Create: `src/features/canvas/page-turn.ts`
- Test: canvas/page-turn/sticker focused tests

- [x] 先写失败测试，覆盖 22% 位移、650px/s 速度、回弹、首尾边界和 3:4 坐标计算。
- [x] 实现独立宽高计算和可测试的翻页判定。
- [x] 先写失败测试，再补齐“全部、情感、旅行、日常、自然”分类。

### Task 3：共享 BookCanvasEditor 与页面管理

**Files:**
- Create: `src/features/canvas/book-canvas-editor.tsx`
- Create/Modify: canvas toolbar and page management components
- Modify: `src/app/memory/[id]/edit.tsx`
- Test: shared editor interaction tests

- [x] 先写双击选择、单次拖动不选择、完成/翻页取消选择测试。
- [x] 先写元素手势隔离、空白翻页、新元素自动选择测试。
- [x] 先写页面添加、删除、排序和最后一页保护测试。
- [x] 实现受控共享编辑器、3:4 半本书视觉、页码指示、分类贴纸和上下文工具。
- [x] 已保存旅行册编辑页改为复用共享编辑器，并保持显式保存语义。

### Task 4：草稿串行自动保存

**Files:**
- Create: `src/features/memories/autosave-queue.ts`
- Modify: `src/features/memories/memories-provider.tsx`
- Test: autosave queue/provider tests

- [x] 先写失败测试，覆盖串行顺序、写入中合并最新快照、失败保留、重试和等待清空。
- [x] 实现无并发写入的最新快照队列与 saving/saved/error 状态。
- [x] Provider 增加不刷新 saved memory 列表的草稿页面写入方法。

### Task 5：草稿确认页集成

**Files:**
- Modify: `src/app/memory/review/[id].tsx`
- Test: `__tests__/draft-review-screen.test.tsx`

- [x] 先写确认页直接编辑、400ms 文字 debounce、最终确认等待及失败阻止测试。
- [x] 替换摘要卡片与铅笔入口，接入共享编辑器和自动保存状态。
- [x] 让重新生成、丢弃与保存生命周期串行协调。

### Task 6：验收

- [x] 运行 `npm.cmd run lint`。
- [x] 运行 `npm.cmd run typecheck`。
- [x] 运行 `npm.cmd run test:ci`。
- [x] 运行 `git diff --check` 并确认没有改写既有图片素材；工具链改动仍保持为实施前的独立工作区改动。
- [ ] 在 Expo Go 真机验证翻页、双击、拖动、键盘编辑和退出重进后的自动保存。
