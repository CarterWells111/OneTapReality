import { createFontLoadingController } from "../src/features/typography/font-loading-state";

const definitions = [
  { id: "one", family: "One", label: "One", source: 1, byteSize: 10 },
  { id: "two", family: "Two", label: "Two", source: 2, byteSize: 20 },
  { id: "three", family: "Three", label: "Three", source: 3, byteSize: 30 },
] as const;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((pass, fail) => {
    resolve = pass;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("font loading controller", () => {
  it("loads one font at a time and prioritizes a requested queued font", async () => {
    const tasks = new Map<string, ReturnType<typeof deferred>>();
    const calls: string[] = [];
    const controller = createFontLoadingController(definitions, async (font) => {
      calls.push(font.id);
      const task = deferred();
      tasks.set(font.id, task);
      await task.promise;
    });

    controller.start();
    expect(calls).toEqual(["one"]);
    controller.request("three");
    tasks.get("one")?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(["one", "three"]);
    expect(controller.getSnapshot().activeFontId).toBe("three");
  });

  it("reports weighted completion and continues after failure", async () => {
    const controller = createFontLoadingController(definitions, async (font) => {
      if (font.id === "two") throw new Error("download failed");
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = controller.getSnapshot();

    expect(snapshot.statuses).toEqual({ one: "loaded", two: "failed", three: "loaded" });
    expect(snapshot.completedBytes).toBe(40);
    expect(snapshot.totalBytes).toBe(60);
  });

  it("retries a failed font without reloading completed fonts", async () => {
    let failures = 1;
    const calls: string[] = [];
    const controller = createFontLoadingController(definitions, async (font) => {
      calls.push(font.id);
      if (font.id === "two" && failures-- > 0) throw new Error("download failed");
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.retry("two");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(["one", "two", "three", "two"]);
    expect(controller.getSnapshot().statuses.two).toBe("loaded");
  });
});
