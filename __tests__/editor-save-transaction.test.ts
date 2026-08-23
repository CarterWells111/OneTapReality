import {
  createEditorSaveSnapshot,
  createTransformSettleGate,
} from "../src/features/canvas/editor-save-transaction";
import { canvasPages } from "../src/features/canvas/editor-pages";

describe("editor save transaction", () => {
  it("merges one valid pending text-style patch and resolves the active page by id", () => {
    const pages = canvasPages([
      { id: "p1", position: 0, kind: "cover", headline: "One", body: "" },
      { id: "p2", position: 1, kind: "photo", headline: "Two", body: "" },
    ]);
    const target = pages[1].layout!.elements.find((element) => element.type === "text")!;

    const snapshot = createEditorSaveSnapshot({
      activePageId: "p2",
      fallbackIndex: 0,
      pages,
      styleDraft: { color: "#123456", elementId: target.id, fontSize: 28, pageId: "p2" },
    });

    expect(snapshot.cursor).toEqual({ pageId: "p2", index: 1 });
    expect(snapshot.pages[1].layout!.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: target.id, color: "#123456", fontSize: 28 }),
    ]));
  });

  it("clamps the fallback cursor when the active page was deleted", () => {
    const pages = canvasPages([
      { id: "p1", position: 0, kind: "cover", headline: "One", body: "" },
    ]);

    expect(createEditorSaveSnapshot({ activePageId: "deleted", fallbackIndex: 9, pages }).cursor)
      .toEqual({ pageId: "p1", index: 0 });
  });

  it("waits for the final transform and times out without returning a false settled state", async () => {
    jest.useFakeTimers();
    const gate = createTransformSettleGate(1_000);
    gate.begin();
    const settled = gate.wait();
    gate.end();
    await expect(settled).resolves.toBe(true);

    gate.begin();
    const timedOut = gate.wait();
    jest.advanceTimersByTime(1_000);
    await expect(timedOut).resolves.toBe(false);
    jest.useRealTimers();
  });

  it("reports pending until every transform owner has settled", () => {
    const gate = createTransformSettleGate();
    gate.begin();
    gate.begin();

    expect(gate.end()).toBe(true);
    expect(gate.end()).toBe(false);
  });
});
