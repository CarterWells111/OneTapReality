const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockManipulate = jest.fn();
const mockSaveAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

import { SaveFormat } from "expo-image-manipulator";
import {
  createGiftImageDerivative,
  removeGiftImageDerivatives,
} from "../src/features/gifts/gift-image-derivative";

function arrangeImage(width: number, height: number, saved = { uri: "file:///cache/derived.jpg", width, height }) {
  const original = { width, height, saveAsync: mockSaveAsync };
  const resized = {
    width: width >= height ? 2560 : Math.round((width / height) * 2560),
    height: height > width ? 2560 : Math.round((height / width) * 2560),
    saveAsync: mockSaveAsync,
  };
  mockRenderAsync.mockResolvedValueOnce(original);
  if (Math.max(width, height) > 2560) mockRenderAsync.mockResolvedValueOnce(resized);
  mockManipulate.mockImplementation(() => ({ resize: mockResize, renderAsync: mockRenderAsync }));
  mockResize.mockReturnValue({ resize: mockResize, renderAsync: mockRenderAsync });
  mockSaveAsync.mockResolvedValue(saved);
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 900_000 });
}

describe("gift image derivatives", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resizes a landscape HEIC and saves a medium-quality JPEG", async () => {
    arrangeImage(4032, 3024, { uri: "file:///cache/derived.jpg", width: 2560, height: 1920 });

    await expect(createGiftImageDerivative("file:///large.heic", "image/heic")).resolves.toEqual({
      uri: "file:///cache/derived.jpg",
      contentType: "image/jpeg",
      byteSize: 900_000,
      width: 2560,
      height: 1920,
    });
    expect(mockResize).toHaveBeenCalledWith({ width: 2560, height: null });
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.82, format: SaveFormat.JPEG });
  });

  it("resizes a portrait by height", async () => {
    arrangeImage(3024, 4032, { uri: "file:///cache/portrait.jpg", width: 1920, height: 2560 });
    await createGiftImageDerivative("file:///portrait.webp", "image/webp");
    expect(mockResize).toHaveBeenCalledWith({ width: null, height: 2560 });
  });

  it("compresses an already-small photo without upscaling", async () => {
    arrangeImage(1200, 900, { uri: "file:///cache/small.jpg", width: 1200, height: 900 });
    const result = await createGiftImageDerivative("file:///small.jpg", "image/jpeg");
    expect(mockResize).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ width: 1200, height: 900, contentType: "image/jpeg" }));
  });

  it("keeps PNG output so transparency is preserved", async () => {
    arrangeImage(3000, 1500, { uri: "file:///cache/transparent.png", width: 2560, height: 1280 });
    const result = await createGiftImageDerivative("file:///transparent.png", "image/png");
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 1, format: SaveFormat.PNG });
    expect(result.contentType).toBe("image/png");
  });

  it("rejects zero-byte output and only deletes returned derivative URIs", async () => {
    arrangeImage(100, 100);
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, size: 0 });
    await expect(createGiftImageDerivative("file:///source.jpg", "image/jpeg")).rejects.toThrow("临时图片");

    mockDeleteAsync.mockResolvedValue(undefined);
    await removeGiftImageDerivatives([
      { uri: "file:///cache/a.jpg", contentType: "image/jpeg", byteSize: 1, width: 1, height: 1 },
      { uri: "file:///cache/a.jpg", contentType: "image/jpeg", byteSize: 1, width: 1, height: 1 },
      { uri: "file:///cache/b.png", contentType: "image/png", byteSize: 1, width: 1, height: 1 },
    ]);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/a.jpg", { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/b.png", { idempotent: true });
    expect(mockDeleteAsync).not.toHaveBeenCalledWith("file:///source.jpg", expect.anything());
  });
});
