import type { StoryPage } from "../../types/memory";

export type NewStoryPageInput = {
  id: string;
  kind: StoryPage["kind"];
  headline?: string;
  body?: string;
  photoUri?: string;
};

/** 按当前数组顺序重编连续 position（不重新排序）。 */
function renumber(pages: readonly StoryPage[]): StoryPage[] {
  return pages.map((page, index) => ({ ...page, position: index }));
}

/**
 * 输出标准化的册页列表：按 position 升序排列，并重编为连续的 0..n-1。
 */
export function normalizeStoryPages(pages: readonly StoryPage[]): StoryPage[] {
  return renumber([...pages].sort((a, b) => a.position - b.position));
}

/**
 * 新增一页。重复 id 视为无效操作，返回标准化后的原列表。
 * insertIndex 省略时追加到末尾，越界时收敛到合法范围。
 */
export function addStoryPage(
  pages: readonly StoryPage[],
  input: NewStoryPageInput,
  insertIndex?: number
): StoryPage[] {
  const normalized = normalizeStoryPages(pages);
  if (normalized.some((page) => page.id === input.id)) {
    return normalized;
  }

  const page: StoryPage = {
    id: input.id,
    position: normalized.length,
    kind: input.kind,
    headline: input.headline ?? "",
    body: input.body ?? "",
  };
  if (input.photoUri !== undefined) {
    page.photoUri = input.photoUri;
  }

  const index =
    insertIndex === undefined
      ? normalized.length
      : Math.max(0, Math.min(insertIndex, normalized.length));
  const next = [...normalized];
  next.splice(index, 0, page);
  return renumber(next);
}

/**
 * 删除一页。删除会导致空册页序列时拒绝执行，返回标准化后的原列表。
 */
export function removeStoryPage(
  pages: readonly StoryPage[],
  pageId: string
): StoryPage[] {
  const normalized = normalizeStoryPages(pages);
  const next = normalized.filter((page) => page.id !== pageId);
  if (next.length === 0) {
    return normalized;
  }
  return normalizeStoryPages(next);
}

/**
 * 将某页上移或下移一位。越界或找不到该页时返回标准化后的原列表。
 */
export function moveStoryPage(
  pages: readonly StoryPage[],
  pageId: string,
  direction: -1 | 1
): StoryPage[] {
  const normalized = normalizeStoryPages(pages);
  const index = normalized.findIndex((page) => page.id === pageId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) {
    return normalized;
  }
  const next = [...normalized];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return renumber(next);
}
