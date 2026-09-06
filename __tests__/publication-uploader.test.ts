jest.mock("expo-file-system/legacy", () => ({
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

import { uploadPublicationFiles, type PublicationUploadFile } from "../src/features/gifts/publication-uploader";

const media = (position: number): PublicationUploadFile => ({
  kind: "media",
  position,
  uri: `file:///cache/${position}.jpg`,
  contentType: "image/jpeg",
  uploadUrl: `https://upload.test/${position}`,
});

describe("publication uploader", () => {
  it("uploads with at most two workers and reports monotonic progress", async () => {
    let active = 0;
    let maximumObservedConcurrency = 0;
    const releases: (() => void)[] = [];
    const uploadFile = jest.fn(async () => {
      active += 1;
      maximumObservedConcurrency = Math.max(maximumObservedConcurrency, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return { status: 200 };
    });
    const progress: [number, number][] = [];
    const promise = uploadPublicationFiles({
      publicationId: "publication-1",
      files: [media(0), media(1), media(2), media(3)],
      uploadFile,
      refreshUploads: jest.fn(),
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    await Promise.resolve();
    expect(active).toBe(2);
    while (releases.length) {
      releases.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await promise;

    expect(maximumObservedConcurrency).toBe(2);
    expect(progress[0]).toEqual([0, 4]);
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(progress.map(([completed]) => completed)).toEqual([0, 1, 2, 3, 4]);
  });

  it("refreshes exactly the rejected media URL once on 403", async () => {
    const uploadFile = jest.fn()
      .mockResolvedValueOnce({ status: 403 })
      .mockResolvedValueOnce({ status: 200 });
    const refreshUploads = jest.fn().mockResolvedValue({
      uploads: [{ position: 1, uploadUrl: "https://upload.test/refreshed-1" }],
      coverUpload: null,
    });

    await uploadPublicationFiles({ publicationId: "publication-1", files: [media(1)], uploadFile, refreshUploads });

    expect(refreshUploads).toHaveBeenCalledWith({ publicationId: "publication-1", positions: [1], cover: false });
    expect(uploadFile).toHaveBeenLastCalledWith(expect.objectContaining({ uploadUrl: "https://upload.test/refreshed-1" }));
  });

  it.each(["network", 408, 429, 500] as const)("retries transient %s failures at most twice", async (failure) => {
    const uploadFile = jest.fn()
      .mockImplementationOnce(async () => {
        if (failure === "network") throw new Error("offline");
        return { status: failure };
      })
      .mockResolvedValueOnce({ status: failure === "network" ? 500 : failure })
      .mockResolvedValueOnce({ status: 200 });
    const delay = jest.fn(async () => undefined);

    await uploadPublicationFiles({ publicationId: "publication-1", files: [media(2)], uploadFile, refreshUploads: jest.fn(), delay });

    expect(uploadFile).toHaveBeenCalledTimes(3);
    expect(delay.mock.calls).toEqual([[300], [900]]);
  });

  it("fails permanent media errors immediately with the photo number", async () => {
    const uploadFile = jest.fn().mockResolvedValue({ status: 400 });
    await expect(uploadPublicationFiles({
      publicationId: "publication-1", files: [media(4)], uploadFile, refreshUploads: jest.fn(), delay: jest.fn(),
    })).rejects.toThrow("第 5 张照片");
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it("identifies a failed cover explicitly and never reports early completion", async () => {
    const progress: number[] = [];
    await expect(uploadPublicationFiles({
      publicationId: "publication-1",
      files: [{ kind: "cover", uri: "file:///cache/cover.jpg", contentType: "image/jpeg", uploadUrl: "https://upload.test/cover" }],
      uploadFile: jest.fn().mockResolvedValue({ status: 422 }),
      refreshUploads: jest.fn(),
      onProgress: (completed) => progress.push(completed),
    })).rejects.toThrow("封面");
    expect(progress).toEqual([0]);
  });

  it("waits for started workers and stops dequeuing files after a permanent failure", async () => {
    let releaseSecondUpload!: () => void;
    const secondUpload = new Promise<void>((resolve) => {
      releaseSecondUpload = resolve;
    });
    const uploadFile = jest.fn(async (file: PublicationUploadFile) => {
      if (file.position === 0) return { status: 400 };
      await secondUpload;
      return { status: 200 };
    });
    let settled = false;
    const result = uploadPublicationFiles({
      publicationId: "publication-1",
      files: [media(0), media(1), media(2)],
      uploadFile,
      refreshUploads: jest.fn(),
    }).then(
      () => ({ status: "resolved" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    void result.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(uploadFile.mock.calls.map(([file]) => file.position)).toEqual([0, 1]);

    releaseSecondUpload();
    await expect(result).resolves.toEqual(expect.objectContaining({
      status: "rejected",
      error: expect.objectContaining({ message: expect.stringContaining("第 1 张照片") }),
    }));
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });
});
