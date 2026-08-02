import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import {
  ensureMemoryPhotosPersisted,
  persistPhotoUri,
  persistPhotoUris,
} from "../src/features/memories/photo-persistence";
import type { Memory } from "../src/types/memory";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/user/0/com.app/documents/",
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-media-library", () => ({
  getAssetInfoAsync: jest.fn(async (assetId: string) => ({
    localUri: `file:///tmp/ph-resolved/${assetId}.jpg`,
  })),
}));

const copyAsyncMock = FileSystem.copyAsync as jest.Mock;
const makeDirectoryAsyncMock = FileSystem.makeDirectoryAsync as jest.Mock;
const getAssetInfoAsyncMock = MediaLibrary.getAssetInfoAsync as jest.Mock;

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
    jest.clearAllMocks();
  });

  it("returns already-persisted documentDirectory URIs untouched", async () => {
    const uri = "file:///data/user/0/com.app/documents/photos/a.jpg";
    await expect(persistPhotoUri(uri)).resolves.toBe(uri);
    expect(copyAsyncMock).not.toHaveBeenCalled();
  });

  it("copies an external file URI into the sandbox photos directory", async () => {
    const uri = "file:///var/mobile/Containers/Shared/AppGroup/photo.jpg";
    const persisted = await persistPhotoUri(uri);
    expect(makeDirectoryAsyncMock).toHaveBeenCalled();
    expect(copyAsyncMock).toHaveBeenCalledWith({
      from: uri,
      to: expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\/.+\.jpg$/),
    });
    expect(persisted).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\//);
  });

  it("resolves ph:// URIs via MediaLibrary before copying", async () => {
    const persisted = await persistPhotoUri("ph://ABC123");
    expect(getAssetInfoAsyncMock).toHaveBeenCalledWith("ABC123");
    expect(copyAsyncMock).toHaveBeenCalledWith({
      from: "file:///tmp/ph-resolved/ABC123.jpg",
      to: expect.stringMatching(/\.jpg$/),
    });
    expect(persisted).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/documents\/photos\//);
  });

  it("falls back to the original URI when the copy fails", async () => {
    copyAsyncMock.mockRejectedValueOnce(new Error("no space"));
    const uri = "file:///var/mobile/temp.jpg";
    await expect(persistPhotoUri(uri)).resolves.toBe(uri);
  });
});

describe("persistPhotoUris", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists multiple URIs preserving order", async () => {
    const uris = [
      "file:///data/user/0/com.app/documents/photos/a.jpg",
      "file:///var/mobile/temp/b.jpg",
      "file:///var/mobile/temp/c.jpg",
    ];
    const persisted = await persistPhotoUris(uris);
    expect(persisted[0]).toBe(uris[0]);
    expect(persisted.slice(1)).toEqual([
      expect.stringMatching(/photos\//),
      expect.stringMatching(/photos\//),
    ]);
  });
});

describe("ensureMemoryPhotosPersisted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns changed: false when nothing needs persisting", async () => {
    const memory = makeMemory();
    const result = await ensureMemoryPhotosPersisted(memory);
    expect(result.changed).toBe(false);
    expect(result.memory).toBe(memory);
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

    const result = await ensureMemoryPhotosPersisted(memory);
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
