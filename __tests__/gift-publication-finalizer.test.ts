import { BackendApiError } from "../src/services/backend/api-client";
import { finalizePublicationWithRetry } from "../src/features/gifts/finalize-publication";

describe("gift publication finalizer", () => {
  it("retries only finalization with the same publication id after a retryable response", async () => {
    const finalize = jest.fn()
      .mockRejectedValueOnce(new BackendApiError(503, "gift_publication_retryable", "retry"))
      .mockResolvedValueOnce({ albumId: "album-1", version: 2 });
    const delay = jest.fn(async () => undefined);

    await expect(finalizePublicationWithRetry({ publicationId: "publication-1", finalize, delay })).resolves.toEqual({
      status: "success", albumId: "album-1", version: 2,
    });
    expect(finalize.mock.calls).toEqual([["publication-1"], ["publication-1"]]);
    expect(delay).toHaveBeenCalledWith(500, expect.any(AbortSignal));
  });

  it("retries a transport failure with no HTTP response", async () => {
    const finalize = jest.fn()
      .mockRejectedValueOnce(new BackendApiError(0, "network_unavailable", "offline"))
      .mockResolvedValueOnce({ albumId: "album-1", version: 1 });

    await expect(finalizePublicationWithRetry({ publicationId: "publication-1", finalize, delay: async () => undefined })).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it("returns the same publication id after three retryable failures", async () => {
    const finalize = jest.fn().mockRejectedValue(new BackendApiError(503, "gift_publication_retryable", "retry"));

    await expect(finalizePublicationWithRetry({ publicationId: "publication-1", finalize, delay: async () => undefined })).resolves.toEqual({
      status: "retryable", publicationId: "publication-1",
    });
    expect(finalize).toHaveBeenCalledTimes(3);
  });

  it.each([
    new BackendApiError(409, "gift_publication_unavailable", "expired"),
    new BackendApiError(409, "gift_upload_incomplete", "incomplete"),
    new BackendApiError(409, "gift_album_version_conflict", "conflict"),
    new BackendApiError(403, "gift_editor_required", "revoked"),
  ])("does not retry non-transient completion error %#", async (error) => {
    const finalize = jest.fn().mockRejectedValue(error);
    await expect(finalizePublicationWithRetry({ publicationId: "publication-1", finalize, delay: async () => undefined })).rejects.toBe(error);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("aborts a scheduled retry without another finalization call", async () => {
    const controller = new AbortController();
    const finalize = jest.fn().mockRejectedValue(new BackendApiError(503, "gift_publication_retryable", "retry"));
    const delay = jest.fn(async (_milliseconds: number, signal: AbortSignal) => {
      controller.abort();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    });

    await expect(finalizePublicationWithRetry({ publicationId: "publication-1", finalize, delay, signal: controller.signal })).rejects.toEqual(expect.objectContaining({ name: "AbortError" }));
    expect(finalize).toHaveBeenCalledTimes(1);
  });
});
