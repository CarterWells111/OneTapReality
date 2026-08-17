import {
  composeCanvasGestureScale,
  composeCanvasGestureRotation,
  finalizeCanvasGesture,
  nextCanvasGestureGeneration,
  shouldApplyCanvasGestureCommit,
} from "../src/features/canvas/canvas-element";
import { nextCanvasHandleGeneration } from "../src/features/canvas/selection-handles";

describe("canvas gesture finalization", () => {
  it("does not decrement an active gesture for a recognizer that never started", () => {
    expect(finalizeCanvasGesture(false, 1)).toEqual({ activeGestureCount: 1, shouldCommit: false });
    expect(finalizeCanvasGesture(true, 2)).toEqual({ activeGestureCount: 1, shouldCommit: false });
    expect(finalizeCanvasGesture(true, 1)).toEqual({ activeGestureCount: 0, shouldCommit: true });
  });

  it("rejects a delayed prior commit while preserving cumulative live rotation for the newer gesture", () => {
    const firstGeneration = nextCanvasGestureGeneration(0, 0);
    const firstRotationOffset = composeCanvasGestureRotation(0, 0.4);
    const firstFinalization = finalizeCanvasGesture(true, 1);
    const secondGeneration = nextCanvasGestureGeneration(0, firstGeneration);
    const secondLiveRotationOffset = composeCanvasGestureRotation(firstRotationOffset, 0.3);
    let liveRotationOffset = secondLiveRotationOffset;

    if (shouldApplyCanvasGestureCommit(firstGeneration, secondGeneration)) {
      liveRotationOffset = 0;
    }

    expect(firstGeneration).toBe(1);
    expect(firstFinalization).toEqual({ activeGestureCount: 0, shouldCommit: true });
    expect(secondGeneration).toBe(2);
    expect(shouldApplyCanvasGestureCommit(firstGeneration, secondGeneration)).toBe(false);
    expect(liveRotationOffset).toBeCloseTo(0.7);
    expect(0.2 + liveRotationOffset).toBeCloseTo(0.9);
    expect(finalizeCanvasGesture(true, 1)).toEqual({ activeGestureCount: 0, shouldCommit: true });
    expect(shouldApplyCanvasGestureCommit(secondGeneration, secondGeneration)).toBe(true);
  });

  it("composes back-to-back pinch scale while the first generation commit is delayed", () => {
    const firstGeneration = nextCanvasGestureGeneration(0, 0);
    const firstLiveScale = composeCanvasGestureScale(1, 1.5);
    const firstFinalization = finalizeCanvasGesture(true, 1);
    const secondGeneration = nextCanvasGestureGeneration(firstFinalization.activeGestureCount, firstGeneration);
    const secondLiveScale = composeCanvasGestureScale(firstLiveScale, 1.2);

    expect(shouldApplyCanvasGestureCommit(firstGeneration, secondGeneration)).toBe(false);
    expect(secondLiveScale).toBeCloseTo(1.8);
    expect(finalizeCanvasGesture(true, 1)).toEqual({ activeGestureCount: 0, shouldCommit: true });
    expect(shouldApplyCanvasGestureCommit(secondGeneration, secondGeneration)).toBe(true);
  });

  it("gives a handle begin ownership before updates and rejects a queued outer commit", () => {
    const outerGeneration = nextCanvasGestureGeneration(0, 0);
    const outerFinalization = finalizeCanvasGesture(true, 1);
    const handleGeneration = nextCanvasHandleGeneration(outerGeneration);
    let handlePosition = 75;

    if (shouldApplyCanvasGestureCommit(outerGeneration, handleGeneration)) {
      handlePosition = 20;
    }

    expect(handleGeneration).toBe(2);
    expect(handlePosition).toBe(75);
    expect(finalizeCanvasGesture(true, 1)).toEqual({ activeGestureCount: 0, shouldCommit: true });
    expect(shouldApplyCanvasGestureCommit(handleGeneration, handleGeneration)).toBe(true);
  });
});
