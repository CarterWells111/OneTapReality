export type AutosaveQueueState =
  | { status: "saved" }
  | { status: "saving" }
  | { error: Error; status: "error" };

type IdleWaiter = {
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

export class AutosaveQueue<T> {
  private currentWrite: Promise<void> | null = null;
  private failedSnapshot: T | undefined;
  private idleWaiters = new Set<IdleWaiter>();
  private inFlight = false;
  private listeners = new Set<(state: AutosaveQueueState) => void>();
  private pendingSnapshot: T | undefined;
  private state: AutosaveQueueState = { status: "saved" };
  private suppressFailure = false;

  constructor(private readonly write: (snapshot: T) => Promise<void>) {}

  enqueue(snapshot: T) {
    if (this.state.status === "error") {
      this.failedSnapshot = snapshot;
      return;
    }
    this.pendingSnapshot = snapshot;
    void this.drain();
  }

  getState() {
    return this.state;
  }

  retry() {
    if (this.state.status !== "error" || this.failedSnapshot === undefined) {
      return;
    }
    this.pendingSnapshot = this.failedSnapshot;
    this.failedSnapshot = undefined;
    this.setState({ status: "saved" });
    void this.drain();
  }

  subscribe(listener: (state: AutosaveQueueState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  waitForIdle(): Promise<void> {
    if (this.state.status === "error") {
      return Promise.reject(this.state.error);
    }
    if (!this.inFlight && this.pendingSnapshot === undefined) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.idleWaiters.add({ reject, resolve });
    });
  }

  async clearAndWait() {
    this.pendingSnapshot = undefined;
    this.failedSnapshot = undefined;
    this.suppressFailure = true;
    if (this.currentWrite) {
      await this.currentWrite;
    }
    this.suppressFailure = false;
    this.setState({ status: "saved" });
    this.resolveWaiters();
  }

  private async drain() {
    if (this.inFlight || this.pendingSnapshot === undefined || this.state.status === "error") {
      return;
    }

    this.inFlight = true;
    const writeLoop = this.performWrites();
    this.currentWrite = writeLoop;
    await writeLoop;
    if (this.currentWrite === writeLoop) {
      this.currentWrite = null;
    }
  }

  private async performWrites() {
    while (this.pendingSnapshot !== undefined) {
      const snapshot = this.pendingSnapshot;
      this.pendingSnapshot = undefined;
      this.setState({ status: "saving" });
      try {
        await this.write(snapshot);
      } catch (reason) {
        this.inFlight = false;
        if (this.suppressFailure) {
          this.pendingSnapshot = undefined;
          this.failedSnapshot = undefined;
          this.setState({ status: "saved" });
          this.resolveWaiters();
          return;
        }
        const error = reason instanceof Error ? reason : new Error("自动保存失败");
        this.failedSnapshot = this.pendingSnapshot ?? snapshot;
        this.pendingSnapshot = undefined;
        this.setState({ error, status: "error" });
        this.rejectWaiters(error);
        return;
      }
    }
    this.inFlight = false;
    this.setState({ status: "saved" });
    this.resolveWaiters();
  }

  private setState(state: AutosaveQueueState) {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  private resolveWaiters() {
    this.idleWaiters.forEach((waiter) => waiter.resolve());
    this.idleWaiters.clear();
  }

  private rejectWaiters(error: Error) {
    this.idleWaiters.forEach((waiter) => waiter.reject(error));
    this.idleWaiters.clear();
  }
}
