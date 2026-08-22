# Saved Memory Metadata Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a saved travel album’s name and travel date to be edited above the canvas and persisted atomically with the prepared page snapshot by either existing formal-save button.

**Architecture:** Add a small shared local-date utility, then keep identity-tagged metadata draft state inside `EditMemoryScreen`. The editor captures one immutable `Memory` snapshot containing edited metadata plus `prepareSave()` pages and passes it through the existing account-scoped `updatePages` transaction; recovery drafts remain page-only.

**Tech Stack:** Expo Router, React Native, TypeScript, `@react-native-community/datetimepicker`, Jest, React Native Testing Library, Expo SQLite.

---

### Task 1: Share local travel-date conversion

**Files:**
- Create: `src/features/memories/travel-date.ts`
- Create: `__tests__/travel-date.test.ts`
- Modify: `src/app/memory/new.tsx`
- Modify: `src/app/memory/review/[id].tsx`

- [ ] **Step 1: Write the failing utility tests**

Create `__tests__/travel-date.test.ts`:

```ts
import {
  MIN_TRAVEL_DATE,
  parseIsoTravelDate,
  toIsoTravelDate,
} from "../src/features/memories/travel-date";

describe("travel date conversion", () => {
  it("parses an ISO date as the same local calendar day at midnight", () => {
    expect(parseIsoTravelDate("2026-07-20").getTime()).toBe(
      new Date(2026, 6, 20).getTime(),
    );
  });

  it("formats a local calendar day without a UTC conversion", () => {
    expect(toIsoTravelDate(new Date(2026, 7, 21, 23, 30))).toBe("2026-08-21");
  });

  it("exposes the product minimum date", () => {
    expect(MIN_TRAVEL_DATE.getTime()).toBe(new Date(2000, 0, 1).getTime());
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npx jest --runInBand __tests__/travel-date.test.ts
```

Expected: FAIL because `src/features/memories/travel-date.ts` does not exist.

- [ ] **Step 3: Implement the shared utility**

Create `src/features/memories/travel-date.ts`:

```ts
export const MIN_TRAVEL_DATE = new Date(2000, 0, 1);

export function toIsoTravelDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoTravelDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
```

Replace the local `MIN_TRAVEL_DATE`, `toIsoDate`, and `parseIsoDate` definitions in `src/app/memory/new.tsx` and `src/app/memory/review/[id].tsx` with imports from the new module. Update call sites to `toIsoTravelDate` and `parseIsoTravelDate`; do not change picker behavior.

- [ ] **Step 4: Verify GREEN and existing draft-date behavior**

Run:

```powershell
npx jest --runInBand __tests__/travel-date.test.ts __tests__/draft-review-screen.test.tsx __tests__/new-memory-city-selector.test.tsx
```

Expected: all selected suites PASS with no new warnings.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- 'src/features/memories/travel-date.ts' 'src/app/memory/new.tsx' 'src/app/memory/review/[id].tsx' '__tests__/travel-date.test.ts'
git commit -m "refactor: share local travel date conversion"
```

### Task 2: Add saved-album metadata controls above the canvas

**Files:**
- Modify: `src/app/memory/[id]/edit.tsx`
- Modify: `__tests__/memory-canvas-editor.test.tsx`

- [ ] **Step 1: Add the DateTimePicker mock and failing display/edit tests**

In `__tests__/memory-canvas-editor.test.tsx`, add a deterministic picker mock:

```tsx
jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return function MockDateTimePicker({ onChange }: {
    onChange: (event: { type: string }, date: Date) => void;
  }) {
    return React.createElement(
      Pressable,
      {
        accessibilityLabel: "测试已保存旅行日期选择器",
        onPress: () => onChange({ type: "set" }, new Date(2026, 7, 21)),
      },
      React.createElement(Text, null, "测试已保存旅行日期选择器"),
    );
  };
});
```

Add tests that assert the read-only state, double press, local edits, and no premature persistence:

```tsx
it("shows saved metadata and enters title editing only after a double press", async () => {
  const screen = render(<EditMemoryScreen />);
  await screen.findByTestId("album-canvas");

  expect(screen.getByLabelText("双击修改旅行册名称")).toHaveTextContent("杭州周末");
  expect(screen.getByText("杭州 · 2026-07-22")).toBeTruthy();
  expect(screen.queryByLabelText("纪念册标题")).toBeNull();

  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  expect(screen.queryByLabelText("纪念册标题")).toBeNull();
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));

  fireEvent.changeText(screen.getByLabelText("纪念册标题"), "西湖的夏天");
  fireEvent.press(screen.getByLabelText("选择旅行日期"));
  fireEvent.press(screen.getByLabelText("测试已保存旅行日期选择器"));

  expect(screen.getByDisplayValue("西湖的夏天")).toBeTruthy();
  expect(mockUpdatePages).not.toHaveBeenCalled();
});
```

Also fire `accessibilityAction` with `{ actionName: "activate" }` and assert it enters title editing without two physical press events.

Add the session-boundary and explicit-save tests before implementation as part of the same RED cycle:

```tsx
it("resets edited metadata when the account and album identity change", async () => {
  const memoryB: Memory = {
    ...memory,
    id: "memory-2",
    title: "上海秋日",
    city: "shanghai",
    travelDate: "2026-08-02",
    pages: legacyPages.map((page, index) => ({
      ...page,
      id: index === 0 ? "cover-2" : "closing-2",
    })),
  };
  let providerMemory = memory;
  mockGetMemoryById.mockImplementation(() => providerMemory);
  const screen = render(<EditMemoryScreen />);
  await screen.findByTestId("album-canvas");
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.changeText(screen.getByLabelText("纪念册标题"), "旧账号未保存名称");

  mockAccountEmail = "other@example.com";
  mockRouteId = "memory-2";
  providerMemory = memoryB;
  screen.rerender(<EditMemoryScreen />);

  expect(await screen.findByText("上海秋日")).toBeTruthy();
  expect(screen.queryByText("旧账号未保存名称")).toBeNull();
  expect(screen.getByText("上海 · 2026-08-02")).toBeTruthy();
});

it("does not formally persist metadata when leaving without saving", async () => {
  const screen = render(<EditMemoryScreen />);
  await screen.findByTestId("album-canvas");
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.changeText(screen.getByLabelText("纪念册标题"), "未保存名称");

  screen.unmount();

  expect(mockUpdatePages).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the editor tests and verify RED**

Run:

```powershell
npx jest --runInBand __tests__/memory-canvas-editor.test.tsx -t "saved metadata|title editing|edited metadata when the account|leaving without saving"
```

Expected: FAIL because the metadata header, input, picker, and accessibility action do not exist.

- [ ] **Step 3: Implement identity-tagged metadata state and controls**

In `src/app/memory/[id]/edit.tsx`:

- import `DateTimePicker`, `DateTimePickerEvent`, `Platform`, `TextInput`, `cityContent`, and the Task 1 travel-date helpers;
- define `type MetadataDraft = { identity: string; title: string; travelDate: string }`;
- keep `metadataDraft` state plus `metadataDraftRef`, `isTitleEditing`, `showDatePicker`, and `lastTitlePressAtRef`;
- when `loadIdentity` changes, reset both state and ref from the new `memory`, close the input and picker, and clear the last-press timestamp;
- treat two presses within 350ms as the physical double press, while an accessibility `activate` action enters editing directly;
- update only the local metadata ref/state when text or date changes.

The read-only title control should use:

```tsx
<Pressable
  accessibilityActions={[{ name: "activate", label: "修改旅行册名称" }]}
  accessibilityHint="连续点击两次进入编辑"
  accessibilityLabel="双击修改旅行册名称"
  accessibilityRole="button"
  disabled={isSaving || isFormalSaveCompleted}
  onAccessibilityAction={(event) => {
    if (event.nativeEvent.actionName === "activate") beginTitleEditing();
  }}
  onPress={handleTitlePress}
>
  <Text selectable style={styles.metadataTitle}>{activeMetadata.title}</Text>
</Pressable>
```

The edit state should use an auto-focused `TextInput` with `accessibilityLabel="纪念册标题"`, and `onBlur`/`onSubmitEditing` should only close the input. Render the date as a separate `Pressable` with `accessibilityLabel="选择旅行日期"`; the iOS picker uses the existing bottom-sheet pattern and Task 1 conversion helpers.

Place the metadata card before the existing instruction text and `BookCanvasEditor`. Disable title and date controls while a formal save is active.

- [ ] **Step 4: Run the editor suite and verify GREEN**

Run:

```powershell
npx jest --runInBand __tests__/memory-canvas-editor.test.tsx
```

Expected: the full editor suite PASS; existing page editing and recovery behavior remains unchanged.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- 'src/app/memory/[id]/edit.tsx' '__tests__/memory-canvas-editor.test.tsx'
git commit -m "feat: edit saved album trip details"
```

### Task 3: Save metadata and prepared pages as one formal snapshot

**Files:**
- Modify: `src/app/memory/[id]/edit.tsx`
- Modify: `__tests__/memory-canvas-editor.test.tsx`
- Verify: `src/features/memories/memories-provider.tsx`
- Verify: `src/storage/memory-repository.ts`

- [ ] **Step 1: Write failing formal-save and validation tests**

Add focused tests to `__tests__/memory-canvas-editor.test.tsx`:

```tsx
it("formally saves edited metadata with the prepared page snapshot in place", async () => {
  mockPreparedPages = legacyPages.map((page, index) =>
    index === 0 ? { ...page, headline: "准备后的页面" } : page,
  );
  const screen = render(<EditMemoryScreen />);
  await screen.findByTestId("album-canvas");
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.press(screen.getByLabelText("双击修改旅行册名称"));
  fireEvent.changeText(screen.getByLabelText("纪念册标题"), "西湖的夏天");
  fireEvent.press(screen.getByLabelText("选择旅行日期"));
  fireEvent.press(screen.getByLabelText("测试已保存旅行日期选择器"));

  await act(async () => fireEvent.press(screen.getByText("保存当前修改")));

  expect(mockUpdatePages).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "memory-1",
      title: "西湖的夏天",
      travelDate: "2026-08-21",
      pages: expect.arrayContaining([
        expect.objectContaining({ id: "cover-1", headline: "准备后的页面" }),
      ]),
    }),
    expect.arrayContaining([
      expect.objectContaining({ id: "cover-1", headline: "准备后的页面" }),
    ]),
  );
  expect(mockReplace).not.toHaveBeenCalled();
});
```

Add an equivalent “保存并退出画布” test that asserts the same metadata snapshot and the existing `dismissTo` cursor navigation. Add a table-driven blank-title test for both save labels; it must expect “请输入纪念册标题”, zero `mockUpdatePages` calls, zero recovery clears, and zero navigation calls. Add a failed-save/retry test proving the edited values remain visible and are passed again on retry.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx jest --runInBand __tests__/memory-canvas-editor.test.tsx -t "edited metadata|blank album title|metadata after a failed"
```

Expected: FAIL because formal save still passes the original `sessionMemory` to `updatePages` and does not validate the edited title.

- [ ] **Step 3: Capture and persist one immutable formal snapshot**

At the start of `save`, capture the active metadata for the same identity:

```ts
const sessionMetadata = metadataDraftRef.current;
if (sessionMetadata.identity !== loadIdentity) return;
if (!sessionMetadata.title.trim()) {
  setSaveError("请输入纪念册标题");
  return;
}
```

After `prepareSave()` returns and `latestPages` is normalized, create the formal snapshot before any awaited persistence:

```ts
const formalSnapshot: Memory = {
  ...sessionMemory,
  title: sessionMetadata.title,
  travelDate: sessionMetadata.travelDate,
  pages: latestPages,
};
await updatePagesForSession(formalSnapshot, latestPages);
```

Do not add metadata to the page-only recovery queue. Preserve the existing generation/loadKey checks, diagnostic payload restrictions, recovery wait/clear order, cursor restoration, save coalescing, and navigation behavior. On an in-place save, retain the saved metadata draft as the current editing baseline; on failure, do not reset it.

- [ ] **Step 4: Verify provider and repository transaction coverage**

Confirm `updatePages` spreads the supplied `Memory` into the persisted snapshot and `replaceMemoryMediaSnapshot` updates `title` and `travelDate` under `WHERE id = ? AND ownerAccountKey = ?`. Run:

```powershell
npx jest --runInBand __tests__/memory-canvas-editor.test.tsx __tests__/memories-provider-draft-pages.test.tsx __tests__/memory-repository.test.ts
```

Expected: all selected suites PASS, including the existing atomic metadata persistence, rollback, and wrong-account tests.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- 'src/app/memory/[id]/edit.tsx' '__tests__/memory-canvas-editor.test.tsx'
git commit -m "fix: save album metadata with canvas pages"
```

### Task 4: Run release gates and request final review

**Files:**
- Verify only; modify only to fix a demonstrated failure.

- [ ] **Step 1: Run formatting and static gates**

```powershell
git diff --check
npm run lint
npm run typecheck
```

Expected: all commands exit 0; CRLF conversion notices are acceptable, whitespace errors are not.

- [ ] **Step 2: Run the complete automated suite**

```powershell
npm run test:ci
```

Expected: all Jest and Node test suites PASS with no unhandled rejection or open-handle failure.

- [ ] **Step 3: Run the production route build**

```powershell
npm run build:server
```

Expected: Expo export exits 0 and all configured API routes build.

- [ ] **Step 4: Request a read-only code review**

Ask the reviewer to compare the implementation with `docs/superpowers/specs/2026-08-21-saved-memory-metadata-editing-design.md`, focusing on immutable snapshot capture, explicit-save boundaries, title validation, local-date correctness, recovery ordering, save retry, and account/album identity isolation. Fix every Critical or Important finding with a new failing regression first, then rerun all gates.

- [ ] **Step 5: Commit demonstrated final review fixes**

Only when the review produced a failing regression and a corresponding code correction, stage the exact in-scope files and commit:

```powershell
git add -- 'src/app/memory/[id]/edit.tsx' 'src/features/memories/travel-date.ts' '__tests__/memory-canvas-editor.test.tsx' '__tests__/travel-date.test.ts'
git commit -m "fix: harden saved album metadata editing"
```

When review finds no blocking issue, leave the already clean implementation commits unchanged and skip this step.

Do not push, merge, or create a pull request until the user explicitly approves the completed implementation.
