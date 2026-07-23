import { parseCloudMemoryPayload } from "../src/server/validation";

describe("cloud memory validation", () => {
  it("accepts a sanitized page layout that uses photo slots", () => {
    const payload = parseCloudMemoryPayload({
      title: "Hangzhou",
      city: "hangzhou",
      travelDate: "2026-07-22",
      status: "saved",
      photoCount: 1,
      pages: [
        {
          id: "page-1",
          position: 0,
          kind: "cover",
          headline: "A day",
          body: "A memory",
          photoSlot: 0,
          layout: {
            aspectRatio: 1,
            elements: [
              {
                id: "image-1",
                type: "image",
                photoSlot: 0,
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                rotation: 0,
                zIndex: 0,
              },
            ],
          },
        },
      ],
    });

    expect(payload.photoCount).toBe(1);
    expect(payload.pages[0].layout?.elements[0]).toEqual(
      expect.objectContaining({ type: "image", photoSlot: 0 }),
    );
  });

  it("rejects local photo URI fields", () => {
    expect(() =>
      parseCloudMemoryPayload({
        title: "Local only",
        city: "hangzhou",
        travelDate: "2026-07-22",
        status: "saved",
        photoCount: 1,
        photoUris: ["file:///private/photo.jpg"],
        pages: [],
      }),
    ).toThrow("photoUris");
  });
});
