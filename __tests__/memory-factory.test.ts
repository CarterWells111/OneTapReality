import { createMemory } from "../src/features/memories/memory-factory";

describe("createMemory", () => {
  it("creates a persisted memory from a draft and generated pages", () => {
    const memory = createMemory({
      id: "memory-1",
      now: "2026-07-22T10:00:00.000Z",
      input: {
        title: "我们的外滩夜晚",
        city: "shanghai",
        travelDate: "2026-07-20",
        photoUris: ["file://bund.jpg"],
      },
      pages: [
        {
          id: "cover",
          position: 0,
          kind: "cover",
          headline: "我们的外滩夜晚",
          body: "封面",
        },
      ],
    });

    expect(memory).toMatchObject({
      id: "memory-1",
      city: "shanghai",
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z",
    });
    expect(memory.pages).toHaveLength(1);
  });

  it("namespaces generated page IDs by memory so separate albums can be saved", () => {
    const input = {
      title: "Two albums",
      city: "shanghai" as const,
      travelDate: "2026-07-22",
      photoUris: ["file://photo.jpg"],
    };
    const generatedPages = [
      { id: "cover", position: 0, kind: "cover" as const, headline: "Cover", body: "Body" },
      { id: "photo-1", position: 1, kind: "photo" as const, headline: "Photo", body: "Body" },
    ];

    const first = createMemory({ id: "memory-a", now: "2026-07-22T10:00:00.000Z", input, pages: generatedPages });
    const second = createMemory({ id: "memory-b", now: "2026-07-22T10:00:00.000Z", input, pages: generatedPages });

    expect(first.pages.map((page) => page.id)).toEqual(["memory-a:cover", "memory-a:photo-1"]);
    expect(second.pages.map((page) => page.id)).toEqual(["memory-b:cover", "memory-b:photo-1"]);
  });
});
