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
});
