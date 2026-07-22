import { finalizeCanvasGesture } from "../src/features/canvas/canvas-element";

describe("canvas gesture finalization", () => {
  it("does not decrement an active gesture for a recognizer that never started", () => {
    expect(finalizeCanvasGesture(false, 1)).toEqual({ activeGestureCount: 1, shouldCommit: false });
    expect(finalizeCanvasGesture(true, 2)).toEqual({ activeGestureCount: 1, shouldCommit: false });
    expect(finalizeCanvasGesture(true, 1)).toEqual({ activeGestureCount: 0, shouldCommit: true });
  });
});
