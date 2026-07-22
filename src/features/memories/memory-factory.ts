import type { Memory, MemoryDraftInput, StoryPage } from "../../types/memory";

type CreateMemoryArguments = {
  id: string;
  now: string;
  input: MemoryDraftInput;
  pages: StoryPage[];
};

export function createMemory({
  id,
  now,
  input,
  pages,
}: CreateMemoryArguments): Memory {
  return {
    id,
    ...input,
    pages: pages.map((page) => ({ ...page, id: `${id}:${page.id}` })),
    createdAt: now,
    updatedAt: now,
  };
}

