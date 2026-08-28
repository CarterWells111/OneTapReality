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
  const { pagePlans: _pagePlans, ...persistedInput } = input;
  return {
    id,
    ...persistedInput,
    pages: pages.map((page) => ({
      ...page,
      id: page.id.startsWith(`${id}:`) ? page.id : `${id}:${page.id}`,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

