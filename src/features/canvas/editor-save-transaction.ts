import { updateCanvasElement } from "./editor-pages";
import type { StoryPage } from "../../types/memory";

export type CanvasEditorCursor = { pageId: string; index: number };

export type CanvasTextStyleDraft = {
  pageId: string;
  elementId: string;
  color?: string;
  fontSize?: number;
};

export type CanvasEditorSaveSnapshot = {
  pages: StoryPage[];
  cursor: CanvasEditorCursor;
};

export function createEditorSaveSnapshot({
  activePageId,
  fallbackIndex,
  pages,
  styleDraft,
}: {
  activePageId?: string;
  fallbackIndex: number;
  pages: StoryPage[];
  styleDraft?: CanvasTextStyleDraft;
}): CanvasEditorSaveSnapshot {
  const nextPages = styleDraft
    ? updateCanvasElement(pages, styleDraft.pageId, styleDraft.elementId, {
        ...(styleDraft.color ? { color: styleDraft.color } : {}),
        ...(styleDraft.fontSize !== undefined ? { fontSize: styleDraft.fontSize } : {}),
      })
    : pages;
  const idIndex = activePageId ? nextPages.findIndex((page) => page.id === activePageId) : -1;
  const index = idIndex >= 0
    ? idIndex
    : Math.max(0, Math.min(fallbackIndex, Math.max(0, nextPages.length - 1)));
  const pageId = nextPages[index]?.id ?? "";
  return { cursor: { pageId, index }, pages: nextPages };
}

export function createTransformSettleGate(timeoutMs = 1_000) {
  let activeCount = 0;
  const waiters = new Set<(settled: boolean) => void>();
  const resolveAll = (settled: boolean) => {
    const current = [...waiters];
    waiters.clear();
    current.forEach((resolve) => resolve(settled));
  };

  return {
    begin() {
      activeCount += 1;
    },
    end() {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) resolveAll(true);
      return activeCount > 0;
    },
    isPending() {
      return activeCount > 0;
    },
    wait() {
      if (activeCount === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const finish = (settled: boolean) => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve(settled);
        };
        waiters.add(finish);
        timer = setTimeout(() => finish(false), timeoutMs);
      });
    },
  };
}
