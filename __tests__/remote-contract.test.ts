import type {
  RemoteDraftConsent,
  RemoteDraftResponse,
} from "../src/services/ai/remote-contract";
import {
  buildRemoteDraftRequest,
  createRemoteDraftGenerator,
  findPrivacyViolations,
  remoteContractVersion,
  toStoryPages,
} from "../src/services/ai/remote-contract";
import type { MemoryDraftInput } from "../src/types/memory";

const input: MemoryDraftInput = {
  title: "我们的西湖周末",
  city: "hangzhou",
  travelDate: "2026-07-23",
  photoUris: ["file://one.jpg", "file://two.jpg"],
};

const granted: RemoteDraftConsent = {
  state: "granted",
  policyVersion: "2026-07",
  acceptedAt: "2026-07-23T09:00:00.000Z",
};

describe("buildRemoteDraftRequest", () => {
  it("folds photoUris into a count and keeps only user-typed fields", () => {
    const result = buildRemoteDraftRequest(input, granted);

    expect(result).toEqual({
      ok: true,
      request: {
        contractVersion: remoteContractVersion,
        title: "我们的西湖周末",
        city: "hangzhou",
        travelDate: "2026-07-23",
        photoCount: 2,
        consent: granted,
      },
    });
    expect(JSON.stringify(result)).not.toContain("file://");
  });

  it.each(["unset", "denied"] as const)(
    "returns consent-required when consent is %s",
    (state) => {
      const result = buildRemoteDraftRequest(input, {
        state,
        policyVersion: "2026-07",
      });

      expect(result).toEqual({
        ok: false,
        error: { type: "consent-required", retryable: false },
      });
    }
  );
});

describe("findPrivacyViolations", () => {
  it("accepts a clean request", () => {
    const built = buildRemoteDraftRequest(input, granted);
    if (!built.ok) {
      throw new Error("expected ok");
    }

    expect(findPrivacyViolations(built.request)).toEqual([]);
  });

  it("flags photo uris, remote urls, inline images, and coordinates", () => {
    const built = buildRemoteDraftRequest(input, granted);
    if (!built.ok) {
      throw new Error("expected ok");
    }

    expect(
      findPrivacyViolations({ ...built.request, title: "file://secret.jpg" })
    ).toHaveLength(1);
    expect(
      findPrivacyViolations({ ...built.request, title: "https://leak.example" })
    ).toHaveLength(1);
    expect(
      findPrivacyViolations({ ...built.request, title: "data:image/png;base64,AAA" })
    ).toHaveLength(1);
    expect(
      findPrivacyViolations({ ...built.request, title: "30.24447, 120.16283" })
    ).toHaveLength(1);
  });
});

describe("toStoryPages", () => {
  const response: RemoteDraftResponse = {
    contractVersion: remoteContractVersion,
    pages: [
      { id: "cover", kind: "cover", headline: "封面", body: "开始" },
      { id: "photo-1", kind: "photo", headline: "照片", body: "回忆", photoSlot: 1 },
      { id: "closing", kind: "closing", headline: "封底", body: "再见", photoSlot: 9 },
    ],
  };

  it("maps photoSlot back to local uris and numbers positions continuously", () => {
    const pages = toStoryPages(response, input.photoUris);

    expect(pages.map((page) => page.position)).toEqual([0, 1, 2]);
    expect(pages[1].photoUri).toBe("file://two.jpg");
  });

  it("ignores out-of-range photo slots", () => {
    const pages = toStoryPages(response, input.photoUris);

    expect(pages[2].photoUri).toBeUndefined();
  });
});

describe("createRemoteDraftGenerator (DraftGenerator 兼容)", () => {
  it("generates StoryPage[] through an injected transport", async () => {
    const generator = createRemoteDraftGenerator(
      async (request) => ({
        contractVersion: remoteContractVersion,
        pages: [
          {
            id: "cover",
            kind: "cover",
            headline: request.title,
            body: `${request.photoCount} 张照片`,
          },
        ],
      }),
      granted
    );

    const pages = await generator.generate(input);
    expect(pages).toEqual([
      { id: "cover", position: 0, kind: "cover", headline: "我们的西湖周末", body: "2 张照片" },
    ]);
  });

  it("throws a handleable consent-required error without consent", async () => {
    const generator = createRemoteDraftGenerator(
      async () => ({ contractVersion: remoteContractVersion, pages: [] }),
      { state: "unset", policyVersion: "2026-07" }
    );

    await expect(generator.generate(input)).rejects.toMatchObject({
      type: "consent-required",
      retryable: false,
    });
  });

  it("rejects a response with the wrong contract version", async () => {
    const generator = createRemoteDraftGenerator(
      async () =>
        ({ contractVersion: 999, pages: [] }) as unknown as RemoteDraftResponse,
      granted
    );

    await expect(generator.generate(input)).rejects.toMatchObject({
      type: "invalid-response",
      retryable: false,
    });
  });
});
