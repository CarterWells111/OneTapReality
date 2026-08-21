jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///var/mobile/Containers/Data/Application/current/Documents/",
}));

import * as FileSystem from "expo-file-system/legacy";

import {
  MISSING_LOCAL_PHOTO_PREFIX,
  createMissingPhotoToken,
  isMissingPhotoToken,
  rebaseLegacyAccountPhotoUri,
  resolveCanonicalPhotoReference,
  toCanonicalPhotoReference,
} from "../src/features/memories/photo-references";

describe("canonical local photo references", () => {
  const accountKey = "Owner@Example.com";
  const memoryId = "memory-1";
  const canonical = "documents://photos/accounts/owner%40example.com/memory-1/a.jpg";

  it("canonicalizes a current Documents URI and resolves it against the current root", () => {
    expect(toCanonicalPhotoReference(
      "file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/owner%40example.com/memory-1/a.jpg",
      accountKey,
      memoryId,
    )).toBe(canonical);

    expect(resolveCanonicalPhotoReference(canonical, accountKey, memoryId)).toBe(
      "file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/owner%40example.com/memory-1/a.jpg",
    );
  });

  it("rebases an old iOS container URI only when it belongs to the expected account and memory", () => {
    expect(rebaseLegacyAccountPhotoUri(
      "file:///var/mobile/Containers/Data/Application/old-container/Documents/photos/accounts/owner%40example.com/memory-1/a.jpg",
      accountKey,
      memoryId,
    )).toBe("file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/owner%40example.com/memory-1/a.jpg");
  });

  it.each([
    "documents://photos/accounts/owner%40example.com/memory-1/../a.jpg",
    "documents://photos/accounts/other%40example.com/memory-1/a.jpg",
    "documents://photos/accounts/owner%40example.com/other/a.jpg",
    "documents://photos/accounts/owner%40example.com/memory-1/a%2Fb.jpg",
    "documents://photos/accounts/owner%40example.com/memory-1/a\\b.jpg",
    "documents://photos/accounts/owner%40example.com/memory-1/.",
    "documents://photos/accounts/owner%40example.com/memory-1/..",
  ])("rejects an unsafe or cross-owner canonical reference: %s", (reference) => {
    expect(resolveCanonicalPhotoReference(reference, accountKey, memoryId)).toBeNull();
  });

  it("rejects unsafe absolute filenames before canonicalizing", () => {
    expect(toCanonicalPhotoReference(
      "file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/owner%40example.com/memory-1/a%2Fb.jpg",
      accountKey,
      memoryId,
    )).toBeNull();
  });

  it("uses opaque, unique missing-photo tokens that cannot be canonicalized", () => {
    const first = createMissingPhotoToken();
    const second = createMissingPhotoToken();

    expect(first).toMatch(new RegExp(`^${MISSING_LOCAL_PHOTO_PREFIX}`));
    expect(first).not.toBe(second);
    expect(isMissingPhotoToken(first)).toBe(true);
    expect(toCanonicalPhotoReference(first, accountKey, memoryId)).toBeNull();
  });

  it.each(["owner/child", "owner\\child", "owner\0child", ".", "..", "owner%2Fchild", "owner%5Cchild", "owner%2E%2E", "owner%252Fchild"]) 
    ("rejects an account key whose decoded directory segment is unsafe: %s", (unsafeAccountKey) => {
      const accountSegment = encodeURIComponent(unsafeAccountKey.trim().toLowerCase());
      const absolute = `file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/${accountSegment}/memory-1/a.jpg`;
      const canonicalReference = `documents://photos/accounts/${accountSegment}/memory-1/a.jpg`;
      const legacy = `file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/${accountSegment}/memory-1/a.jpg`;

      expect(toCanonicalPhotoReference(absolute, unsafeAccountKey, memoryId)).toBeNull();
      expect(resolveCanonicalPhotoReference(canonicalReference, unsafeAccountKey, memoryId)).toBeNull();
      expect(rebaseLegacyAccountPhotoUri(legacy, unsafeAccountKey, memoryId)).toBeNull();
    });

  it.each(["memory/child", "memory\\child", "memory\0child", ".", "..", "memory%2Fchild", "memory%5Cchild", "memory%2E%2E", "memory%252Fchild"]) 
    ("rejects a memory ID whose decoded directory segment is unsafe: %s", (unsafeMemoryId) => {
      const memorySegment = encodeURIComponent(unsafeMemoryId);
      const absolute = `file:///var/mobile/Containers/Data/Application/current/Documents/photos/accounts/owner%40example.com/${memorySegment}/a.jpg`;
      const canonicalReference = `documents://photos/accounts/owner%40example.com/${memorySegment}/a.jpg`;
      const legacy = `file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/owner%40example.com/${memorySegment}/a.jpg`;

      expect(toCanonicalPhotoReference(absolute, accountKey, unsafeMemoryId)).toBeNull();
      expect(resolveCanonicalPhotoReference(canonicalReference, accountKey, unsafeMemoryId)).toBeNull();
      expect(rebaseLegacyAccountPhotoUri(legacy, accountKey, unsafeMemoryId)).toBeNull();
    });

  it("rejects malformed legacy paths even when their tail otherwise resembles the expected directory", () => {
    expect(rebaseLegacyAccountPhotoUri(
      "file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/owner%40example.com/memory-1/a.jpg/extra",
      accountKey,
      memoryId,
    )).toBeNull();
    expect(rebaseLegacyAccountPhotoUri(
      "file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/other%40example.com/memory-1/a.jpg",
      accountKey,
      memoryId,
    )).toBeNull();
    expect(rebaseLegacyAccountPhotoUri(
      "file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/owner%40example.com/other/a.jpg",
      accountKey,
      memoryId,
    )).toBeNull();
  });

  it("fails closed when the current Documents root is unavailable or malformed", () => {
    const fileSystem = FileSystem as unknown as { documentDirectory: string | null };
    const original = fileSystem.documentDirectory;
    try {
      fileSystem.documentDirectory = null;
      expect(resolveCanonicalPhotoReference(canonical, accountKey, memoryId)).toBeNull();
      fileSystem.documentDirectory = "file:///var/mobile/Containers/Data/Application/current/Documents";
      expect(resolveCanonicalPhotoReference(canonical, accountKey, memoryId)).toBeNull();
    } finally {
      fileSystem.documentDirectory = original;
    }
  });
});
