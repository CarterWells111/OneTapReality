# 相册详情页只读页面预览实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在相册详情页提供与页面管理视觉一致、只能查看和跳转页面的只读总览。

**Architecture:** 为现有 `PageManagerSheet` 增加默认保持兼容的 `manage | preview` 模式，在预览模式的交互边界完全移除选择、拖动和写操作。详情页持有弹窗开关与目标页面游标，选中缩略图后通过 `PageReader` 现有恢复参数跳到对应页。

**Tech Stack:** Expo Router、React Native、React Native Gesture Handler、Reanimated、Jest、Testing Library React Native、TypeScript。

---

### Task 1: PageManagerSheet 只读预览模式

**Files:**
- Modify: `__tests__/page-manager-sheet.test.tsx`
- Modify: `src/features/canvas/page-manager-sheet.tsx`

- [ ] **Step 1: 写失败测试**

在 `__tests__/page-manager-sheet.test.tsx` 新增用例，以 `mode="preview"` 渲染两页，断言：

```tsx
const onChange = jest.fn();
const onClose = jest.fn();
const onJumpToPage = jest.fn();
const screen = render(
  <PageManagerSheet
    mode="preview"
    onChange={onChange}
    onClose={onClose}
    onJumpToPage={onJumpToPage}
    pages={pages}
  />,
);

expect(screen.getByText("页面预览 · 2 页")).toBeTruthy();
expect(screen.queryByLabelText("添加页面")).toBeNull();
expect(screen.queryByText("点选页面开始多选")).toBeNull();
fireEvent.press(screen.getByLabelText("打开第 2 页"));
expect(onJumpToPage).toHaveBeenCalledWith(1);
expect(onClose).toHaveBeenCalledTimes(1);
expect(onChange).not.toHaveBeenCalled();
```

- [ ] **Step 2: 运行测试并确认正确失败**

运行：

```powershell
npm test -- --runInBand --watch=false __tests__/page-manager-sheet.test.tsx
```

预期：因 `mode` 属性和“页面预览”只读行为尚未实现而失败。

- [ ] **Step 3: 实现最小只读模式**

在 `PageManagerSheetProps` 增加：

```ts
mode?: "manage" | "preview";
onChange?: (pages: StoryPage[]) => void;
```

默认 `mode="manage"`。预览模式使用“页面预览”标题、“点击页面即可打开”的说明和“关闭页面预览”按钮；页面缩略图直接调用 `onJumpToPage(index)` 后关闭。仅管理模式创建拖动手势、切换选择状态并显示底部管理工具栏。所有 `onChange` 调用都限制在管理模式且回调存在时。

- [ ] **Step 4: 运行组件测试**

运行：

```powershell
npm test -- --runInBand --watch=false __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx
```

预期：新增预览测试及既有管理测试全部通过。

- [ ] **Step 5: 提交任务 1**

```powershell
git add __tests__/page-manager-sheet.test.tsx src/features/canvas/page-manager-sheet.tsx
git commit -m "feat: add read-only page preview mode"
```

### Task 2: 相册详情页入口与选页跳转

**Files:**
- Modify: `__tests__/memory-detail-canvas.test.tsx`
- Modify: `src/app/memory/[id].tsx`

- [ ] **Step 1: 写失败测试**

为详情页准备两页相册，点击“页面预览”，断言弹窗出现且没有管理控件；点击“打开第 2 页”后断言弹窗关闭，并验证 `PageReader` 最后一次接收：

```ts
expect.objectContaining({ initialPageId: "page-2", fallbackIndex: 1 })
```

另用示例相册路由断言“页面预览”入口存在，确保只读入口不受编辑权限限制。

- [ ] **Step 2: 运行测试并确认正确失败**

运行：

```powershell
npm test -- --runInBand --watch=false __tests__/memory-detail-canvas.test.tsx
```

预期：因详情页尚无“页面预览”入口而失败。

- [ ] **Step 3: 接入详情页**

在 `MemoryDetailScreen` 中：

```tsx
const [isPagePreviewOpen, setIsPagePreviewOpen] = React.useState(false);
const [previewCursor, setPreviewCursor] = React.useState<{ pageId: string; index: number } | null>(null);
```

为普通相册的本地操作区和示例相册阅读区提供“页面预览”按钮。打开时渲染：

```tsx
<PageManagerSheet
  mode="preview"
  onClose={() => setIsPagePreviewOpen(false)}
  onJumpToPage={(index) => {
    const target = memory.pages[index];
    if (target) setPreviewCursor({ pageId: target.id, index });
  }}
  pages={memory.pages}
/>
```

`PageReader` 优先使用 `previewCursor`，否则使用路由参数。切换到另一相册 ID 时清除预览游标，避免跨相册复用。

- [ ] **Step 4: 运行详情与阅读器测试**

运行：

```powershell
npm test -- --runInBand --watch=false __tests__/memory-detail-canvas.test.tsx __tests__/page-reader-buffer.test.tsx
```

预期：详情页预览、选页跳转及阅读器恢复测试全部通过。

- [ ] **Step 5: 提交任务 2**

```powershell
git add __tests__/memory-detail-canvas.test.tsx src/app/memory/[id].tsx
git commit -m "feat: preview album pages before editing"
```

### Task 3: 完整验证与复核

**Files:**
- Verify only

- [ ] **Step 1: 运行格式、类型、全量测试和生产服务端构建**

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
git diff --check
```

预期：所有命令退出码为 0；全量测试无失败；构建导出 35 个既有 API 路由。

- [ ] **Step 2: 代码复核**

复核只读模式是否存在任何 `onChange`、多选或拖动入口，详情页跳转是否按 `pageId` 优先并按相册身份隔离，以及管理模式是否保持默认兼容。

- [ ] **Step 3: 处理复核意见并重新验证受影响检查**

Critical 和 Important 必须修复；测试变更需重新运行相关测试，生产代码变更需重新运行 lint、typecheck、test:ci 和 build:server。

- [ ] **Step 4: 确认工作树与提交历史**

```powershell
git status --short
git log -5 --oneline
```

预期：工作树干净；实现只存在于 `codex/canvas-preview-save-consistency` 本地分支，不 push、不创建 PR。

