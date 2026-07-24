import * as React from "react";
import type { StoryPage } from "../../types/memory";

/**
 * 编辑器撤销/重做历史栈。
 *
 * 维护完整的页面快照数组，支持撤销和重做。
 * 新的编辑操作会清除"重做"栈中所有未来的状态。
 * 最大历史记录数：50。
 */

const MAX_HISTORY = 50;

type UndoHistoryState = {
  undoStack: StoryPage[][];
  redoStack: StoryPage[][];
};

export function useUndoHistory(onRestore: (pages: StoryPage[]) => void) {
  const stateRef = React.useRef<UndoHistoryState>({
    undoStack: [],
    redoStack: [],
  });

  const canUndo = stateRef.current.undoStack.length > 0;
  const canRedo = stateRef.current.redoStack.length > 0;

  /** 在编辑操作前保存当前状态到撤销栈。 */
  const pushState = React.useCallback((pages: StoryPage[]) => {
    const prev = stateRef.current;
    const newUndo = [...prev.undoStack, pages];
    if (newUndo.length > MAX_HISTORY) {
      newUndo.shift();
    }
    stateRef.current = {
      undoStack: newUndo,
      redoStack: [], // 新编辑操作清除重做栈
    };
  }, []);

  /** 撤销：回到上一个状态。 */
  const undo = React.useCallback((currentPages: StoryPage[]) => {
    const prev = stateRef.current;
    if (prev.undoStack.length === 0) return;
    const newUndo = [...prev.undoStack];
    const previous = newUndo.pop()!;
    const newRedo = [...prev.redoStack, currentPages];
    stateRef.current = { undoStack: newUndo, redoStack: newRedo };
    onRestore(previous);
  }, [onRestore]);

  /** 重做：前进到下一个状态。 */
  const redo = React.useCallback((currentPages: StoryPage[]) => {
    const prev = stateRef.current;
    if (prev.redoStack.length === 0) return;
    const newRedo = [...prev.redoStack];
    const next = newRedo.pop()!;
    const newUndo = [...prev.undoStack, currentPages];
    stateRef.current = { undoStack: newUndo, redoStack: newRedo };
    onRestore(next);
  }, [onRestore]);

  return { canUndo, canRedo, pushState, undo, redo } as const;
}
