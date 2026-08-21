# 相册详情操作重排实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去除相册详情页重复的编辑、分享和标题栏删除入口，把页面预览与礼品绑定放到阅读器下方，并在只读页面预览底部提供经过二次确认的整册删除。

**Architecture:** `PageManagerSheet` 的 preview 类型分支获得可选 `onDeleteAlbum`，只负责呈现底部危险操作并转发点击。`MemoryDetailScreen` 继续拥有原生确认、仓储写入和导航，并重排已有入口，不把业务依赖放入画布组件。

**Tech Stack:** Expo Router、React Native、React Native Alert、Jest、Testing Library React Native、TypeScript。

---

### Task 1: 只读预览底部整册删除操作

**Files:**
- Modify: `__tests__/page-manager-sheet.test.tsx`
- Modify: `src/features/canvas/page-manager-sheet.tsx`

- [ ] **Step 1: 写失败测试**

新增 preview 测试，传入 `onDeleteAlbum={jest.fn()}`，断言“删除这册旅行记忆”存在，点击只调用该回调且不调用 `onChange`；另断言 preview 未传回调和默认 manage 模式均不显示整册删除。

- [ ] **Step 2: 确认 RED**

```powershell
npm test -- --runInBand --watch=false __tests__/page-manager-sheet.test.tsx
```

预期：TypeScript/运行时因 `onDeleteAlbum` 尚不存在而失败。

- [ ] **Step 3: 最小实现**

把 preview 类型分支扩展为：

```ts
{
  mode: "preview";
  onChange?: (pages: StoryPage[]) => void;
  onDeleteAlbum?: () => void;
  onJumpToPage: (index: number) => void;
}
```

仅在 preview 且回调存在时，在网格滚动区之后渲染带底部安全区的危险操作栏和“删除这册旅行记忆”按钮。点击只调用 `onDeleteAlbum`；manage 分支类型和工具栏保持不变。

- [ ] **Step 4: 验证 GREEN 与管理回归**

```powershell
npm test -- --runInBand --watch=false __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx
```

预期：新增测试及现有页面管理测试全部通过。

- [ ] **Step 5: 本地提交**

```powershell
git add __tests__/page-manager-sheet.test.tsx src/features/canvas/page-manager-sheet.tsx
git commit -m "feat: add album deletion to page preview"
```

### Task 2: 详情页入口重排与删除确认

**Files:**
- Modify: `__tests__/memory-detail-canvas.test.tsx`
- Modify: `src/app/memory/[id].tsx`

- [ ] **Step 1: 写布局失败测试**

普通相册断言标题栏仍有“分享这册旅行记忆”“编辑旅行册”，但没有标题栏“删除这册旅行记忆”；详情内容没有“编辑相册”和“分享相册”文字按钮；`reader-page` 在组件树中位于“页面预览”和“绑定到礼品”之前。示例相册断言只有“页面预览”和“用自己的照片创建”，没有礼品或删除。

- [ ] **Step 2: 写删除确认失败测试**

spy `Alert.alert` 并捕获按钮：打开页面预览、点击底部删除，断言指定标题与说明；调用“取消”后 `discardMemory`、`router.replace` 均未调用且预览仍存在；重新触发并调用 destructive “删除”，等待 `discardMemory("memory-canvas")` 完成后断言 `router.replace("/")`。

- [ ] **Step 3: 确认 RED**

```powershell
npm test -- --runInBand --watch=false __tests__/memory-detail-canvas.test.tsx
```

预期：旧重复按钮、标题栏垃圾桶和缺失的预览删除入口导致断言失败。

- [ ] **Step 4: 最小实现**

- 从 `headerRight` 删除 trash `IconButton`，保留分享与编辑。
- 删除阅读器之前的 `localActions`。
- 在 `PageReader` 之后为普通相册渲染“页面预览”“绑定到礼品”，为 sample 渲染“页面预览”“用自己的照片创建”。
- 普通相册的 `PageManagerSheet` 传 `onDeleteAlbum={confirmDelete}`；sample 不传。
- 保持 `confirmDelete` 的原生 Alert、取消无副作用、确认后 `discardMemory` 与首页导航。

- [ ] **Step 5: 验证 GREEN 与导航回归**

```powershell
npm test -- --runInBand --watch=false __tests__/memory-detail-canvas.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/page-reader-buffer.test.tsx
```

预期：布局、删除确认、选页恢复和相册隔离测试全部通过。

- [ ] **Step 6: 本地提交**

```powershell
git add __tests__/memory-detail-canvas.test.tsx src/app/memory/[id].tsx
git commit -m "feat: reorganize memory detail actions"
```

### Task 3: 完整门禁与复核

**Files:**
- Verify only

- [ ] **Step 1: 运行完整检查**

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
git diff --check
```

预期：命令全部退出 0；169 个 Jest suites 和 Node 文档测试无失败；服务端构建导出 35 个 API 路由。

- [ ] **Step 2: 独立复核**

规格复核确认入口位置、sample 权限和二次确认完整；质量复核检查 Alert 按钮测试、异步删除失败行为、预览安全区、manage 模式回归以及无障碍。

- [ ] **Step 3: 修复阻塞意见并重新验证**

Critical/Important 必须修复并复审；任何生产代码变化后重新运行 lint、typecheck、test:ci 和 build:server。

- [ ] **Step 4: 确认本地分支状态**

```powershell
git status --short
git log -8 --oneline
```

预期：工作树干净，所有提交仅位于 `codex/canvas-preview-save-consistency`；不 push、不创建 PR。

