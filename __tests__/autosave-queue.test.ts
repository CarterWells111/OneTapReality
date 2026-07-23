import {
  AutosaveQueue,
  type AutosaveQueueState,
} from "../src/features/memories/autosave-queue";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

async function nextMicrotask() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutosaveQueue", () => {
  it("runs one write at a time and coalesces pending changes to the latest snapshot", async () => {
    const writes: string[] = [];
    const pendingWrites = [deferred(), deferred()];
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    const queue = new AutosaveQueue<string>(async (snapshot) => {
      writes.push(snapshot);
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      await pendingWrites[writes.length - 1].promise;
      activeWrites -= 1;
    });

    queue.enqueue("first");
    queue.enqueue("second");
    queue.enqueue("latest");
    expect(writes).toEqual(["first"]);

    pendingWrites[0].resolve();
    await nextMicrotask();
    expect(writes).toEqual(["first", "latest"]);
    pendingWrites[1].resolve();
    await queue.waitForIdle();

    expect(maximumActiveWrites).toBe(1);
    expect(queue.getState()).toEqual({ status: "saved" });
  });

  it("keeps the newest failed snapshot, rejects final waiting, and retries explicitly", async () => {
    const writes: string[] = [];
    let shouldFail = true;
    const queue = new AutosaveQueue<string>(async (snapshot) => {
      writes.push(snapshot);
      if (shouldFail) {
        throw new Error("disk full");
      }
    });

    queue.enqueue("first");
    queue.enqueue("newest");
    await expect(queue.waitForIdle()).rejects.toThrow("disk full");
    expect(queue.getState()).toEqual({
      error: expect.any(Error),
      status: "error",
    });

    shouldFail = false;
    queue.retry();
    await queue.waitForIdle();

    expect(writes).toEqual(["first", "newest"]);
    expect(queue.getState()).toEqual({ status: "saved" });
  });

  it("notifies saving, failure and retry state transitions", async () => {
    const states: AutosaveQueueState[] = [];
    const write = deferred();
    const queue = new AutosaveQueue<string>(() => write.promise);
    const unsubscribe = queue.subscribe((state) => states.push(state));

    queue.enqueue("snapshot");
    expect(states.at(-1)).toEqual({ status: "saving" });
    write.reject(new Error("write failed"));
    await expect(queue.waitForIdle()).rejects.toThrow("write failed");
    expect(states.at(-1)).toEqual({ error: expect.any(Error), status: "error" });

    unsubscribe();
  });

  it("can clear a failed pending save before a superseding destructive action", async () => {
    const queue = new AutosaveQueue<string>(async () => {
      throw new Error("write failed");
    });

    queue.enqueue("snapshot");
    await expect(queue.waitForIdle()).rejects.toThrow();
    await queue.clearAndWait();

    expect(queue.getState()).toEqual({ status: "saved" });
    await expect(queue.waitForIdle()).resolves.toBeUndefined();
  });
});
