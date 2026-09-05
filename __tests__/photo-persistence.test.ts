import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";

import {
  ensureMemoryPhotosPersisted,
  deleteAccountPhotoDirectory,
  deleteAccountPhotoDirectoryStrict,
  deleteMemoryPhotoDirectory,
  cleanupMigratedLegacyPhotoUris,
  persistPhotoUri,
  persistPhotoUriStrict,
  persistPhotoUris,
  hydrateMemoryPhotoReferences,
  stagePhotoUriStrict,
} from "../src/features/memories/photo-persistence";
import type { Memory } from "../src/types/memory";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/user/0/com.app/documents/",
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-media-library/legacy", () => ({
  getAssetInfoAsync: jest.fn(async (assetId: string) => ({
    localUri: `file:///tmp/ph-resolved/${assetId}.jpg`,
  })),
}));

const copyAsyncMock = FileSystem.copyAsync as jest.Mock;
const makeDirectoryAsyncMock = FileSystem.makeDirectoryAsync as jest.Mock;
const getAssetInfoAsyncMock = MediaLibrary.getAssetInfoAsync as jest.Mock;
const deleteAsyncMock = FileSystem.deleteAsync as jest.Mock;
const getInfoAsyncMock = FileSystem.getInfoAsync as jest.Mock;

function resetPhotoMocks() {
  jest.clearAllMocks();
  getInfoAsyncMock.mockImplementation(async (uri: string) => ({
    exists: copyAsyncMock.mock.calls.some(([input]) => input.to === uri),
    isDirectory: false,
  }));
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "memory-1",
    title: "旅行",
    city: "hangzhou",
    travelDate: "2026-07-01",
    status: "saved",
    coverColor: "#EFE2CF",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    photoUris: ["file:///data/user/0/com.app/documents/photos/a.jpg"],
    pages: [
      {
        id: "p1",
        position: 0,
        kind: "photo",
        headline: "标题",
        body: "正文",
        photoUri: "file:///data/user/0/com.app/documents/photos/a.jpg",
        layout: {
          aspectRatio: 3 / 4,
          elements: [
            {
              id: "img1",
              type: "image",
              uri: "file:///data/user/0/com.app/documents/photos/a.jpg",
              x: 0.1,
              y: 0.1,
              width: 0.8,
              height: 0.5,
              rotation: 0,
              zIndex: 1,
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe("persistPhotoUri", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("returns already-persisted documentDirectory URIs untouched", async () => {
    const uri = "file:///data/user/0/com.app/documents/photos/a.jpg";
    await expect(persistPhotoUri(uri, "account:owner@example.com", "memory-1")).resolves.toMatch(/photos\/accounts\/owner%40example\.com\/memory-1\//);
    expect(copyAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ from: uri }));
  });

  it("copies an external file URI into the sandbox photos directory", async () => {
    const uri = "file:///var/mobile/Containers/Shared/AppGroup/photo.jpg";
    const persisted = await persistPhotoUri(uri, "account:owner@example.com", "memory-1");
    expect(makeDirectoryAsyncMock).toHaveBeenCalled();
    expect(copyAsyncMock).toHaveBeenCalledWith({
      from: uri,
      to: expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\/accounts\/owner%40example\.com\/memory-1\/.+\.jpg$/),
    });
    expect(persisted).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\/accounts\/owner%40example\.com\/memory-1\//);
  });

  it("resolves ph:// URIs via MediaLibrary before copying", async () => {
    const persisted = await persistPhotoUri("ph://ABC123", "account:owner@example.com", "memory-1");
    expect(getAssetInfoAsyncMock).toHaveBeenCalledWith("ABC123");
    expect(copyAsyncMock).toHaveBeenCalledWith({
      from: "file:///tmp/ph-resolved/ABC123.jpg",
      to: expect.stringMatching(/\.jpg$/),
    });
    expect(persisted).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\/accounts\/owner%40example\.com\/memory-1\//);
  });

  it("does not retain the original temporary URI when the copy fails", async () => {
    copyAsyncMock.mockRejectedValueOnce(new Error("no space"));
    const uri = "file:///var/mobile/temp.jpg";
    await expect(persistPhotoUri(uri, "account:owner@example.com", "memory-1")).rejects.toThrow("no space");
  });

  it("rejects instead of retaining a temporary URI when strict persistence fails", async () => {
    copyAsyncMock.mockRejectedValueOnce(new Error("no space"));

    await expect(persistPhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    )).rejects.toThrow("no space");
  });

  it("rejects and removes a partial destination when copy succeeds but verification fails", async () => {
    getInfoAsyncMock
      .mockResolvedValueOnce({ exists: false, isDirectory: false })
      .mockResolvedValueOnce({ exists: false, isDirectory: false });

    await expect(persistPhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    )).rejects.toThrow("verification");
    expect(deleteAsyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/photos\/accounts\/owner%40example\.com\/memory-1\/.+\.jpg$/),
      { idempotent: true },
    );
  });

  it("rejects a directory destination even after copy", async () => {
    getInfoAsyncMock
      .mockResolvedValueOnce({ exists: false, isDirectory: false })
      .mockResolvedValueOnce({ exists: true, isDirectory: true });

    await expect(persistPhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    )).rejects.toThrow("verification");
  });
});

describe("photo directory cleanup", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("deletes only the selected account and memory directory", async () => {
    await deleteMemoryPhotoDirectory("account:owner@example.com", "memory/1");
    expect(deleteAsyncMock).toHaveBeenCalledWith(
      "file:///data/user/0/com.app/documents/photos/accounts/owner%40example.com/memory%2F1/",
      { idempotent: true },
    );
  });

  it("never deletes pre-account legacy sandbox files during account-scoped migration", async () => {
    const legacyUnused = "file:///data/user/0/com.app/documents/photos/legacy-unused.jpg";
    const legacyReferenced = "file:///data/user/0/com.app/documents/photos/legacy-referenced.jpg";
    await cleanupMigratedLegacyPhotoUris([legacyUnused, legacyReferenced, "file:///var/mobile/external.jpg"], [
      makeMemory({ photoUris: [legacyReferenced] }),
    ]);
    expect(deleteAsyncMock).not.toHaveBeenCalledWith(legacyUnused, expect.anything());
    expect(deleteAsyncMock).not.toHaveBeenCalledWith(legacyReferenced, expect.anything());
    expect(deleteAsyncMock).not.toHaveBeenCalledWith("file:///var/mobile/external.jpg", expect.anything());
  });

  it("propagates account-directory deletion failures on the strict account-deletion path", async () => {
    deleteAsyncMock.mockRejectedValueOnce(new Error("filesystem unavailable"));

    await expect(
      deleteAccountPhotoDirectoryStrict("account:owner@example.com"),
    ).rejects.toThrow("filesystem unavailable");
  });

  it("keeps ordinary album cleanup best-effort", async () => {
    deleteAsyncMock.mockRejectedValueOnce(new Error("filesystem unavailable"));

    await expect(
      deleteAccountPhotoDirectory("account:owner@example.com"),
    ).resolves.toBeUndefined();
  });
});

describe("staged photo persistence", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("rolls back only the destination created by its own staging handle", async () => {
    const staged = await stagePhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    );
    const destination = copyAsyncMock.mock.calls[0][0].to as string;

    expect(staged.uri).toBe(destination);
    await staged.rollback();
    await staged.rollback();

    expect(deleteAsyncMock).toHaveBeenCalledTimes(1);
    expect(deleteAsyncMock).toHaveBeenCalledWith(destination, { idempotent: true });
  });

  it("keeps a staged destination after the handle is committed", async () => {
    const staged = await stagePhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    );

    staged.commit();
    await staged.rollback();

    expect(deleteAsyncMock).not.toHaveBeenCalled();
  });

  it("never deletes a pre-existing photo returned by staging", async () => {
    const existing = "file:///data/user/0/com.app/documents/photos/accounts/owner%40example.com/memory-1/existing.jpg";
    const staged = await stagePhotoUriStrict(existing, "account:owner@example.com", "memory-1");

    await staged.rollback();

    expect(staged.uri).toBe(existing);
    expect(copyAsyncMock).not.toHaveBeenCalled();
    expect(deleteAsyncMock).not.toHaveBeenCalled();
  });

  it("cleans its generated destination if the copy itself rejects", async () => {
    copyAsyncMock.mockRejectedValueOnce(new Error("partial copy"));
    await expect(stagePhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    )).rejects.toThrow("partial copy");
    const destination = copyAsyncMock.mock.calls[0][0].to as string;
    expect(deleteAsyncMock).toHaveBeenCalledWith(destination, { idempotent: true });
  });

  it("skips a colliding pre-existing destination and never deletes it", async () => {
    getInfoAsyncMock
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: false });
    const staged = await stagePhotoUriStrict(
      "file:///var/mobile/temporary.jpg",
      "account:owner@example.com",
      "memory-1",
    );
    const collidingPath = getInfoAsyncMock.mock.calls[0][0] as string;
    expect(copyAsyncMock).toHaveBeenCalledWith({
      from: "file:///var/mobile/temporary.jpg",
      to: staged.uri,
    });
    expect(staged.uri).not.toBe(collidingPath);
    await staged.rollback();
    expect(deleteAsyncMock).not.toHaveBeenCalledWith(collidingPath, expect.anything());
  });
});

describe("persistPhotoUris", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("persists multiple URIs preserving order", async () => {
    const uris = [
      "file:///data/user/0/com.app/documents/photos/a.jpg",
      "file:///var/mobile/temp/b.jpg",
      "file:///var/mobile/temp/c.jpg",
    ];
    const persisted = await persistPhotoUris(uris, "account:owner@example.com", "memory-1");
    expect(persisted).toEqual([
      expect.stringMatching(/photos\/accounts\/owner%40example\.com\/memory-1\//),
      expect.stringMatching(/photos\//),
      expect.stringMatching(/photos\//),
    ]);
  });
});

describe("ensureMemoryPhotosPersisted", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("returns changed: false when nothing needs persisting", async () => {
    const memory = makeMemory();
    const result = await ensureMemoryPhotosPersisted(memory, "account:owner@example.com");
    expect(result.changed).toBe(true);
    expect(result.memory.photoUris[0]).toMatch(/photos\/accounts\/owner%40example\.com\/memory-1\//);
  });

  it("replaces image element uris, cover image and photoUris with sandbox copies", async () => {
    const memory = makeMemory({
      photoUris: ["file:///var/mobile/temp/photo1.jpg"],
      coverColor: "#EFE2CF",
      coverImage: "file:///var/mobile/temp/cover.jpg",
      pages: [
        {
          id: "p1",
          position: 0,
          kind: "photo",
          headline: "标题",
          body: "正文",
          layout: {
            aspectRatio: 3 / 4,
            coverImage: "file:///var/mobile/temp/cover.jpg",
            elements: [
              {
                id: "img1",
                type: "image",
                uri: "file:///var/mobile/temp/photo1.jpg",
                x: 0.1,
                y: 0.1,
                width: 0.8,
                height: 0.5,
                rotation: 0,
                zIndex: 1,
              },
              {
                id: "txt1",
                type: "text",
                text: "hello",
                fontStyle: "ZhaohuaTypeWriter",
                color: "#000000",
                fontSize: 16,
                x: 0.1,
                y: 0.6,
                width: 0.8,
                height: 0.2,
                rotation: 0,
                zIndex: 2,
              },
            ],
          },
        },
      ],
    });

    const result = await ensureMemoryPhotosPersisted(memory, "account:owner@example.com");
    expect(result.changed).toBe(true);

    const page = result.memory.pages[0];
    expect(page.layout?.elements[0]).toEqual(
      expect.objectContaining({
        type: "image",
        uri: expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\//),
      }),
    );
    // 文字元素不受影响
    expect(page.layout?.elements[1]).toEqual(
      expect.objectContaining({ type: "text", text: "hello" }),
    );
    // 封面图与 photoUris 列表同步替换
    expect(page.layout?.coverImage).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\//);
    expect(result.memory.photoUris[0]).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\//);
  });
});

describe("hydrateMemoryPhotoReferences", () => {
  beforeEach(() => {
    resetPhotoMocks();
  });

  it("rebases an old account-scoped absolute URI to the current Documents root and writes a canonical storage value", async () => {
    const oldRoot = "file:///var/mobile/Containers/Data/Application/old/Documents/";
    const oldUri = `${oldRoot}photos/accounts/owner%40example.com/memory-1/123-photo.jpg`;
    getInfoAsyncMock.mockResolvedValueOnce({ exists: true, isDirectory: false });

    const result = await hydrateMemoryPhotoReferences(
      makeMemory({ photoUris: [oldUri], pages: [] }),
      "account:owner@example.com",
    );

    expect(result.changed).toBe(true);
    expect(result.storageMemory.photoUris).toEqual([
      "documents://photos/accounts/owner%40example.com/memory-1/123-photo.jpg",
    ]);
    expect(result.runtimeMemory.photoUris).toEqual([
      "file:///data/user/0/com.app/documents/photos/accounts/owner%40example.com/memory-1/123-photo.jpg",
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("retains an unrecoverable storage reference but exposes only a missing token at runtime", async () => {
    const staleUri = "file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/owner%40example.com/memory-1/123-photo.jpg";
    getInfoAsyncMock.mockResolvedValueOnce({ exists: false, isDirectory: false });

    const result = await hydrateMemoryPhotoReferences(
      makeMemory({ photoUris: [staleUri], pages: [] }),
      "account:owner@example.com",
    );

    expect(result.storageMemory.photoUris).toEqual([staleUri]);
    expect(result.runtimeMemory.photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    expect(result.unresolved).toEqual([
      expect.objectContaining({ storedReference: staleUri }),
    ]);
  });

  it("assigns a distinct missing token to every unresolved photo occurrence", async () => {
    const staleUri = "file:///var/mobile/Containers/Data/Application/old/Documents/photos/accounts/owner%40example.com/memory-1/123-photo.jpg";
    getInfoAsyncMock.mockResolvedValue({ exists: false, isDirectory: false });

    const result = await hydrateMemoryPhotoReferences(
      makeMemory({
        photoUris: [staleUri, staleUri],
        pages: [{
          id: "p1",
          position: 0,
          kind: "photo",
          headline: "title",
          body: "body",
          photoUri: staleUri,
        }],
      }),
      "account:owner@example.com",
    );

    expect(result.runtimeMemory.photoUris[0]).not.toBe(result.runtimeMemory.photoUris[1]);
    expect(result.runtimeMemory.photoUris).not.toContain(result.runtimeMemory.pages[0].photoUri);
    expect(new Set(result.unresolved.map(({ token }) => token)).size).toBe(3);
  });

  it("does not copy another account's app-owned photo into the current album", async () => {
    const foreignUri = "file:///data/user/0/com.app/documents/photos/accounts/other%40example.com/memory-1/123-photo.jpg";
    getInfoAsyncMock.mockResolvedValue({ exists: true, isDirectory: false });

    const result = await hydrateMemoryPhotoReferences(
      makeMemory({ photoUris: [foreignUri], pages: [] }),
      "account:owner@example.com",
    );

    expect(copyAsyncMock).not.toHaveBeenCalled();
    expect(result.runtimeMemory.photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    expect(result.storageMemory.photoUris).toEqual([foreignUri]);
  });
});
