# Resumable Gift Album Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every gift album inside the documented product envelope publish reliably by replacing the current 15-second serial finalization bottleneck with bounded parallel promotion, resumable/idempotent finalization, and client-side finalize-only retry.

**Architecture:** Keep the existing private R2 upload and atomic database version switch. Uploaded temporary objects are promoted to deterministic session-scoped final keys with a four-worker pool; already-valid final objects are reused, transient object-store failures retry per object, and an incomplete request returns a stable retryable response without changing the visible album. The publish session stores its completion result so a repeated PUT returns the same success after a lost response. Clients retry only the final PUT, never re-optimize or re-upload photos that are already present.

**Tech Stack:** Expo SDK 57, React Native, Expo Router API routes, PostgreSQL/Drizzle, Cloudflare R2, Jest, Railway staging.

---

## Confirmed failure and fixed boundaries

- The observed staging request created the publication successfully and uploaded all photo objects. Its final `PUT /publish` failed with HTTP 500 after about 15.8 seconds.
- `src/server/gifts/shared-publication.ts` currently copies and verifies every object serially under one 15-second album-wide budget. The timing and response match that budget expiring; this is not evidence that the phone failed to upload the last photo.
- Supported contract remains unchanged: at most 100 pages, 50 distinct media entries, an optional cover, and 25 MB per uploaded object. The client continues to generate derivatives with a maximum long edge of 2560 px and JPEG quality 0.82 where applicable.
- “Reliable” means: inside that contract, temporary cloud/network errors are retried; interrupted finalization resumes from verified objects; a duplicate final request is idempotent; and failure never replaces the currently published version. Permanent loss of connectivity, disabled sharing, revoked access, expired sessions, malformed media, or an unavailable cloud provider must surface an accurate recoverable/error state rather than a false success.
- Local originals remain unchanged. No automatic upload, public bucket, client secret, analytics service, payment feature, or new third-party provider is added.
- Implement from the latest remote `main`, which includes the administrator gift-card metadata work. Do not base the implementation on the older `codex/testflight-1.1.4` release snapshot.

## Acceptance criteria

1. A publication with 50 valid media objects plus cover does not fail because total copy-and-HEAD work exceeds 15 seconds.
2. Promotion runs with a measured maximum concurrency of four; it does not launch an unbounded number of R2 operations.
3. Each final object key is deterministic for one publication session. On retry, matching existing final objects are skipped; missing or mismatched objects are copied and verified again.
4. Transient copy/metadata failures retry per object with bounded backoff. When the request still cannot finish, the API returns HTTP 503 with code `gift_publication_retryable` and `Retry-After`, not a generic 500.
5. Retrying the same successful publication PUT returns the original `{ albumId }` and does not create another album version.
6. The iOS client retries only finalization. It does not optimize or upload the same photos again after upload progress has reached the final photo.
7. Owner, invited editor, and token-based publication routes share the same behavior and authorization checks.
8. A failed, timed-out, conflicting, expired, or revoked publication leaves the previous shared album readable and unchanged. Unreferenced partial final objects remain covered by durable cleanup.
9. Logs expose phase, count, duration, outcome, and stable error code only; they do not expose emails, gift/session IDs, object keys, URLs, tokens, or media content.
10. Focused tests, migration tests, `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build:server`, Railway staging verification, and physical-iPhone development-build checks pass before any new TestFlight submission.

## Rollout and rollback

- Deploy the backward-compatible server and migration first. Old clients continue using the same POST/PUT contract.
- Verify database migration and server health before testing a development build. Do not deploy to production as part of this work.
- The client recognizes the new 503 code only after the server supports it; old clients merely show their existing retry UI.
- Rollback is server-first and safe because publication visibility changes only inside the final database transaction. If rollback is needed, stop distributing the new client and redeploy the previous server; nullable completion-receipt columns can remain in place.
- A new TestFlight build, App Store Connect upload, tester-group change, or production deployment requires separate explicit approval.

---

### Task 1: Record the reliability decision and reproduce the regression

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `__tests__/gift-editor-publish-api.test.ts`
- Reference: `src/server/gifts/shared-publication.ts`

- [ ] **Step 1: Record the new behavior before functional changes**

Add a dated entry to `docs/DECISIONS.md` stating the supported envelope, deterministic resumable promotion, four-worker limit, per-object transient retry, idempotent completion receipts, old-version preservation, private storage, and server-first staging rollout. Explicitly state that this supersedes only the serial 15-second promotion behavior from the earlier large-album plan; image derivative quality and limits stay unchanged.

- [ ] **Step 2: Add a failing slow-store regression test**

In `__tests__/gift-editor-publish-api.test.ts`, use fake timers and a media-store double whose `copyObject` and `getObjectMetadata` each wait a controlled duration. Prepare 20 new media objects plus a cover so serial work crosses 15 seconds while four-worker work remains within the new request budget.

Assert before implementation:

```ts
await expect(promoteSharedPublicationDurably(input)).resolves.toHaveLength(21);
expect(store.maxConcurrentOperations).toBeGreaterThan(1);
expect(store.maxConcurrentOperations).toBeLessThanOrEqual(4);
```

- [ ] **Step 3: Add failing resumability tests**

Cover these cases with deterministic metadata fixtures:

```ts
expect(store.copyCalls).not.toContainEqual(alreadyVerifiedFinalKey);
expect(store.copyCalls).toContainEqual(missingFinalKey);
expect(store.copyAttemptsByKey.get(transientFailureKey)).toBe(2);
```

Also assert that a permanent transient failure is classified as `gift_publication_retryable`, while content-type or byte-size mismatch remains `gift_upload_incomplete` and is not retried as a transient outage.

- [ ] **Step 4: Confirm the tests fail for the intended reason**

Run:

```powershell
npx jest __tests__/gift-editor-publish-api.test.ts --runInBand
```

Expected before implementation: the slow-store case aborts at the existing 15-second total budget, final keys differ between attempts, and no stable retryable error exists.

- [ ] **Step 5: Commit the documentation and red tests**

```powershell
git add docs/DECISIONS.md __tests__/gift-editor-publish-api.test.ts
git commit -m "test: reproduce gift publication finalization timeout"
```

---

### Task 2: Implement deterministic, bounded, resumable promotion

**Files:**
- Modify: `src/server/gifts/shared-publication.ts`
- Modify: `__tests__/gift-editor-publish-api.test.ts`
- Modify: `__tests__/account-deletion-repository.test.ts`

- [ ] **Step 1: Replace random attempt keys with session-stable keys**

Pass `sessionId` into the promotion planner and derive each destination from the existing session-scoped temporary key:

```ts
function finalObjectKey(source: string, sessionId: string): string {
  const marker = `/publications/${sessionId}/temp/`;
  if (!source.includes(marker)) {
    throw new ApiError(409, "gift_upload_incomplete", "Uploaded media does not belong to this publication");
  }
  return source.replace(marker, `/publications/${sessionId}/final/`);
}
```

Validate the actual stored-key format in existing tests before using the exact marker. The essential invariant is one destination per `(publicationId, source position)`, with no random attempt segment.

- [ ] **Step 2: Add a typed retryable promotion error**

```ts
export class GiftPublicationRetryableError extends Error {
  readonly code = "gift_publication_retryable";
  constructor(message = "Gift publication finalization can be retried") {
    super(message);
    this.name = "GiftPublicationRetryableError";
  }
}
```

Only object-store aborts, timeouts, and transient copy/metadata exceptions become this error. Authorization, expiry, version conflict, and metadata mismatch keep their existing stable codes.

- [ ] **Step 3: Implement verify-or-copy per object**

For each planned object:

1. HEAD the deterministic final key.
2. If content type and byte size match the publication payload, mark it complete without copying.
3. If absent or mismatched, copy from the temporary object and HEAD the result.
4. Treat a post-copy metadata mismatch as `gift_upload_incomplete`.

Use a small internal retry helper with three total attempts and abort-aware delays of 250 ms and 750 ms. Do not retry `ApiError` validation failures.

- [ ] **Step 4: Execute objects through a four-worker pool**

Use a shared index and four async workers rather than `Promise.all` over all media:

```ts
const promotionConcurrency = 4;
let next = 0;
const workers = Array.from({ length: Math.min(promotionConcurrency, items.length) }, async () => {
  while (next < items.length) {
    const item = items[next++];
    await verifyOrCopyPromotionObject(store, item, signal);
  }
});
await Promise.all(workers);
```

Use one generous request safety budget of 120 seconds to avoid orphaned requests, but make per-object retries and resumability the reliability mechanism. On budget expiry, throw `GiftPublicationRetryableError`. Do not delete verified final objects on this retryable path; durable cleanup rows already protect eventual cleanup and are required for resume.

- [ ] **Step 5: Preserve durable cleanup and atomic publication**

Keep `reserveGiftPublicationPromotion` before any copy. Confirm maintenance still checks `isGiftMediaObjectReferenced` before deletion, so successfully published objects are retained while abandoned partial objects are eventually removed.

On database conflict/unavailable after promotion, keep existing safe cleanup behavior. Do not mutate payload object keys until every planned object verifies successfully.

- [ ] **Step 6: Make the focused promotion tests pass**

Run:

```powershell
npx jest __tests__/gift-editor-publish-api.test.ts __tests__/account-deletion-repository.test.ts --runInBand
```

Expected: slow 20-object and maximum 50-object fixtures complete; concurrency is 1–4; retry skips verified final keys; permanent transient failure remains retryable; metadata mismatch remains non-retryable.

- [ ] **Step 7: Commit the promotion executor**

```powershell
git add src/server/gifts/shared-publication.ts __tests__/gift-editor-publish-api.test.ts __tests__/account-deletion-repository.test.ts
git commit -m "fix: make gift publication promotion resumable"
```

---

### Task 3: Persist an idempotent completion receipt

**Files:**
- Create: `drizzle/0016_gift_publish_completion_receipt.sql` (use the next available migration number after rebasing latest `main`)
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/gifts/repository.ts`
- Modify: `__tests__/backend-migrations.test.ts`
- Modify: `__tests__/migration-integrity.test.ts`
- Modify: `__tests__/gift-editor-publish-api.test.ts`

- [ ] **Step 1: Add failing migration and repository tests**

Require nullable `completed_album_id` and `completed_album_version` columns on `gift_publish_sessions`. Add a repository test that calls finalization twice with the same completed session and expects the same receipt without another version change.

```ts
expect(first).toEqual({ status: "success", albumId, version: baseVersion + 1 });
expect(second).toEqual(first);
expect(albumVersionWrites).toBe(1);
```

- [ ] **Step 2: Confirm the new tests fail**

```powershell
npx jest __tests__/backend-migrations.test.ts __tests__/migration-integrity.test.ts __tests__/gift-editor-publish-api.test.ts --runInBand
```

Expected: schema columns and completed-session lookup do not yet exist.

- [ ] **Step 3: Add the nullable completion columns**

Create the migration:

```sql
ALTER TABLE "gift_publish_sessions" ADD COLUMN "completed_album_id" text;
ALTER TABLE "gift_publish_sessions" ADD COLUMN "completed_album_version" integer;
ALTER TABLE "gift_publish_sessions" ADD CONSTRAINT "gift_publish_sessions_completed_album_id_shared_albums_id_fk"
  FOREIGN KEY ("completed_album_id") REFERENCES "public"."shared_albums"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
```

Mirror the columns and relation in `src/server/db/schema.ts`. Generate/update Drizzle metadata using the repository's established migration workflow; do not hand-edit a snapshot inconsistently.

- [ ] **Step 4: Store and read the receipt atomically**

Inside `completeGiftPublishSession`, set `completedAt`, `completedAlbumId`, and `completedAlbumVersion` in the same transaction that switches the visible album.

Before rejecting a completed session, read its receipt under the existing row lock. Return:

```ts
{ status: "success", albumId: completedAlbumId, version: completedAlbumVersion, replayed: true }
```

An active expired session remains unavailable. A completed row without a receipt is a legacy completed session and remains unavailable rather than guessing a result.

- [ ] **Step 5: Verify exactly-once behavior under concurrent PUTs**

Add a test with two finalization calls for the same session. Assert one album version increment, both responses use the same album ID, and the loser does not delete the winner's referenced final objects.

- [ ] **Step 6: Run migration and repository tests**

```powershell
npx jest __tests__/backend-migrations.test.ts __tests__/migration-integrity.test.ts __tests__/gift-editor-publish-api.test.ts --runInBand
```

- [ ] **Step 7: Commit the completion receipt**

```powershell
git add drizzle src/server/db/schema.ts src/server/gifts/repository.ts __tests__/backend-migrations.test.ts __tests__/migration-integrity.test.ts __tests__/gift-editor-publish-api.test.ts
git commit -m "feat: make gift publication completion idempotent"
```

---

### Task 4: Return a stable retry contract from every publish route

**Files:**
- Modify: `src/app/api/my-gifts/[id]/publish+api.ts`
- Modify: `src/app/api/gifts/invited/[id]/publish+api.ts`
- Modify: `src/app/api/gifts/[token]/publish+api.ts`
- Modify: `src/server/gifts/shared-publication.ts`
- Modify: `__tests__/gift-editor-publish-api.test.ts`
- Modify: `src/services/backend/user-facing-error.ts`

- [ ] **Step 1: Add failing route-contract tests**

For owner, invited editor, and token routes, make promotion throw `GiftPublicationRetryableError` and assert:

```ts
expect(response.status).toBe(503);
expect(response.headers.get("Retry-After")).toBe("2");
await expect(response.json()).resolves.toMatchObject({
  error: { code: "gift_publication_retryable" },
});
```

Also assert unknown programming errors still return 500 and validation failures keep their current 409 codes.

- [ ] **Step 2: Add one shared error mapper**

Export a narrow helper from the gift publication module, or add a gift-specific API helper, that maps only the typed retryable error to 503 and attaches `Retry-After: 2`. Apply it identically to all three routes so owner/editor/token behavior cannot drift.

- [ ] **Step 3: Add privacy-safe phase logging**

Emit one completion record per final PUT with fields equivalent to:

```ts
{
  event: "gift_publication_finalize",
  outcome: "success" | "retryable" | "conflict" | "invalid" | "internal_error",
  mediaCount,
  resumedCount,
  copiedCount,
  attemptCount,
  durationMs,
  errorCode,
}
```

Do not log identifiers, emails, object keys, signed URLs, tokens, payload JSON, filenames, or exception objects. Tests must stringify captured log arguments and assert known sensitive fixture values are absent.

- [ ] **Step 4: Add the Chinese user-facing fallback**

In `src/services/backend/user-facing-error.ts` add:

```ts
gift_publication_retryable: "照片已上传，正在重试完成发布。",
```

- [ ] **Step 5: Run the focused API tests**

```powershell
npx jest __tests__/gift-editor-publish-api.test.ts --runInBand
```

- [ ] **Step 6: Commit the API contract**

```powershell
git add src/app/api src/server/gifts/shared-publication.ts src/services/backend/user-facing-error.ts __tests__/gift-editor-publish-api.test.ts
git commit -m "fix: expose retryable gift publication finalization"
```

---

### Task 5: Retry finalization without re-uploading photos

**Files:**
- Create: `src/features/gifts/finalize-publication.ts`
- Create: `__tests__/gift-publication-finalizer.test.ts`
- Modify: `src/app/gifts/[id].tsx`
- Modify: `src/features/gifts/shared-album-editor.tsx`
- Modify: `__tests__/gift-owner-management.test.tsx`
- Modify: `__tests__/gift-shared-editor.test.tsx`

- [ ] **Step 1: Add failing orchestration tests**

Test a helper that receives the already-created `publicationId` and a finalization callback. Required cases:

- 503 `gift_publication_retryable`, then success: finalization is called twice; optimize and upload callbacks are not called again.
- network exception, then success: same behavior.
- three retryable failures: helper returns a retryable state containing the same `publicationId`.
- 409 expiry, access revocation, upload incomplete, or version conflict: no automatic retry.
- cancellation/unmount: scheduled delay is aborted and no state update occurs.

- [ ] **Step 2: Confirm the helper tests fail**

```powershell
npx jest __tests__/gift-publication-finalizer.test.ts --runInBand
```

- [ ] **Step 3: Implement finalize-only retry**

Create a dependency-injected helper with three total attempts and delays of 500 ms then 1500 ms. Retry only `gift_publication_retryable` and transport errors for which no HTTP response was received. Preserve the same publication ID for every call.

Return a discriminated result instead of throwing retry exhaustion:

```ts
type FinalizeResult =
  | { status: "success"; albumId: string }
  | { status: "retryable"; publicationId: string };
```

- [ ] **Step 4: Integrate owner and shared-editor screens**

After upload progress reaches the final object, change the message to `照片已上传，正在完成发布…` and call the helper. While finalization is retrying, keep upload progress intact and disable duplicate publish taps.

If automatic retries are exhausted, show `照片已上传，但云端暂时未完成发布。请重试完成发布。` and a `重试完成发布` action that invokes only the saved finalization callback with the same in-memory publication ID. Do not rerun media collection, optimization, POST preparation, or signed PUT uploads.

Clear the pending finalization state on success, explicit cancellation, expiry, logout/account change, gift change, or authorization error. Do not persist signed upload URLs or photo paths.

- [ ] **Step 5: Verify UI behavior**

In both existing screen test files, assert:

```ts
expect(mockUploadPublicationFiles).toHaveBeenCalledTimes(1);
expect(mockFinishOwnedGiftPublish).toHaveBeenCalledTimes(2);
expect(screen.getByText("照片已上传，正在完成发布…")).toBeTruthy();
```

Cover the invited-editor finalizer as well as the local owner route.

- [ ] **Step 6: Run the client-focused suite**

```powershell
npx jest __tests__/gift-publication-finalizer.test.ts __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx --runInBand
```

- [ ] **Step 7: Commit the client retry flow**

```powershell
git add src/features/gifts/finalize-publication.ts src/app/gifts/[id].tsx src/features/gifts/shared-album-editor.tsx __tests__/gift-publication-finalizer.test.ts __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx
git commit -m "fix: retry gift publication without reuploading photos"
```

---

### Task 6: Complete local verification and review the final diff

**Files:**
- Review: all changed files
- Update if required: `docs/EXECUTION-CHECKLIST.md`

- [ ] **Step 1: Run the focused regression set once more**

```powershell
npx jest __tests__/gift-editor-publish-api.test.ts __tests__/gift-publication-finalizer.test.ts __tests__/gift-owner-management.test.tsx __tests__/gift-shared-editor.test.tsx __tests__/backend-migrations.test.ts __tests__/migration-integrity.test.ts __tests__/account-deletion-repository.test.ts --runInBand
```

- [ ] **Step 2: Run the required project gates**

From a clean dependency state when the implementation branch is ready:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

Expected: all commands exit 0. Record exact totals and duration; do not describe an unrun check as passing.

- [ ] **Step 3: Inspect scope and security**

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/server/gifts src/app/api src/features/gifts src/app/gifts src/server/db drizzle docs __tests__
```

Confirm there are no unrelated administrator UI edits, dependencies, secrets, production endpoints, public-bucket changes, or local-original mutations in this branch.

- [ ] **Step 4: Verify cleanup and old-version safety explicitly**

Use automated tests to prove that a mid-promotion retryable failure leaves the previous album version and media readable, the publish session active until expiry, and partial final objects registered for cleanup. Confirm referenced final objects survive maintenance after success.

- [ ] **Step 5: Commit any verification-only corrections**

If verification requires a code correction, add a regression test first, implement the minimum correction, rerun the affected focused test and all required gates, then commit the correction separately.

---

### Task 7: Deploy server-first to staging and validate on a physical iPhone

**Files:**
- Update evidence: `docs/EXECUTION-CHECKLIST.md` or the active staging operations record

- [ ] **Step 1: Merge through a pull request only after approval**

Push the implementation branch and open a PR against `main`. Require GitHub checks for clean install, lint, typecheck, full tests, and server build. Do not force-push or merge a failing PR.

- [ ] **Step 2: Verify the staging migration and deployment**

After the approved merge triggers Railway staging, confirm the deployed commit SHA, service health, schema version, and presence of the two nullable receipt columns. Confirm production was not touched.

- [ ] **Step 3: Exercise the retry path safely**

Against staging only, use a controlled test double or temporary staging-only fault injection already covered by authorization to make one copy/HEAD operation fail transiently. Confirm the same PUT resumes and succeeds, one album version is created, and privacy-safe logs contain no identifiers.

- [ ] **Step 4: Run the physical-iPhone development-build matrix**

Use representative albums within the supported envelope:

| Case | Media | Approx. uploaded total | Expected |
|---|---:|---:|---|
| Small | 1 | under 10 MB | publishes once |
| Typical | 10 | 10–20 MB | publishes once |
| Large | 30 | 20–40 MB | publishes once |
| Maximum count | 50 + cover | 40–50 MB | completes or transparently resumes; no generic 500 |

For each case verify: progress reaches the final photo; finalization completes; owner and viewer see the expected photo/page counts; cover renders; the previous album remains readable during failure injection; retry does not repeat optimization/upload; local original URI, byte size, and checksum stay unchanged.

- [ ] **Step 5: Verify interruption scenarios**

During finalization only, background/foreground the app and briefly interrupt connectivity. Confirm automatic or manual `重试完成发布` uses the same publication, succeeds before the 30-minute session expiry, and produces one album version.

- [ ] **Step 6: Record evidence and stop before TestFlight**

Record test device/iOS version, development-build commit, Railway deployment SHA, album sizes/counts, request outcomes/durations, and cleanup result without recording emails, IDs, keys, or URLs. Stop after development-build acceptance and request separate approval before creating or submitting any new TestFlight build.

---

## Final completion checklist

- [ ] Root-cause regression fails before and passes after the change.
- [ ] Maximum supported count passes bounded-concurrency and resume tests.
- [ ] Duplicate successful PUT is idempotent and creates one version.
- [ ] All three authorization routes share the retry contract.
- [ ] The client never re-optimizes/re-uploads after final upload completion.
- [ ] Old published album and local originals remain unchanged on every failure path.
- [ ] Durable cleanup covers abandoned partial final objects.
- [ ] Logs are privacy-safe.
- [ ] All required local/CI gates pass.
- [ ] Railway staging and physical-iPhone development-build matrix pass.
- [ ] No TestFlight, tester-group, or production change occurs without separate approval.
