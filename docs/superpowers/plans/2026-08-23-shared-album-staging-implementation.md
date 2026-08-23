# Shared Album Staging and Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make owner/editor shared-album edits stage only in the current editor session, publish only from “保存并发布更新”, and carry an editable published title and nullable travel date through the real shared-album stack.

**Architecture:** Add nullable `travel_date` to the shared snapshot and thread it through the existing start/finish publication transaction and owner/editor/viewer read models. Extract the local editor’s title/date interaction into a controlled `AlbumMetadataEditor`, then let local and shared editors own separate draft state while rendering that same component. Split `SharedAlbumEditor.prepareSave()` into a local staging path and a single remote publishing path; staging never calls APIs, uploads R2 objects, clears dirty state, or invokes publication callbacks.

**Tech Stack:** Expo Router 6, React Native 0.81/React 19, TypeScript, Drizzle ORM/PostgreSQL migrations, private R2 publication flow, Jest and Testing Library.

---

## File map

- Create `drizzle/0011_shared_album_travel_date.sql`: nullable shared travel date migration and schema-meta version 11.
- Modify `drizzle/meta/_journal.json`: register migration 0011.
- Modify `src/server/db/schema.ts`: declare `sharedAlbums.travelDate`.
- Modify `src/app/api/health+api.ts`: require database schema version 11.
- Modify `src/server/gifts/repository.ts`: persist and select the published travel date.
- Modify `src/server/gifts/shared-publication.ts`: normalize and validate `travelDate` in publish requests.
- Modify `src/services/backend/api-client.ts`: use shared read/publish types containing `travelDate`.
- Modify shared-album GET/list/manage API routes under `src/app/api/gifts/**` and `src/app/api/my-gifts/**`: expose the published travel date without object keys.
- Create `src/features/memories/album-metadata-editor.tsx`: controlled, reusable title double-tap and native travel-date picker.
- Modify `src/app/memory/[id]/edit.tsx`: render the extracted metadata component while retaining local draft identity and local save behavior.
- Modify `src/features/gifts/shared-album-editor.tsx`: own shared metadata draft, stage Canvas state locally, and publish only on the second action.
- Modify `src/app/gifts/[id].tsx`: include the local album travel date on the first shared publication and display the published date thereafter.
- Modify `src/app/gifts/shared/[id].tsx`: show the published travel date to owner/editor/viewer.
- Modify `src/app/gifts/shared/[id]/edit.tsx`: consume the simplified publish callback while retaining route dirty protection.
- Add/update focused tests named below; no new production dependencies.

### Task 1: Add nullable shared travel-date storage

**Files:**
- Create: `drizzle/0011_shared_album_travel_date.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/db/schema.ts`
- Modify: `src/app/api/health+api.ts`
- Test: `__tests__/backend-migrations.test.ts`
- Test: `__tests__/backend-smoke.test.ts`

- [ ] **Step 1: Write the failing migration tests**

Extend the migration test to assert the new nullable column and schema version, and the health test to reject version 10:

```ts
const travelDateColumn = await db.execute(sql`
  select is_nullable, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'shared_albums'
    and column_name = 'travel_date'
`);
expect(travelDateColumn.rows).toEqual([{ is_nullable: "YES", data_type: "text" }]);

const schemaMeta = await db.execute(sql`select version from app_schema_meta where key = 'database'`);
expect(schemaMeta.rows).toEqual([{ version: 11 }]);
```

In the health mock, add a version-10 response and expect `503 database_schema_outdated`; keep version 11 healthy.

- [ ] **Step 2: Run the migration and health tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/backend-migrations.test.ts __tests__/backend-smoke.test.ts
```

Expected: FAIL because `travel_date` does not exist, schema meta is 10, and health still accepts version 10.

- [ ] **Step 3: Add migration 0011 and the Drizzle field**

Create the exact SQL:

```sql
ALTER TABLE "shared_albums" ADD COLUMN "travel_date" text;
UPDATE "app_schema_meta"
SET "version" = 11, "updated_at" = '2026-08-23T00:00:00.000Z'
WHERE "key" = 'database';
```

Append a journal entry with `idx: 11`, tag `0011_shared_album_travel_date`, and a monotonically increasing `when`. Add the field between title and published time:

```ts
title: text("title").notNull(),
travelDate: text("travel_date"),
publishedAt: text("published_at").notNull(),
```

Raise the health floor:

```ts
const minimumSchemaVersion = 11;
```

- [ ] **Step 4: Run the focused tests to verify green**

Run the command from Step 2.

Expected: both suites PASS; historical rows are accepted because the new column is nullable.

- [ ] **Step 5: Validate migration metadata**

Run:

```powershell
npm run db:check
```

Expected: Drizzle reports a valid migration history.

- [ ] **Step 6: Commit the storage slice**

```powershell
git add drizzle/0011_shared_album_travel_date.sql drizzle/meta/_journal.json src/server/db/schema.ts src/app/api/health+api.ts __tests__/backend-migrations.test.ts __tests__/backend-smoke.test.ts
git commit -m "feat: store shared album travel dates"
```

### Task 2: Carry travel date through publication validation and transaction

**Files:**
- Modify: `src/server/gifts/shared-publication.ts`
- Modify: `src/server/gifts/repository.ts`
- Test: `__tests__/gift-editor-publish-api.test.ts`
- Test: `__tests__/gift-repository.test.ts`

- [ ] **Step 1: Write failing parser tests for null, valid, and malformed dates**

Add cases beside the existing `prepareSharedPublication` tests:

```ts
expect(prepareSharedPublication({
  baseVersion: 1,
  sourceMemoryId: "memory-1",
  title: "Trip",
  travelDate: "2026-08-21",
  pages: [],
  media: [],
}, "gift-1", "publish-1").payload.travelDate).toBe("2026-08-21");

expect(prepareSharedPublication({
  baseVersion: 1,
  sourceMemoryId: "memory-1",
  title: "Legacy",
  travelDate: null,
  pages: [],
  media: [],
}, "gift-1", "publish-2").payload.travelDate).toBeNull();

expect(() => prepareSharedPublication({
  baseVersion: 1,
  sourceMemoryId: "memory-1",
  title: "Bad date",
  travelDate: "21/08/2026",
  pages: [],
  media: [],
}, "gift-1", "publish-3")).toThrow(expect.objectContaining({ code: "validation_failed" }));
```

- [ ] **Step 2: Write the failing repository publication test**

Publish version 1 with `travelDate: null`, then version 2 with a new title/date and assert only the shared snapshot changes:

```ts
await createGiftPublishSession(db, {
  id: "publish-2",
  giftId: "gift-1",
  ownerEmail: "owner@example.com",
  baseVersion: 1,
  createdAt: "2026-08-23T00:04:00.000Z",
  expiresAt: "2026-08-23T00:14:00.000Z",
  payload: {
    sourceMemoryId: "memory-1",
    title: "Hong Kong Nights",
    travelDate: "2026-08-21",
    pages: [],
    media: [],
  },
});
const result = await completeGiftPublishSession(db, {
  sessionId: "publish-2",
  ownerEmail: "owner@example.com",
  now: "2026-08-23T00:05:00.000Z",
});
const snapshot = await getSharedAlbumSnapshot(db, result!.albumId);
expect(snapshot!.album).toEqual(expect.objectContaining({
  title: "Hong Kong Nights",
  travelDate: "2026-08-21",
  version: 2,
}));
```

- [ ] **Step 3: Run the focused publication tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-editor-publish-api.test.ts __tests__/gift-repository.test.ts
```

Expected: FAIL because the parser/payload and shared snapshot have no `travelDate`.

- [ ] **Step 4: Implement normalized shared travel-date validation**

Add the field and a focused normalizer:

```ts
export type SharedPublishBody = {
  baseVersion?: number;
  sourceMemoryId?: string;
  title?: string;
  travelDate?: string | null;
  pages?: { position?: number; page?: unknown }[];
  media?: ({ position?: number; mediaId: string } | { position?: number; contentType: string; byteSize: number })[];
  cover?: { contentType?: string; byteSize?: number } | null;
};

function normalizeSharedTravelDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "validation_failed", "Travel date must use YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new ApiError(400, "validation_failed", "Travel date must use YYYY-MM-DD");
  }
  return value;
}
```

Populate the server-owned payload:

```ts
const payload: GiftPublicationPayload = {
  sourceMemoryId: body.sourceMemoryId.trim(),
  title: body.title.trim().slice(0, 160),
  travelDate: normalizeSharedTravelDate(body.travelDate),
  pages: pages.map((item, position) => ({
    position: item.position ?? position,
    page: item.page ?? {},
  })),
  media: media.flatMap((item, position) => {
    if ("mediaId" in item) return [];
    if (!validImage(item)) {
      throw new ApiError(400, "validation_failed", "Each photo must be an image smaller than 25 MB");
    }
    return [{
      position: item.position ?? position,
      contentType: item.contentType!,
      byteSize: item.byteSize!,
      objectKey: `gifts/${giftId}/${sessionId}/temp/${crypto.randomUUID()}`,
      source: "upload" as const,
    }];
  }),
  cover: cover
    ? {
        contentType: cover.contentType!,
        byteSize: cover.byteSize!,
        objectKey: `gifts/${giftId}/${sessionId}/temp/cover`,
      }
    : null,
};
```

- [ ] **Step 5: Persist the field in the completion transaction**

Extend the internal payload and insert. Keep a defensive fallback for publication sessions created before deployment:

```ts
export type GiftPublicationPayload = {
  sourceMemoryId: string;
  title: string;
  travelDate?: string | null;
  pages: { position: number; page: unknown }[];
  media: { position: number; objectKey: string; contentType: string; byteSize: number; source?: "existing" | "upload" }[];
  cover?: { objectKey: string; contentType: string; byteSize: number } | null;
};
```

```ts
await tx.insert(sharedAlbums).values({
  id: albumId,
  giftId: session.giftId,
  sourceMemoryId: payload.sourceMemoryId,
  title: payload.title,
  travelDate: payload.travelDate ?? current?.travelDate ?? null,
  publishedAt: input.now,
  version,
  coverObjectKey: payload.cover?.objectKey ?? null,
  coverContentType: payload.cover?.contentType ?? null,
  coverByteSize: payload.cover?.byteSize ?? null,
});
```

The fallback preserves an existing published date only for an already-created old-format session; explicit `null` from a current client remains `null` by checking property presence rather than using `??` in the final implementation:

```ts
const travelDate = Object.prototype.hasOwnProperty.call(payload, "travelDate")
  ? payload.travelDate ?? null
  : current?.travelDate ?? null;
```

- [ ] **Step 6: Run the focused publication tests to verify green**

Run the command from Step 3.

Expected: both suites PASS, including access, version-conflict, R2 promotion, and cleanup tests.

- [ ] **Step 7: Commit the publication transaction slice**

```powershell
git add src/server/gifts/shared-publication.ts src/server/gifts/repository.ts __tests__/gift-editor-publish-api.test.ts __tests__/gift-repository.test.ts
git commit -m "feat: publish shared album metadata"
```

### Task 3: Expose published travel dates through the client and read APIs

**Files:**
- Modify: `src/services/backend/api-client.ts`
- Modify: `src/app/api/my-gifts/[id]/album+api.ts`
- Modify: `src/app/api/my-gifts/[id]/manage+api.ts`
- Modify: `src/app/api/gifts/[token]/album+api.ts`
- Modify: `src/app/api/gifts/invited/[id]/album+api.ts`
- Modify: `src/app/api/gifts/owned+api.ts`
- Modify: `src/app/api/gifts/invited+api.ts`
- Test: `__tests__/backend-client.test.ts`
- Test: `__tests__/gift-owned-album-api.test.ts`
- Test: `__tests__/gift-invited-api.test.ts`
- Test: `__tests__/gift-access-api.test.ts`

- [ ] **Step 1: Write failing API response and client serialization tests**

Update album fixtures to include both a dated album and a legacy null album. Assert owner/editor/viewer reads return the field:

```ts
mockSnapshot.mockResolvedValue({
  album: {
    id: "album-1",
    title: "Trip",
    travelDate: "2026-08-21",
    publishedAt: "2026-08-23T00:00:00.000Z",
    version: 4,
    coverObjectKey: null,
    coverContentType: null,
    coverByteSize: null,
  },
  pages: [],
  media: [],
});
await expect(response.json()).resolves.toEqual(expect.objectContaining({
  title: "Trip",
  travelDate: "2026-08-21",
}));
```

For client publication methods, inspect the fetch body:

```ts
expect(JSON.parse(String(mockFetch.mock.calls.at(-1)?.[1]?.body))).toEqual(expect.objectContaining({
  title: "Renamed Trip",
  travelDate: "2026-08-21",
}));
```

- [ ] **Step 2: Run the focused API/client tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/backend-client.test.ts __tests__/gift-owned-album-api.test.ts __tests__/gift-invited-api.test.ts __tests__/gift-access-api.test.ts
```

Expected: FAIL because the response and typed payload omit `travelDate`.

- [ ] **Step 3: Define one reusable shared album publication type**

Replace repeated inline payloads with:

```ts
export type SharedAlbumPublishPayload = {
  baseVersion: number;
  sourceMemoryId: string;
  title: string;
  travelDate: string | null;
  pages: { position: number; page: unknown }[];
  media: ({ position: number; mediaId: string } | { position: number; contentType: string; byteSize: number })[];
  cover?: { contentType: string; byteSize: number } | null;
};

export type InvitedGiftAlbum = {
  role: GiftMemberRole;
  title: string;
  travelDate: string | null;
  pages: { position: number; page: unknown }[];
  media: { id: string; position: number; contentType: string; byteSize: number; readUrl: string }[];
  publishedAt: string;
  version: number;
  cover: SharedAlbumCover | null;
};
```

Use `SharedAlbumPublishPayload` in `startGiftPublish`, `startOwnedGiftPublish`, and `startInvitedGiftPublish`. Add `travelDate` to list/management album summaries where those responses already expose title/version.

- [ ] **Step 4: Add `travelDate` to every shared-album response mapper**

Each album GET response must include the value from the snapshot:

```ts
return Response.json({
  role,
  title: snapshot.album.title,
  travelDate: snapshot.album.travelDate ?? null,
  pages: snapshot.pages,
  media,
  publishedAt: snapshot.album.publishedAt,
  version: snapshot.album.version,
  cover,
});
```

Add `sharedAlbums.travelDate` to repository list selectors and map list/manage responses as `travelDate: row.travelDate ?? null`. Never expose an R2 object key.

- [ ] **Step 5: Run the focused API/client tests to verify green**

Run the command from Step 2.

Expected: all suites PASS for dated and legacy-null albums.

- [ ] **Step 6: Commit the read-contract slice**

```powershell
git add src/services/backend/api-client.ts src/server/gifts/repository.ts src/app/api/my-gifts src/app/api/gifts __tests__/backend-client.test.ts __tests__/gift-owned-album-api.test.ts __tests__/gift-invited-api.test.ts __tests__/gift-access-api.test.ts
git commit -m "feat: expose shared album travel dates"
```

### Task 4: Extract and reuse the controlled album metadata editor

**Files:**
- Create: `src/features/memories/album-metadata-editor.tsx`
- Create: `__tests__/album-metadata-editor.test.tsx`
- Modify: `src/app/memory/[id]/edit.tsx`
- Test: `__tests__/memory-canvas-editor.test.tsx`

- [ ] **Step 1: Write the failing controlled-component tests**

Mock `@react-native-community/datetimepicker`, render the new component, and cover accessibility activation, double press, date selection, null display, and disabled state:

```tsx
const onChange = jest.fn();
render(
  <AlbumMetadataEditor
    contextLabel="杭州"
    disabled={false}
    onChange={onChange}
    title="杭州周末"
    travelDate="2026-08-20"
  />,
);

fireEvent(screen.getByLabelText("双击修改旅行册名称"), "accessibilityAction", {
  nativeEvent: { actionName: "activate" },
});
fireEvent.changeText(screen.getByLabelText("纪念册标题"), "杭州夏夜");
expect(onChange).toHaveBeenCalledWith({ title: "杭州夏夜" });

fireEvent.press(screen.getByLabelText("选择旅行日期"));
fireEvent(screen.getByTestId("album-metadata-date-picker"), "change", { type: "set" }, new Date(2026, 7, 21));
expect(onChange).toHaveBeenCalledWith({ travelDate: "2026-08-21" });
```

Render `travelDate={null}` and expect “未设置旅行日期”; render `disabled` and assert both controls are disabled.

- [ ] **Step 2: Run component tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/album-metadata-editor.test.tsx
```

Expected: FAIL because `AlbumMetadataEditor` does not exist.

- [ ] **Step 3: Implement the controlled metadata editor**

Create the component with no persistence or route knowledge:

```tsx
export type AlbumMetadataValue = { title: string; travelDate: string | null };

type Props = AlbumMetadataValue & {
  contextLabel?: string;
  disabled: boolean;
  onChange: (change: Partial<AlbumMetadataValue>) => void;
};

export function AlbumMetadataEditor({ contextLabel, disabled, onChange, title, travelDate }: Props) {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const lastTitlePressRef = React.useRef<number | null>(null);
  const dateText = travelDate ?? "未设置旅行日期";
  const displayLine = contextLabel ? `${contextLabel} · ${dateText}` : dateText;
  const pickerValue = travelDate ? parseIsoTravelDate(travelDate) : new Date();

  const beginTitleEditing = () => {
    if (disabled) return;
    lastTitlePressRef.current = null;
    setIsEditingTitle(true);
  };
  const handleTitlePress = () => {
    if (disabled) return;
    const now = Date.now();
    const elapsed = lastTitlePressRef.current === null ? null : now - lastTitlePressRef.current;
    if (elapsed !== null && elapsed >= 0 && elapsed <= 350) beginTitleEditing();
    else lastTitlePressRef.current = now;
  };
  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (event.type === "set" && selected) onChange({ travelDate: toIsoTravelDate(selected) });
  };

  return (
    <>
      <View style={styles.metadataHeader} testID="album-metadata-editor">
        {isEditingTitle ? (
          <TextInput
            accessibilityLabel="纪念册标题"
            autoFocus
            editable={!disabled}
            onBlur={() => setIsEditingTitle(false)}
            onChangeText={(nextTitle) => onChange({ title: nextTitle })}
            onSubmitEditing={() => setIsEditingTitle(false)}
            returnKeyType="done"
            style={styles.titleInput}
            value={title}
          />
        ) : (
          <Pressable
            accessibilityActions={[{ name: "activate", label: "修改旅行册名称" }]}
            accessibilityHint="连续点击两次进入编辑"
            accessibilityLabel="双击修改旅行册名称"
            accessibilityRole="button"
            accessibilityValue={{ text: title }}
            disabled={disabled}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "activate") beginTitleEditing();
            }}
            onPress={handleTitlePress}
          >
            <Text selectable style={styles.metadataTitle}>{title}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="选择旅行日期"
          accessibilityRole="button"
          accessibilityValue={{ text: displayLine }}
          disabled={disabled}
          onPress={() => setShowDatePicker(true)}
        >
          <Text selectable style={styles.metadataLine}>{displayLine}</Text>
        </Pressable>
      </View>
      {showDatePicker && Platform.OS === "android" ? (
        <DateTimePicker
          maximumDate={new Date()}
          minimumDate={MIN_TRAVEL_DATE}
          mode="date"
          onChange={handleDateChange}
          testID="album-metadata-date-picker"
          value={pickerValue}
        />
      ) : null}
      {showDatePicker && Platform.OS === "ios" ? (
        <View style={styles.overlay}>
          <View style={styles.dateSheet}>
            <Text selectable style={styles.sheetTitle}>选择旅行日期</Text>
            <DateTimePicker
              display="spinner"
              maximumDate={new Date()}
              minimumDate={MIN_TRAVEL_DATE}
              mode="date"
              onChange={handleDateChange}
              testID="album-metadata-date-picker"
              textColor={colors.ink}
              themeVariant="light"
              value={pickerValue}
            />
            <AppButton label="完成" onPress={() => setShowDatePicker(false)} />
          </View>
        </View>
      ) : null}
    </>
  );
}
```

Use the imports `DateTimePicker`, `React`, `Platform`, `Pressable`, `StyleSheet`, `Text`, `TextInput`, `View`, `AppButton`, `colors`, and the travel-date helpers. Move these exact local metadata styles into the component:

```ts
const styles = StyleSheet.create({
  metadataHeader: { gap: 6, paddingHorizontal: 20 },
  metadataTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  metadataLine: { color: colors.muted, fontSize: 15 },
  titleInput: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  dateSheet: { backgroundColor: colors.surface, gap: 12, padding: 20 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
});
```

- [ ] **Step 4: Run the new component tests to verify green**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Refactor the local editor to render the controlled component**

Keep `MetadataDraft`, identity checks, recovery, and save transaction in the screen. Replace only duplicated UI state/JSX:

```tsx
<AlbumMetadataEditor
  contextLabel={cityName}
  disabled={metadataControlsDisabled}
  onChange={(change) => updateMetadata(change)}
  title={currentMetadata.title}
  travelDate={currentMetadata.travelDate}
/>
```

Remove screen-owned `isEditingTitle`, `showDatePicker`, title tap refs/handlers, picker imports, and moved metadata styles. Do not change `save()` or local persistence.

- [ ] **Step 6: Run local editor regression tests**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/album-metadata-editor.test.tsx __tests__/memory-canvas-editor.test.tsx
```

Expected: PASS, including local title/date save, account/load identity isolation, retry, and formal-save locking.

- [ ] **Step 7: Commit the reuse slice**

```powershell
git add src/features/memories/album-metadata-editor.tsx src/app/memory/[id]/edit.tsx __tests__/album-metadata-editor.test.tsx __tests__/memory-canvas-editor.test.tsx
git commit -m "refactor: share album metadata editor"
```

### Task 5: Make shared staging local-only and publish the latest session state

**Files:**
- Modify: `src/features/gifts/shared-album-editor.tsx`
- Test: `__tests__/gift-shared-editor.test.tsx`
- Test: `__tests__/gift-shared-editor-canvas-integration.test.tsx`

- [ ] **Step 1: Replace stay-publish expectations with failing local-stage tests**

Rename the first button expectations to “暂存当前修改”. After changing Canvas content and metadata, press it and assert no remote work:

```tsx
fireEvent.press(screen.getByText("change text"));
fireEvent(screen.getByLabelText("双击修改旅行册名称"), "accessibilityAction", {
  nativeEvent: { actionName: "activate" },
});
fireEvent.changeText(screen.getByLabelText("纪念册标题"), "Staged title");
fireEvent.press(screen.getByText("暂存当前修改"));

await waitFor(() => expect(mockPrepareSave).toHaveBeenCalledTimes(1));
expect(mockStart).not.toHaveBeenCalled();
expect(mockStartOwned).not.toHaveBeenCalled();
expect(mockFinish).not.toHaveBeenCalled();
expect(mockFinishOwned).not.toHaveBeenCalled();
expect(global.fetch).not.toHaveBeenCalled();
expect(onPublished).not.toHaveBeenCalled();
expect(onDirtyChange).toHaveBeenLastCalledWith(true);
```

Add a second test where `prepareSave` returns staged pages, the user edits again, and publish must send the second prepared result, not the staged snapshot.

- [ ] **Step 2: Add failing owner/editor metadata publish tests**

Use album fixtures with `travelDate: null` and `travelDate: "2026-08-20"`. Assert both role-specific start methods receive the current controlled draft:

```ts
expect(mockStart).toHaveBeenCalledWith("gift-1", "token", expect.objectContaining({
  title: "Shared rename",
  travelDate: "2026-08-21",
}));
expect(mockStartOwned).toHaveBeenCalledWith("token", "gift-1", expect.objectContaining({
  title: "Owner rename",
  travelDate: "2026-08-21",
}));
```

Also assert an empty title shows “请输入纪念册标题” and calls neither start API.

- [ ] **Step 3: Run shared editor tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-shared-editor.test.tsx __tests__/gift-shared-editor-canvas-integration.test.tsx
```

Expected: FAIL because the first button still publishes, metadata UI is absent, and payload title is fixed to `album.title`.

- [ ] **Step 4: Add shared metadata draft and one dirty source of truth**

Initialize controlled session state from the loaded published snapshot:

```ts
const [metadata, setMetadata] = React.useState({
  title: album.title,
  travelDate: album.travelDate,
});

const handleMetadataChange = React.useCallback((change: Partial<AlbumMetadataValue>) => {
  setMetadata((current) => ({ ...current, ...change }));
  changeDirty(true);
}, [changeDirty]);
```

Render above `BookCanvasEditor`:

```tsx
<AlbumMetadataEditor
  disabled={busy || stale}
  onChange={handleMetadataChange}
  title={metadata.title}
  travelDate={metadata.travelDate}
/>
```

- [ ] **Step 5: Implement the local-only stage operation**

Use a distinct busy intent and never call publication code:

```ts
const stage = async () => {
  if (inFlight.current || stale || transformPending) return;
  inFlight.current = true;
  setBusy(true);
  setBusyIntent("stage");
  setMessage("");
  try {
    const prepared = await editorRef.current?.prepareSave();
    if (!prepared) {
      setMessage(PREPARE_SAVE_PENDING_MESSAGE);
      return;
    }
    activePage.current = prepared.cursor;
    setPages(prepared.pages);
    if (dirty || prepared.pages !== pages) changeDirty(true);
    setMessage("修改已暂存在当前编辑会话，尚未发布。");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : PREPARE_SAVE_PENDING_MESSAGE);
  } finally {
    editorRef.current?.releaseSaveLock();
    inFlight.current = false;
    setBusy(false);
    setBusyIntent(null);
  }
};
```

Wire the first button to `stage`, label it “暂存当前修改”, show “正在暂存…” while busy, and retain dirty state after success.

- [ ] **Step 6: Reduce remote publication to the second action**

Rename the existing remote method to `publish` with no stay/exit argument. It must call `prepareSave()` again, validate title before any fetch/API call, and include metadata:

```ts
const publishPayload: SharedAlbumPublishPayload = {
  baseVersion: album.version,
  sourceMemoryId: `shared:${giftId}`,
  title: metadata.title.trim(),
  travelDate: metadata.travelDate,
  pages: publishPages.map((page, position) => ({ position, page: snapshotPage(page, refs) })),
  media: sources.map((source, position) => source.existingId
    ? { position, mediaId: source.existingId }
    : { position, contentType: source.contentType!, byteSize: source.byteSize! }),
  cover: coverBlob
    ? { contentType: coverBlob.type || album.cover!.contentType, byteSize: coverBlob.size }
    : null,
};
```

For no changes, call `onExit?.(publishCursor)` and do not start a session. On success, clear dirty and invoke:

```ts
await onPublished({ cursor: publishCursor });
```

Keep existing `403`, `409`, upload failure, stable-media, and save-lock behavior unchanged.

- [ ] **Step 7: Run shared editor tests to verify green**

Run the command from Step 3.

Expected: both suites PASS; the real `BookCanvasEditor` toolbar remains rendered, and Fabric still receives a callable function component.

- [ ] **Step 8: Commit the staging state-machine slice**

```powershell
git add src/features/gifts/shared-album-editor.tsx __tests__/gift-shared-editor.test.tsx __tests__/gift-shared-editor-canvas-integration.test.tsx
git commit -m "feat: stage shared album edits locally"
```

### Task 6: Thread metadata through first publish, edit route, and preview

**Files:**
- Modify: `src/app/gifts/[id].tsx`
- Modify: `src/app/gifts/shared/[id]/edit.tsx`
- Modify: `src/app/gifts/shared/[id].tsx`
- Test: `__tests__/gift-owner-management.test.tsx`
- Test: `__tests__/gift-shared-edit-route.test.tsx`
- Test: `__tests__/gift-shared-viewer.test.tsx`

- [ ] **Step 1: Write the failing first-publication date test**

In owner management, assert the first publish carries the selected local memory’s real date:

```ts
expect(mockStartOwnedGiftPublish).toHaveBeenCalledWith(
  "account-token",
  "gift-1",
  expect.objectContaining({
    baseVersion: 0,
    sourceMemoryId: "memory-1",
    title: "Trip",
    travelDate: "2026-08-21",
  }),
);
```

For an existing shared album, assert the management screen shows either its published date or “未设置旅行日期” and still hides local replacement controls.

- [ ] **Step 2: Write failing route and preview tests**

Update route mocks to use the simplified callback shape. Assert owner/editor load `{ title, travelDate }` into the shared editor, a successful publication returns to the same preview cursor, and no first-button reload exists.

For preview, cover both values:

```tsx
mockGetInvitedGiftAlbum.mockResolvedValue({ ...album, travelDate: "2026-08-21" });
render(<SharedGiftDetailScreen />);
await screen.findByText("旅行日期 · 2026-08-21");

mockGetInvitedGiftAlbum.mockResolvedValue({ ...album, travelDate: null });
render(<SharedGiftDetailScreen />);
await screen.findByText("旅行日期 · 未设置旅行日期");
```

- [ ] **Step 3: Run the screen/route tests to verify red**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-owner-management.test.tsx __tests__/gift-shared-edit-route.test.tsx __tests__/gift-shared-viewer.test.tsx
```

Expected: FAIL because first publish omits the date, the route still understands `intent: stay`, and preview does not render travel metadata.

- [ ] **Step 4: Send the local date on first publication and retain published management metadata**

Add the payload field:

```ts
const publication = await client.startOwnedGiftPublish(session.accessToken, id, {
  baseVersion: album?.version ?? 0,
  sourceMemoryId: selectedMemory.id,
  title: selectedMemory.title,
  travelDate: selectedMemory.travelDate,
  pages: selectedMemory.pages.map((page, position) => ({ position, page: sharedPage(page) })),
  media: media.map(({ position, contentType, byteSize }) => ({ position, contentType, byteSize })),
  cover: coverSize && coverContentType ? { contentType: coverContentType, byteSize: coverSize } : null,
});
```

Expand management album state to include `travelDate: string | null` and display `album.travelDate ?? "未设置旅行日期"` beside version/title. Do not re-enable replacement after first publication.

- [ ] **Step 5: Simplify the edit-route publication callback**

Replace stay/exit branching with a single preview exit:

```ts
const handlePublished = React.useCallback(async (result: { cursor: Cursor }) => {
  if (contextKey !== contextKeyRef.current) return;
  leaveToPreview(result.cursor);
}, [contextKey, leaveToPreview]);
```

Keep `onReload={load}` only for explicit 409 reload. The local stage button must not call route load, replace the `key`, or clear the dirty guard.

- [ ] **Step 6: Display published metadata in shared preview**

Render below `ScreenTitle` for all roles:

```tsx
{visibleAlbum ? (
  <Text selectable style={styles.albumMetadata}>
    旅行日期 · {visibleAlbum.travelDate ?? "未设置旅行日期"}
  </Text>
) : null}
```

This is read-only published state. Keep viewer’s cover/open flow and owner/editor’s immediate `PageReader` flow unchanged.

- [ ] **Step 7: Run the screen/route tests to verify green**

Run the command from Step 3.

Expected: all suites PASS for owner first publication, owner/editor edit routing, viewer read-only flow, cursor restoration, dirty exit confirmation, and legacy null display.

- [ ] **Step 8: Commit the end-to-end UI slice**

```powershell
git add src/app/gifts/[id].tsx src/app/gifts/shared/[id]/edit.tsx src/app/gifts/shared/[id].tsx __tests__/gift-owner-management.test.tsx __tests__/gift-shared-edit-route.test.tsx __tests__/gift-shared-viewer.test.tsx
git commit -m "feat: edit shared album names and dates"
```

### Task 7: Verify regression, isolation, and production build

**Files:**
- Modify only if a failing assertion reveals a regression in files already listed above.

- [ ] **Step 1: Run the complete shared-album and local-editor matrix**

```powershell
npx jest --runInBand --runTestsByPath __tests__/album-metadata-editor.test.tsx __tests__/memory-canvas-editor.test.tsx __tests__/gift-shared-editor.test.tsx __tests__/gift-shared-editor-canvas-integration.test.tsx __tests__/gift-shared-edit-route.test.tsx __tests__/gift-shared-viewer.test.tsx __tests__/gift-owner-management.test.tsx __tests__/gift-editor-publish-api.test.ts __tests__/gift-owned-album-api.test.ts __tests__/gift-invited-api.test.ts __tests__/gift-repository.test.ts __tests__/backend-client.test.ts __tests__/backend-migrations.test.ts
```

Expected: every focused suite PASS. Confirm the stage tests explicitly prove zero start/finish calls, zero fetch/upload calls, no version callback, dirty remains true, and the second action publishes the latest prepared snapshot.

- [ ] **Step 2: Run static quality gates**

```powershell
npm run lint
npm run typecheck
```

Expected: both commands exit 0 with no new warnings/errors.

- [ ] **Step 3: Run the complete automated test suite**

```powershell
npm run test:ci
```

Expected: all Jest and Node test suites PASS.

- [ ] **Step 4: Build the Expo server/web bundle**

```powershell
npm run build:server
```

Expected: Expo export exits 0. Inspect the emitted iOS/web bundle if the Fabric regression test changes; `BookCanvasEditor` must remain a callable function rather than a `forwardRef` object.

- [ ] **Step 5: Run migration and NFC PR guards**

```powershell
npm run db:check
npm run nfc:test:guard
git diff --check
git status --short
```

Expected: migration and NFC guards PASS, no whitespace errors, and only intentional tracked changes are present. The local NFC Lab remains governed by its exact ignore/cleanup rules and is not added to this feature commit.

- [ ] **Step 6: Perform the staging role matrix**

Using the existing NFC Lab and staging only:

1. Owner opens the shared editor, renames the album, selects a date, edits a Canvas page, presses “暂存当前修改”, returns/back and verifies the discard warning; no other account sees a new version.
2. Owner repeats, presses “保存并发布更新”, and verifies owner/viewer/editor previews show the new published name/date and current page.
3. Editor repeats the same stage/publish sequence and verifies the owner and viewer see the published version.
4. Viewer verifies read-only preview, published metadata, cover/open behavior, and absence of the pencil.
5. Open a legacy shared album with null date and verify “未设置旅行日期”; publish a selected date and verify it becomes visible.
6. Simulate/reproduce a version conflict and confirm the old editor locks until explicit reload.

Expected: staging matches the automated role matrix; no production origin, bucket, or account is touched.

- [ ] **Step 7: Commit any verification-only test correction**

Only if verification required a legitimate test/implementation correction:

```powershell
git add src/server/db/schema.ts src/server/gifts/repository.ts src/server/gifts/shared-publication.ts src/services/backend/api-client.ts src/features/memories/album-metadata-editor.tsx src/features/gifts/shared-album-editor.tsx src/app/api src/app/memory/[id]/edit.tsx src/app/gifts/[id].tsx src/app/gifts/shared/[id].tsx src/app/gifts/shared/[id]/edit.tsx __tests__ drizzle
git commit -m "test: cover shared album staging regressions"
```

Otherwise leave the branch at the Task 6 commit with a clean status.

## Self-review record

- Spec coverage: local-only stage semantics, latest-snapshot publish, dirty/exit behavior, owner/editor API split, title/date reuse, nullable legacy storage, first publish, viewer read, errors, version conflicts, and full gates are each assigned to a task.
- Placeholder scan: no `TODO`, `TBD`, “similar to”, abbreviated code comments, or unspecified error-handling steps remain.
- Type consistency: `travelDate` is `string | null` in read/UI types; the server payload property is optional only for safe completion of old in-flight sessions. New client publication payloads require `travelDate`. Publication success carries `{ cursor }`; local staging has no callback.
