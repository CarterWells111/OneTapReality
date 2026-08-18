# Relative Local Photo Paths Design

## Problem

Local album photos are copied into `FileSystem.documentDirectory`, but the database currently stores the resulting absolute `file://` URI. An iOS application update can preserve Documents while changing the application container root. The stored URI then contains an obsolete container UUID and no longer resolves even though the file may still exist under the current Documents directory.

The current best-effort migration compounds the problem: a failed copy returns the original stale URI, so the UI silently renders a missing image instead of distinguishing a recoverable moved file from a genuinely missing source.

## Guarantees and boundaries

- Within the same installed application identity and preserved sandbox, normal relaunches and TestFlight/App Store updates must not invalidate album photos.
- Photos remain private local files and stay partitioned by normalized account key and memory ID.
- Logout and account switching do not delete files.
- Permanent album deletion and explicit account-local-data clearing continue to delete the relevant directory.
- Uninstall, device erasure, changing Bundle ID, or a file that was never copied successfully remain outside the guarantee.
- No cloud sync, third-party service, encryption change, or automatic upload is added.

## Stored reference format

The canonical database value is a tagged Documents-relative reference:

```text
documents://photos/accounts/<encodedAccountKey>/<encodedMemoryId>/<fileName>
```

Only paths underneath the expected account/memory directory may be encoded or resolved. Account and memory segments are derived by the application, compared byte-for-byte with the expected encoded values, and rejected when empty, `.` or `..`. A persisted filename must match the application-generated basename grammar, contain no slash, backslash, NUL or percent-decoded separator, and must not be a dot segment. Parsing requires exactly `documents://photos/accounts/<expectedAccount>/<expectedMemory>/<filename>`; it does not rely on a broad string prefix. Delete and cleanup operations reuse the same validated directory builder. Path traversal, another account directory, arbitrary absolute paths, remote URLs, `ph://`, and cache paths are never accepted as canonical persisted references.

Runtime image consumers receive a resolved current absolute URI:

```text
FileSystem.documentDirectory + relativePath
```

The SQLite repository continues to read and write a storage-shaped `Memory` whose photo strings are canonical or legacy stored references; it never sends that object directly to UI. An asynchronous provider-layer codec returns an explicit pair:

```ts
type PhotoHydrationResult = {
  runtimeMemory: Memory;
  storageMemory: Memory;
  changed: boolean;
  unresolved: Array<{
    token: `missing-local-photo://${string}`;
    location: PhotoLocation;
    storedReference: string;
  }>;
};
```

`storageMemory` is the only value passed to repository write functions. `runtimeMemory` is the only value exposed by `MemoriesProvider`. Every resolved photo is a current absolute file URI. Every unresolved photo is replaced in the runtime model by an opaque `missing-local-photo://` token and described by `unresolved`; canonical, stale absolute, picker and cache references never reach an image or upload consumer directly. Canvas/image components recognize only this sentinel scheme and render a local missing-photo treatment without attempting network or filesystem loading.

The provider retains an in-memory token-to-`{storedReference, originalLocation}` baseline for the hydrated memory. Tokens travel with their page/element/photo string when pages are reordered, so provenance does not depend on a mutable array position. On save, a known token is translated back to its original stored reference; an unknown sentinel is rejected. Replacing the image removes the token and the new verified absolute file is canonicalized normally. Therefore unrelated text/layout edits preserve pre-existing missing-photo evidence, while newly introduced temp/external references cannot masquerade as grandfathered data.

`changed` means canonical storage references should be written back. `PhotoLocation` identifies memory cover, memory photo occurrence, page photo by page ID, layout cover by page ID, or layout image by page ID and element ID. This removes ambiguity between database and runtime representations.

All provider reads (`listMemories`, draft lookup, recycle-bin listing and retry) pass through the asynchronous codec before UI exposure. The codec gathers unique references, validates them, and checks files with the existing bounded concurrency of three. The UI readiness flag is set only after hydration finishes, so no canonical `documents://` reference reaches an image component.

## New-photo write flow

1. Resolve an ImagePicker `ph://` reference when necessary.
2. Copy to a newly generated file inside the current account/memory Documents directory.
3. Verify the destination exists and is a file.
4. Return the verified current absolute URI to the editor for immediate rendering. On album save, the provider codec converts that exact account/memory file back to its canonical `documents://...` storage reference while retaining the absolute URI in `runtimeMemory`.
5. If copy or verification fails, delete any partial destination best-effort, show the existing photo-save failure alert, and do not add the image to pages or save the temporary URI.

Album save performs the same strict normalization for every top-level photo, page photo, layout image, and cover image before committing the database transaction. There is no fallback that writes a temporary or stale absolute URI. Files created during a save attempt are tracked; if the database transaction rejects, only newly created, validated, currently unreferenced files from that attempt are removed best-effort. A file already used by the album is never part of compensation cleanup.

## Legacy recovery

For each existing reference during account-scoped hydration:

1. Canonical `documents://` references are validated against the expected account/memory prefix and resolved against the current Documents root.
2. Absolute URIs containing `/Documents/photos/accounts/...` are rebased by extracting that suffix and checking the corresponding file under the current Documents root.
3. Older `/Documents/photos/...` references use the existing account/memory migration copy when the old source still exists; already moved account-scoped suffixes are rebased without copying.
4. External picker/cache/`ph://` references are copied only when still readable.
5. A recovered reference is written back canonically in one account-scoped repository transaction, while the runtime result uses the current absolute URI. Legacy account-scoped suffix extraction is parsed through the same exact account/memory/filename grammar as a canonical reference; there is no separate permissive `startsWith` migration path.
6. If neither the old source nor rebased destination exists, `storageMemory` retains the original reference, `runtimeMemory` uses the opaque missing-photo token, and the typed `unresolved` list records provenance. No destructive cleanup occurs.

Legacy files under the pre-account shared `Documents/photos/...` root are never deleted automatically by account-scoped migration, because another account, draft or recycle-bin row may still reference the same file. Only account-scoped directories created under `photos/accounts/<account>/<memory>/` participate in album/account deletion. A future global legacy cleanup would require a separate full-database, all-account reference scan and is outside this change.

Canonical migration and every album media save use a new owner-checked `replaceMemoryMediaSnapshot` repository operation. One SQLite transaction verifies `id + ownerAccountKey`, then replaces `memory_photos`, `memories.coverImage`, `story_pages.photo_uri` and complete `layout_json` values together. Zero owned rows or any transaction error is failure; no partial canonical migration is reported as successful.

## Error and recovery UX

- Adding a new image fails closed: show “照片保存失败” and keep the editor unchanged.
- Saving an album with an unpersisted new image fails and retains editing state through the existing save-error path.
- Existing unrecoverable images render through the explicit local missing-photo token while their original stored reference remains unchanged; this fix does not claim they were restored.
- Save translates only provider-issued missing tokens back to their baseline stored references. Export and new gift publication are blocked with a clear missing-photo error while any unresolved token is present; an already published cloud snapshot remains readable and unchanged. Save and publish reject any newly introduced external/temp reference that cannot be copied and verified.

## Testing

- Absolute URI with an old container UUID rebases to the current Documents root without copying when the file exists.
- Canonical relative references survive a simulated `documentDirectory` root change.
- Canonical references cannot escape the expected account/memory directory or cross accounts.
- Copy success is not returned until destination existence is verified.
- Copy/verification failure never returns or persists the picker URI and removes partial files best-effort.
- Normalization covers `photoUris`, top-level cover, page photo, layout image elements, and layout cover.
- Repository round-trip stores relative references while UI hydration receives current absolute URIs.
- Legacy missing files remain non-destructive and produce an explicit unresolved result.
- Known unresolved tokens survive page/photo reorder and unrelated edits, unknown tokens are rejected, and no storage/canonical/stale URI reaches render or upload consumers.
- Export and new gift publication reject a memory containing unresolved local photos; existing cloud snapshots remain unchanged.
- Async hydration limits file checks/copies to three concurrent operations and does not expose storage references before readiness.
- Account/memory segments, filename grammar, encoded separators, dot segments and final exact-root containment are validated for encode, resolve and delete paths.
- Account A migrating a shared-root legacy URI never deletes a file still referenced by account B; this change performs no automatic shared-root legacy deletion at all.
- The owner-checked snapshot transaction atomically writes photos, cover, page photos and layouts; injected failures leave the entire previous snapshot intact.
- A database commit failure compensates only attempt-owned generated filenames after a database-wide reference check proves they are unreferenced, and never removes an existing referenced file.
- Delete album/account cleanup still targets only the current account/memory directory.
- Existing local save, shared publish, account isolation, and upgrade-contract tests remain green.
