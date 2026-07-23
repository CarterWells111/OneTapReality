import {
  PAGE_TURN_DISTANCE_RATIO,
  PAGE_TURN_VELOCITY,
  resolvePageTurn,
  shouldCanvasPageHandlePan,
} from "../src/features/canvas/page-turn";

describe("resolvePageTurn", () => {
  const base = { currentIndex: 1, pageCount: 3, pageWidth: 300 };

  it("turns at the 22 percent distance threshold in either direction", () => {
    expect(resolvePageTurn({ ...base, translationX: -66, velocityX: 0 })).toEqual({
      direction: 1,
      targetIndex: 2,
      shouldTurn: true,
    });
    expect(resolvePageTurn({ ...base, translationX: 66, velocityX: 0 })).toEqual({
      direction: -1,
      targetIndex: 0,
      shouldTurn: true,
    });
    expect(PAGE_TURN_DISTANCE_RATIO).toBe(0.22);
  });

  it("turns for a fast flick even when distance is short", () => {
    expect(resolvePageTurn({ ...base, translationX: -20, velocityX: -650 })).toEqual({
      direction: 1,
      targetIndex: 2,
      shouldTurn: true,
    });
    expect(PAGE_TURN_VELOCITY).toBe(650);
  });

  it("springs back when neither threshold is reached", () => {
    expect(resolvePageTurn({ ...base, translationX: -65, velocityX: -649 })).toEqual({
      direction: 0,
      targetIndex: 1,
      shouldTurn: false,
    });
  });

  it("never moves before the first or after the last page", () => {
    expect(resolvePageTurn({ ...base, currentIndex: 0, translationX: 90, velocityX: 900 })).toEqual({
      direction: 0,
      targetIndex: 0,
      shouldTurn: false,
    });
    expect(resolvePageTurn({ ...base, currentIndex: 2, translationX: -90, velocityX: -900 })).toEqual({
      direction: 0,
      targetIndex: 2,
      shouldTurn: false,
    });
  });

  it("leaves a pan that starts inside the selected element to element editing", () => {
    const selectedElement = { x: 0.2, y: 0.25, width: 0.4, height: 0.2 };

    expect(shouldCanvasPageHandlePan({
      pageHeight: 400,
      pageWidth: 300,
      selectedElement,
      startX: 90,
      startY: 120,
    })).toBe(false);
    expect(shouldCanvasPageHandlePan({
      pageHeight: 400,
      pageWidth: 300,
      selectedElement,
      startX: 20,
      startY: 360,
    })).toBe(true);
    expect(shouldCanvasPageHandlePan({
      pageHeight: 400,
      pageWidth: 300,
      startX: 90,
      startY: 120,
    })).toBe(true);
  });
});
