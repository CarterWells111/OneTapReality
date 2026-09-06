# Large Album Export and Gift Publishing Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep original local album photos untouched while reliably exporting lower-quality PDFs and publishing moderately compressed gift copies without missing images or timing out on albums around 20–50 MB.

**Architecture:** Preserve the local `Documents` photo files as the high-quality source of truth. PDF export waits for every rendered canvas asset, captures each page as a 720×960 JPEG at quality 0.80, and refuses to emit a partial document. Gift publishing uses a shared snapshot/media pipeline, creates temporary derivatives one at a time (maximum edge 2560 px, JPEG quality 0.82), uploads with bounded concurrency and authenticated signed-URL refresh, then deletes temporary derivatives without changing the local album.

**Tech Stack:** Expo SDK 57, React Native, `expo-image`, `expo-image-manipulator`, `expo-file-system`, `react-native-view-shot`, `expo-print`, Expo Router API routes, Cloudflare R2 signed URLs, Jest.

---

## Fixed product decisions

- The files referenced by local albums remain the original persisted files. Exporting or publishing must never overwrite, replace, resize, or delete them.
- PDF output is intentionally optimized for reliable phone viewing and ordinary sharing rather than archival printing:
  - canvas capture: 720×960 pixels;
  - format: JPEG;
  - quality: `0.80`;
  - PDF page remains 3:4.
- Gift copies are intentionally smaller than local originals but clearer than the PDF capture:
  - maximum long edge: 2560 pixels;
  - JPEG/HEIC/HEIF/WebP photos: JPEG quality `0.82`;
  - PNG: resize only and keep PNG so transparency is not destroyed;
  - all derivatives live in the cache directory and are deleted after success or failure.
- Existing server limits remain: at most 100 pages, 50 media entries, and 25 MB per uploaded object. This work does not add an album-total byte limit.
- A PDF page with a failed photo, sticker, frame, or background is an export failure. It must not silently become a page with missing content.
- A failed gift publication never replaces the currently published version. Existing compare-and-swap and authorization rules remain authoritative.
- No payment, analytics, external image service, remote model, client secret, or new cloud provider is introduced.

## Delivery boundaries

- Implement in an isolated clean branch/worktree because the current checkout contains unrelated administrator gift-card changes.
- Server/API changes are backward-compatible: existing clients can continue using POST/PUT; PATCH is added only to refresh upload URLs for an existing unexpired publication.
- Deploy the backward-compatible server before distributing a client that can call PATCH refresh.
- No database migration is required. The existing `gift_publish_sessions.payload_json` stores the same publication data.
- The old plan `docs/superpowers/plans/2026-08-18-pdf-export-native-resolution.md` is superseded; do not execute its 360×480/scale-1 change.

## Acceptance criteria

1. Exporting and publishing do not alter the URI, byte size, or checksum of any local original photo.
2. A 20 MB source album exports a PDF in which every expected canvas image appears, or export stops with a page-specific error; a partial PDF is never shared.
3. PDF captures use 720×960 JPEG quality 0.80 and the generated HTML remains below the explicit encoded-data safety limit.
4. Local owner publication includes every unique page photo, top-level cover, layout cover, and Canvas image element, with no `file://`, `ph://`, signed read URL, or Base64 value persisted in the shared page snapshot.
5. New gift media uses temporary derivatives with a maximum long edge of 2560 px; existing shared media continues to use validated `mediaId` references and is not downloaded or recompressed unnecessarily.
6. Upload concurrency never exceeds two. Transient failures retry; an expired signed URL is refreshed only after current authorization, gift, publication, and position are revalidated.
7. A failed or expired publication leaves the preceding shared album version readable and unchanged.
8. Focused tests, `npm ci`, lint, typecheck, full tests, server build, and iPhone staging checks all pass.

---

### Task 1: Record the quality and reliability decision

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/superpowers/specs/2026-08-18-pdf-export-native-resolution-design.md`
- Modify: `docs/superpowers/plans/2026-08-18-pdf-export-native-resolution.md`

- [ ] **Step 1: Add the decision before changing functional code**

Add a dated entry to the top of `docs/DECISIONS.md`:

```markdown
## 2026-09-06：大相册导出与礼品发布采用分级图片质量

本地旅行册继续以应用 Documents 目录中的原始照片作为高质量来源，导出与礼品发布不得覆盖或替换本地原图。PDF 页面改为等待全部画布资源完成显示后，以 720×960、JPEG 0.80 生成分享副本；任一页面资源失败时停止导出，不再静默生成缺图 PDF。礼品发布只为新媒体创建缓存目录中的临时副本：照片最长边 2560px、JPEG 0.82，PNG 保持透明格式；成功或失败后删除临时副本。

本地 owner 与共享 owner/editor 统一使用同一媒体收集、快照和上传编排逻辑。上传最多并发 2 个；短期 R2 签名失效时，客户端只能通过已认证且仍未过期的发布会话刷新指定位置的上传地址。发布失败不得改变当前共享版本。本次不新增数据库表、外部图片服务、支付、分析、远程素材或客户端秘密。
```

- [ ] **Step 2: Mark the old scale-1 design and plan as superseded**

Immediately below each old document title, add:

```markdown
> Superseded on 2026-09-06 by `docs/superpowers/plans/2026-09-06-large-album-export-and-gift-publishing.md`. Do not implement the 360×480 scale-1 capture; the replacement uses load-aware 720×960 JPEG capture and covers gift publishing.
```

- [ ] **Step 3: Verify the documentation boundary**

Run:

```powershell
rg -n "2026-09-06：大相册|Superseded on 2026-09-06" docs/DECISIONS.md docs/superpowers/specs/2026-08-18-pdf-export-native-resolution-design.md docs/superpowers/plans/2026-08-18-pdf-export-native-resolution.md
```

Expected: one new decision and two superseded notices; no functional files changed yet.

- [ ] **Step 4: Commit the decision separately**

```powershell
git add -- docs/DECISIONS.md docs/superpowers/specs/2026-08-18-pdf-export-native-resolution-design.md docs/superpowers/plans/2026-08-18-pdf-export-native-resolution.md docs/superpowers/plans/2026-09-06-large-album-export-and-gift-publishing.md
git commit -m "docs: define large album media quality"
```

### Task 2: Add the Expo image derivative dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the SDK-matched dependency**

Run:

```powershell
npx expo install expo-image-manipulator
```

Expected: `expo-image-manipulator` is added at the Expo SDK 57-compatible version to both package files. Do not add another image or upload library.

- [ ] **Step 2: Prove the lockfile supports a clean installation**

Run:

```powershell
npm ci
npm run check:lockfile
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit the dependency change**

```powershell
git add -- package.json package-lock.json
git commit -m "build: add image derivative support"
```

### Task 3: Unify gift media discovery and safe snapshot references

**Files:**
- Create: `src/features/gifts/publication-snapshot.ts`
- Create: `__tests__/publication-snapshot.test.ts`
- Modify later: `src/app/gifts/[id].tsx`
- Modify later: `src/features/gifts/shared-album-editor.tsx`

- [ ] **Step 1: Write failing pure-function tests**

Create tests covering all of these in `__tests__/publication-snapshot.test.ts`:

```ts
const pages: StoryPage[] = [{
  id: "cover",
  position: 0,
  kind: "cover",
  headline: "Trip",
  body: "",
  coverImage: "file:///top.jpg",
  layout: {
    aspectRatio: 0.75,
    coverImage: "file:///layout-cover.jpg",
    elements: [
      { id: "a", type: "image", uri: "file:///a.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
      { id: "again", type: "image", uri: "file:///a.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 },
    ],
  },
}];

expect(collectPublicationSources(pages).map(source => source.uri)).toEqual([
  "file:///top.jpg",
  "file:///layout-cover.jpg",
  "file:///a.jpg",
]);

const snapshot = snapshotPagesForPublication(pages, [
  { uri: "file:///top.jpg", position: 0 },
  { uri: "file:///layout-cover.jpg", position: 1 },
  { uri: "file:///a.jpg", position: 2 },
]);
expect(JSON.stringify(snapshot)).not.toMatch(/file:\/\/|ph:\/\/|https:\/\/|data:image/);
expect(snapshot[0].page.coverImage).toBe("shared-position:0");
expect(snapshot[0].page.layout.coverImage).toBe("shared-position:1");
expect(snapshot[0].page.layout.elements[0]).toEqual(expect.objectContaining({ uri: "", mediaPosition: 2 }));
expect(snapshot[0].page.layout.elements[1]).toEqual(expect.objectContaining({ uri: "", mediaPosition: 2 }));
```

Also test:

- `page.photoUri` is included for legacy pages;
- duplicate URIs become one media source;
- an existing signed read URL mapped to `mediaId` becomes `shared-media:<id>`/`mediaId` rather than being persisted;
- missing references cause `snapshotPagesForPublication` to throw instead of leaving a local URI in the payload.

- [ ] **Step 2: Run the test and confirm failure**

```powershell
npx jest --runInBand --runTestsByPath __tests__/publication-snapshot.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure publication snapshot module**

Define these public types and functions:

```ts
export type PublicationSource = {
  uri: string;
  existingId?: string;
};

export type PublicationReference = PublicationSource & {
  position: number;
};

export function collectPublicationSources(
  pages: StoryPage[],
  existingByUri: ReadonlyMap<string, { id: string }> = new Map(),
): PublicationSource[];

export function snapshotPagesForPublication(
  pages: StoryPage[],
  references: PublicationReference[],
): { position: number; page: Record<string, unknown> }[];
```

`collectPublicationSources` must visit, in stable first-seen order:

1. `page.photoUri`;
2. `page.coverImage`;
3. `page.layout.coverImage`;
4. every `page.layout.elements[]` image URI.

`snapshotPagesForPublication` must remove `photoUri`, replace cover URIs with `shared-media:<id>` or `shared-position:<position>`, and replace Canvas image URIs with `uri: ""` plus `mediaId`/`mediaPosition`. It must throw `PublicationSnapshotError(pageId, uri)` when a referenced URI has no mapping.

- [ ] **Step 4: Run the focused test**

```powershell
npx jest --runInBand --runTestsByPath __tests__/publication-snapshot.test.ts __tests__/shared-album-mapper.test.ts
```

Expected: PASS and existing shared-album mapping remains compatible.

- [ ] **Step 5: Commit the pure snapshot layer**

```powershell
git add -- src/features/gifts/publication-snapshot.ts __tests__/publication-snapshot.test.ts
git commit -m "fix: map every gift album image safely"
```

### Task 4: Create temporary medium-quality gift derivatives

**Files:**
- Create: `src/features/gifts/gift-image-derivative.ts`
- Create: `__tests__/gift-image-derivative.test.ts`

- [ ] **Step 1: Write failing tests around the native adapter**

Mock `expo-image-manipulator` and `expo-file-system/legacy`. Assert:

```ts
expect(await createGiftImageDerivative("file:///large.heic", "image/heic")).toEqual({
  uri: "file:///cache/derived.jpg",
  contentType: "image/jpeg",
  byteSize: 900_000,
  width: 2560,
  height: 1920,
});
expect(mockResize).toHaveBeenCalledWith({ width: 2560, height: null });
expect(mockSaveAsync).toHaveBeenCalledWith({
  compress: 0.82,
  format: SaveFormat.JPEG,
});
```

Add portrait, already-small, and PNG cases. PNG must use `SaveFormat.PNG`; already-small photos must still be saved as a compressed derivative without an upsize. Add cleanup tests proving only returned cache URIs are deleted and source URIs are never passed to `deleteAsync`.

- [ ] **Step 2: Confirm the focused test fails**

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-image-derivative.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the derivative adapter using the contextual API**

Use these constants and result type:

```ts
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

export const GIFT_MAX_EDGE = 2560;
export const GIFT_JPEG_QUALITY = 0.82;

export type GiftImageDerivative = {
  uri: string;
  contentType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
};
```

Load/render one source at a time, inspect `ImageRef.width/height`, resize only when the long edge exceeds 2560, save JPEG/PNG to cache, then verify `getInfoAsync(result.uri)` returns a positive size. Reject an unreadable or zero-byte derivative with a Chinese user-facing error.

Implement cleanup as an explicit separate function:

```ts
export async function removeGiftImageDerivatives(
  derivatives: readonly GiftImageDerivative[],
): Promise<void> {
  for (const uri of new Set(derivatives.map(item => item.uri))) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(error => {
      console.warn("[gift-publish] 无法清理临时图片：", error);
    });
  }
}
```

Do not write derivatives into the album `Documents` directory and do not update SQLite.

- [ ] **Step 4: Run derivative and persistence tests together**

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-image-derivative.test.ts __tests__/photo-persistence.test.ts
```

Expected: PASS; local persistence behavior remains unchanged.

- [ ] **Step 5: Commit the derivative layer**

```powershell
git add -- src/features/gifts/gift-image-derivative.ts __tests__/gift-image-derivative.test.ts
git commit -m "fix: create bounded gift photo derivatives"
```

### Task 5: Add authenticated refresh for expired upload URLs

**Files:**
- Modify: `src/server/gifts/repository.ts`
- Modify: `src/server/gifts/shared-publication.ts`
- Modify: `src/app/api/my-gifts/[id]/publish+api.ts`
- Modify: `src/app/api/gifts/invited/[id]/publish+api.ts`
- Modify: `src/app/api/gifts/[token]/publish+api.ts`
- Modify: `src/services/backend/api-client.ts`
- Modify: `docs/backend/API.md`
- Modify: `__tests__/gift-editor-publish-api.test.ts`
- Modify: `__tests__/backend-client.test.ts`

- [ ] **Step 1: Write failing repository and route tests**

Add tests proving:

- publication lookup requires `publicationId + giftId + normalized actor email + unexpired + incomplete`;
- a publication ID belonging to another gift is rejected;
- PATCH rejects unknown, existing-media, duplicate, or negative positions;
- PATCH only returns new signed URLs for requested upload positions;
- PATCH can refresh the cover URL only when the session payload has an uploaded cover;
- owner/editor authorization is rechecked before signing;
- an expired publication returns `409 gift_publication_unavailable`;
- no object key from the request body is trusted.

Use this request shape:

```ts
const response = await PATCH(request("PATCH", {
  publicationId: "publication-1",
  positions: [1, 3],
  cover: true,
}), { id: "gift-1" });

expect(await response.json()).toEqual({
  uploads: [
    { position: 1, uploadUrl: "https://upload.test/one" },
    { position: 3, uploadUrl: "https://upload.test/three" },
  ],
  coverUpload: { uploadUrl: "https://upload.test/cover" },
});
```

- [ ] **Step 2: Confirm the route tests fail**

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-editor-publish-api.test.ts __tests__/backend-client.test.ts
```

Expected: FAIL because PATCH and scoped lookup do not exist.

- [ ] **Step 3: Scope publication lookup to the route gift**

Replace unscoped payload lookup with:

```ts
export async function getGiftPublishPayload(
  db: BackendDatabase,
  sessionId: string,
  giftId: string,
  ownerEmail: string,
  now: string,
): Promise<GiftPublicationPayload | null>;
```

The query must include `eq(giftPublishSessions.giftId, giftId)`. Update every POST/PUT/PATCH caller and every test fixture. This closes cross-gift publication-ID reuse while preserving existing ownership/editor checks.

- [ ] **Step 4: Centralize publication lifetimes and URL refresh validation**

In `shared-publication.ts`, add:

```ts
export const GIFT_PUBLICATION_LIFETIME_MS = 30 * 60_000;

export type RefreshPublishUploadsBody = {
  publicationId?: string;
  positions?: number[];
  cover?: boolean;
};

export function selectRefreshableUploads(
  body: RefreshPublishUploadsBody,
  payload: GiftPublicationPayload,
): { media: GiftPublicationPayload["media"]; cover: GiftPublicationPayload["cover"] | null };
```

Only items with `source !== "existing"` are refreshable. Positions must be unique non-negative integers present in the session payload. Keep R2 upload URLs at 10 minutes; the 30-minute publication lifetime only gives an authenticated client time to refresh them.

- [ ] **Step 5: Add PATCH to all three publication routes**

Each route must:

1. run its existing owner/editor authorization;
2. parse `publicationId`, `positions`, and `cover`;
3. call scoped `getGiftPublishPayload`;
4. call `selectRefreshableUploads`;
5. sign only the server-owned object keys selected from the stored payload;
6. return URLs without object keys or credentials.

Do not create a new publication session and do not extend an existing session when PATCH is called.

- [ ] **Step 6: Add typed client methods**

Add `refreshOwnedGiftPublishUploads`, `refreshInvitedGiftPublishUploads`, and `refreshGiftPublishUploads` returning:

```ts
type RefreshedPublicationUploads = {
  uploads: { position: number; uploadUrl: string }[];
  coverUpload: { uploadUrl: string } | null;
};
```

All methods send PATCH with authentication and only `{ publicationId, positions, cover }`.

- [ ] **Step 7: Document the additive API**

In `docs/backend/API.md`, document POST → direct PUT uploads → optional authenticated PATCH refresh → final PUT. State that PATCH is limited to an unexpired 30-minute session and does not publish or mutate the shared version.

- [ ] **Step 8: Run focused backend tests**

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-editor-publish-api.test.ts __tests__/gift-repository.test.ts __tests__/backend-client.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the refresh API**

```powershell
git add -- src/server/gifts/repository.ts src/server/gifts/shared-publication.ts src/app/api/my-gifts/[id]/publish+api.ts src/app/api/gifts/invited/[id]/publish+api.ts src/app/api/gifts/[token]/publish+api.ts src/services/backend/api-client.ts docs/backend/API.md __tests__/gift-editor-publish-api.test.ts __tests__/backend-client.test.ts
git commit -m "fix: refresh expired gift upload URLs"
```

### Task 6: Add bounded, retryable file upload orchestration

**Files:**
- Create: `src/features/gifts/publication-uploader.ts`
- Create: `__tests__/publication-uploader.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Use an injected transport rather than real R2. Cover:

```ts
expect(maximumObservedConcurrency).toBe(2);
expect(refreshUploads).toHaveBeenCalledWith({
  publicationId: "publication-1",
  positions: [1],
  cover: false,
});
expect(uploadFile).toHaveBeenLastCalledWith(expect.objectContaining({
  url: "https://upload.test/refreshed-1",
}));
```

Test the following response classes:

- network exception, 408, 429, and 5xx: retry at most twice with injected delays;
- 401/403 from R2: refresh that exact URL once, then retry;
- other 4xx: fail immediately with the affected photo number;
- cover failure: identify the cover explicitly;
- any permanent failure: do not call the final publication callback;
- progress moves monotonically from 0 to total and never reports completion early.

- [ ] **Step 2: Confirm the test fails**

```powershell
npx jest --runInBand --runTestsByPath __tests__/publication-uploader.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement a transport-neutral worker pool**

Use this public contract:

```ts
export type PublicationUploadFile = {
  kind: "media" | "cover";
  position?: number;
  uri: string;
  contentType: string;
  uploadUrl: string;
};

export async function uploadPublicationFiles(input: {
  publicationId: string;
  files: PublicationUploadFile[];
  uploadFile: (file: PublicationUploadFile) => Promise<{ status: number }>;
  refreshUploads: (selection: { publicationId: string; positions: number[]; cover: boolean }) => Promise<RefreshedPublicationUploads>;
  delay?: (milliseconds: number) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
}): Promise<void>;
```

Start exactly `Math.min(2, files.length)` workers. Use retry delays of 300 ms and 900 ms. Never log signed URLs, local file paths, tokens, or response bodies.

- [ ] **Step 4: Add the native file transport**

The production adapter uses `FileSystem.uploadAsync` with `BINARY_CONTENT`, PUT, and the derivative content type. It returns only the numeric status to the orchestrator.

- [ ] **Step 5: Run the orchestration tests**

```powershell
npx jest --runInBand --runTestsByPath __tests__/publication-uploader.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the uploader**

```powershell
git add -- src/features/gifts/publication-uploader.ts __tests__/publication-uploader.test.ts
git commit -m "fix: retry gift uploads with bounded concurrency"
```

### Task 7: Integrate the shared publication pipeline into owner and editor flows

**Files:**
- Modify: `src/app/gifts/[id].tsx`
- Modify: `src/features/gifts/shared-album-editor.tsx`
- Modify: `__tests__/gift-owner-management.test.tsx`
- Modify: `__tests__/gift-shared-editor.test.tsx`

- [ ] **Step 1: Extend owner publication tests before implementation**

Add a local album containing a legacy `photoUri`, top-level cover, layout cover, two Canvas image elements sharing one URI, and a second distinct Canvas photo. Assert:

- every unique URI is converted once, serially;
- the POST payload contains derivative byte sizes/content types;
- no local URI appears in page JSON;
- the same URI used twice maps to the same media position;
- upload concurrency is delegated to `uploadPublicationFiles`;
- a selected `Memory.coverImage` that is not present in any page is converted and uploaded as the cover;
- a selected cover URI that is already among page sources is converted once and the derivative is reused for the separate cover upload;
- temporary files are removed in `finally` after both success and failure;
- the original source URIs are unchanged in `mockMemories()`.

- [ ] **Step 2: Extend shared editor tests before implementation**

Assert existing `mediaId` items remain references, while only newly added local images become derivatives. Retain the existing version-conflict, access-revocation, and active-page restoration assertions. Replace the test that requires one-at-a-time raw Blob uploads with bounded derivative upload assertions.

- [ ] **Step 3: Confirm the integration tests fail**

```powershell
npx jest --runInBand --runTestsByPath __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx
```

Expected: FAIL on missing Canvas media, missing derivatives, or missing uploader calls.

- [ ] **Step 4: Replace owner-only media extraction**

Remove `sharedPage`, the `selectedMemory.pages.filter(page => page.photoUri)` path, and direct upload loops from `src/app/gifts/[id].tsx`. The new flow is:

```ts
const sources = collectPublicationSources(selectedMemory.pages);
const derivatives: GiftImageDerivative[] = [];
try {
  for (const source of sources) {
    derivatives.push(await createGiftImageDerivative(source.uri, imageContentType(source.uri)));
  }
  const selectedCoverDerivative = selectedCoverUri
    ? derivatives[sources.findIndex(source => source.uri === selectedCoverUri)]
      ?? await createGiftImageDerivative(selectedCoverUri, imageContentType(selectedCoverUri))
    : null;
  if (selectedCoverDerivative && !derivatives.includes(selectedCoverDerivative)) {
    derivatives.push(selectedCoverDerivative);
  }
  const references = sources.map((source, position) => ({ ...source, position }));
  const pages = snapshotPagesForPublication(selectedMemory.pages, references);
  // POST page-media and selected-cover derivative metadata, upload with the
  // shared uploader, then perform the final PUT.
} finally {
  await removeGiftImageDerivatives(derivatives);
}
```

Update the visible message during derivative creation and upload using counts only, for example `正在优化照片 2/8…` and `正在上传照片 3/8…`.

- [ ] **Step 5: Replace shared-editor Blob handling**

Keep existing `mediaId` sources untouched. Process newly added local sources one at a time into cache derivatives and upload them through the same uploader. If the current shared cover must be re-uploaded, download it to cache, create the same bounded derivative, and delete both download and derivative in `finally`; do not hold the entire cover as a JavaScript `Blob`.

- [ ] **Step 6: Wire URL refresh by role**

The local owner supplies `refreshOwnedGiftPublishUploads`. The shared editor chooses `refreshOwnedGiftPublishUploads` for `album.role === "owner"` and `refreshInvitedGiftPublishUploads` for an activated editor. Preserve 403 access-loss handling and 409 version-conflict handling.

- [ ] **Step 7: Improve actionable errors without leaking data**

Map failures to these stable user messages:

```ts
gift_photo_prepare_failed: "第 N 张照片无法处理，请重新选择后再试。"
gift_photo_upload_failed: "第 N 张照片上传失败，请检查网络后重试。"
gift_cover_upload_failed: "封面上传失败，请检查网络后重试。"
gift_publication_unavailable: "本次发布已超时，请重新发布；当前共享版本未改变。"
gift_upload_incomplete: "部分照片尚未完整上传，请重新发布；当前共享版本未改变。"
```

Do not show signed URLs, object keys, local paths, tokens, or raw R2 bodies.

- [ ] **Step 8: Run all publication-focused tests**

```powershell
npx jest --runInBand --runTestsByPath __tests__/publication-snapshot.test.ts __tests__/gift-image-derivative.test.ts __tests__/publication-uploader.test.ts __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx __tests__/gift-editor-publish-api.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the integration**

```powershell
git add -- src/app/gifts/[id].tsx src/features/gifts/shared-album-editor.tsx __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx
git commit -m "fix: publish compressed complete gift albums"
```

### Task 8: Make PDF capture load-aware and lower-memory

**Files:**
- Modify: `src/features/canvas/canvas-page.tsx`
- Modify: `src/features/canvas/canvas-element.tsx`
- Modify: `src/features/export/page-capture-provider.tsx`
- Modify: `src/features/export/share-action-sheet.ts`
- Create: `__tests__/page-capture-provider.test.tsx`
- Modify: `__tests__/canvas-page.test.tsx`
- Modify: `__tests__/share-action-sheet.test.ts`

- [ ] **Step 1: Write failing canvas asset-readiness tests**

Add an optional callback shared by `CanvasPage` and `CanvasElement`:

```ts
type CanvasAssetEvent = {
  id: string;
  outcome: "displayed" | "error";
};

onAssetEvent?: (event: CanvasAssetEvent) => void;
```

Tests must fire `expo-image` `onDisplay`/`onError` for the cover, user image, sticker, frame, and bundled background. Assert each rendered raster has a stable unique asset ID and reports exactly once per mount. Normal editor/reader callers that omit the callback must remain unchanged.

- [ ] **Step 2: Write failing provider tests**

Use fake timers and a mocked `captureRef`. Assert:

- `captureRef` is not called before every expected asset reports `displayed`;
- after all assets report, capture is called with `{ width: 720, height: 960, format: "jpg", quality: 0.8, result: "data-uri" }`;
- a Canvas layout with no raster assets captures after the two composition frames without waiting for the timeout;
- any asset error rejects with `第 N 页有图片无法加载，PDF 未生成`;
- a 10-second per-page timeout rejects rather than capturing blank content;
- later pages are not attempted after failure;
- all-text/no-layout legacy pages remain eligible for HTML rendering.

- [ ] **Step 3: Confirm the tests fail**

```powershell
npx jest --runInBand --runTestsByPath __tests__/canvas-page.test.tsx __tests__/page-capture-provider.test.tsx __tests__/share-action-sheet.test.ts
```

Expected: FAIL because readiness events and JPEG capture are not implemented.

- [ ] **Step 4: Implement stable raster asset IDs**

Export a pure helper from `canvas-page.tsx`:

```ts
export function listCanvasRasterAssetIds(layout: CanvasLayout): string[];
```

Return IDs for the resolved background, layout cover, image elements, valid stickers, and valid frames. Wire every corresponding `expo-image` to `onDisplay` and `onError`. `ImageElement` must retain its normal editor placeholder behavior while additionally reporting export failure through the optional callback.

- [ ] **Step 5: Replace the fixed 100ms timer with readiness state**

For each page, reset displayed/error sets when the page ID changes. Capture only after the displayed set equals `listCanvasRasterAssetIds(layout)`, then wait two `requestAnimationFrame` ticks for native composition. Use a 10-second timeout solely as an error boundary, not as permission to capture.

Replace the old capture constants with:

```ts
const PDF_CAPTURE_SCALE = 2;
const PDF_CAPTURE_QUALITY = 0.80;
const PDF_PAGE_ASSET_TIMEOUT_MS = 10_000;
```

Capture as JPEG data URI at 720×960.

- [ ] **Step 6: Remove the unsafe layout fallback**

Change `capturePagesAsImages` to return `string | null` only where `null` means a page genuinely has no Canvas layout. A layout-page capture or asset failure rejects the entire operation. In `share-action-sheet.ts`, remove the catch that converts a capture failure into “all HTML fallback” and remove `pageToHtml` handling for Canvas layouts with local image URIs.

- [ ] **Step 7: Add an encoded-data safety check**

Before calling `Print.printToFileAsync`, sum the JPEG data URI string lengths. Use:

```ts
const MAX_PDF_ENCODED_IMAGE_CHARACTERS = 32 * 1024 * 1024;
```

If exceeded, throw `这本旅行册页数或图片内容过多，暂时无法一次导出 PDF。请减少册页后重试。` Do not call the printer or share sheet after this error.

- [ ] **Step 8: Run PDF and canvas regression tests**

```powershell
npx jest --runInBand --runTestsByPath __tests__/canvas-page.test.tsx __tests__/page-capture-provider.test.tsx __tests__/share-action-sheet.test.ts __tests__/memory-book-cover-canvas.test.tsx
```

Expected: PASS; PDF capture is load-aware, 720×960 JPEG, and never silently partial.

- [ ] **Step 9: Commit the PDF reliability change**

```powershell
git add -- src/features/canvas/canvas-page.tsx src/features/canvas/canvas-element.tsx src/features/export/page-capture-provider.tsx src/features/export/share-action-sheet.ts __tests__/canvas-page.test.tsx __tests__/page-capture-provider.test.tsx __tests__/share-action-sheet.test.ts
git commit -m "fix: prevent missing photos in PDF exports"
```

### Task 9: Verify safety, compatibility, and real-device behavior

**Files:**
- Modify only if a failing check demonstrates a scoped defect.
- Record staging evidence in the approved rehearsal/issue location; do not include tokens, emails, local paths, signed URLs, or photo contents.

- [ ] **Step 1: Review the final diff against scope**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: only the files named in this plan are changed; no administrator gift-card work, generated PDF, test photo, cache file, secret, or deployment artifact is included.

- [ ] **Step 2: Run clean dependency verification**

```powershell
npm ci
npm run check:lockfile
```

Expected: exit code 0.

- [ ] **Step 3: Run all required local gates**

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

Expected: all commands exit 0. The server build is mandatory because the plan changes Expo dependencies and API routes.

- [ ] **Step 4: Run Expo compatibility diagnostics**

```powershell
npx expo-doctor@latest
```

Expected: no dependency-version mismatch involving `expo-image-manipulator`, `expo-image`, `expo-file-system`, `expo-print`, or `react-native-view-shot`.

- [ ] **Step 5: Perform iPhone PDF staging checks**

On an approved iPhone staging build, create local albums whose source files total approximately 10 MB, 20 MB, and 40–50 MB. For each:

1. record the local album photo count and page count, not the image content;
2. export PDF twice;
3. verify PDF page count, expected photo count on every page, ordering, cover/background/stickers/frames, and readable text;
4. verify no partial PDF is shared when one local test photo is deliberately made unavailable;
5. verify the local source URIs, sizes, and checksums are unchanged after export.

Expected: complete PDFs or explicit page-specific failure; never a successful share containing a missing photo.

- [ ] **Step 6: Perform iPhone gift publication staging checks**

Using only approved staging gifts/accounts:

1. publish the same 10 MB, 20 MB, and 40–50 MB source albums;
2. include a page with two Canvas photos and a separate layout cover;
3. verify progress reaches the correct unique-media count;
4. read the shared album as owner and activated viewer and compare page/image counts and placement;
5. inject one transient upload failure and one expired signed URL through the test adapter/staging proxy, confirming retry/refresh succeeds;
6. force a permanent failure and confirm the previous shared version remains readable;
7. verify local original checksums remain unchanged and cache derivatives are deleted.

Expected: successful complete publications under normal/recoverable conditions; safe non-publication on permanent failure.

- [ ] **Step 7: Verify backward-compatible deployment order**

Before any client distribution, deploy only after separate approval and verify the server POST/PUT behavior used by the previous client still passes. Then verify PATCH refresh with a staging publication. A production deployment, TestFlight build, or distribution remains a separate explicit approval and is not authorized by this plan.

- [ ] **Step 8: Final requirement audit**

Confirm in the final handoff:

- local originals unchanged;
- PDF quality lower and complete;
- gift copies moderately compressed and complete;
- upload refresh remains authenticated and short-lived;
- no unrelated changes;
- exact automated commands and device scenarios passed or remained blocked.

### Rollback

- No database migration means rollback does not require data conversion.
- The additive PATCH endpoint may remain deployed safely if the client is rolled back.
- If the new client must be rolled back, existing POST/PUT publishing and already-published R2 objects remain compatible.
- Never delete or rewrite local originals during rollback.
- Failed or superseded publication sessions remain subject to existing maintenance cleanup; do not manually delete broad R2 prefixes.

