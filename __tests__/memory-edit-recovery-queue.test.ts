import { acquireMemoryEditRecoveryQueue } from "../src/features/memories/memory-edit-recovery-queue";
import type { StoryPage } from "../src/types/memory";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function snapshot(headline: string): StoryPage[] {
  return [{
    id: "page-1",
    position: 0,
    kind: "photo",
    headline,
    body: "",
  }];
}

describe("memory edit recovery queue registry", () => {
  it("reuses one queue across remount and coalesces old pending work to the newest snapshot", async () => {
    const firstWrite = deferred();
    const firstWriter = jest.fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue(undefined);
    const replacementWriter = jest.fn().mockResolvedValue(undefined);
    const first = acquireMemoryEditRecoveryQueue("owner-a:memory-1", firstWriter);
    first.enqueue(snapshot("A"));
    first.enqueue(snapshot("B"));
    first.release();

    const remounted = acquireMemoryEditRecoveryQueue("owner-a:memory-1", replacementWriter);
    expect(remounted.queue).toBe(first.queue);
    remounted.enqueue(snapshot("C"));
    firstWrite.resolve();
    await remounted.queue.waitForIdle();

    expect(firstWriter.mock.calls.map((call) => call[0][0].headline)).toEqual(["A", "C"]);
    expect(replacementWriter).not.toHaveBeenCalled();
    remounted.release();
  });

  it("uses independent queues and writers for different scoped keys", async () => {
    const writerA = jest.fn().mockResolvedValue(undefined);
    const writerB = jest.fn().mockResolvedValue(undefined);
    const leaseA = acquireMemoryEditRecoveryQueue("owner-a:memory-1", writerA);
    const leaseB = acquireMemoryEditRecoveryQueue("owner-b:memory-1", writerB);

    expect(leaseA.queue).not.toBe(leaseB.queue);
    leaseA.enqueue(snapshot("A"));
    leaseB.enqueue(snapshot("B"));
    await Promise.all([leaseA.queue.waitForIdle(), leaseB.queue.waitForIdle()]);

    expect(writerA).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ headline: "A" })]));
    expect(writerB).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ headline: "B" })]));
    leaseA.release();
    leaseB.release();
  });

  it("keeps an errored queue retryable across a remount", async () => {
    let shouldFail = true;
    const writer = jest.fn(async () => {
      if (shouldFail) throw new Error("disk full");
    });
    const first = acquireMemoryEditRecoveryQueue("owner-a:memory-error", writer);
    first.enqueue(snapshot("latest"));
    await expect(first.queue.waitForIdle()).rejects.toThrow("disk full");
    first.release();

    const remounted = acquireMemoryEditRecoveryQueue(
      "owner-a:memory-error",
      jest.fn().mockResolvedValue(undefined),
    );
    expect(remounted.queue.getState().status).toBe("error");
    shouldFail = false;
    remounted.queue.retry();
    await remounted.queue.waitForIdle();

    expect(writer).toHaveBeenCalledTimes(2);
    remounted.release();
  });

  it("retains a defensive copy of the latest enqueued snapshot", async () => {
    const writer = jest.fn().mockResolvedValue(undefined);
    const lease = acquireMemoryEditRecoveryQueue("owner-a:memory-clone", writer);
    const source = snapshot("original");
    lease.enqueue(source);
    source[0].headline = "mutated source";
    const firstRead = lease.getLatestSnapshot();
    firstRead![0].headline = "mutated read";

    expect(lease.getLatestSnapshot()?.[0].headline).toBe("original");
    await lease.queue.waitForIdle();
    lease.clearLatestSnapshot();
    expect(lease.getLatestSnapshot()).toBeNull();
    lease.release();
  });
});
