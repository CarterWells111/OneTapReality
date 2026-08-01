const { createGracefulShutdown } = require("../src/server/http/graceful-shutdown.cjs") as {
  createGracefulShutdown: (input: {
    server: { close: (callback: (error?: Error) => void) => void };
    closeDatabase: () => Promise<void>;
    setExitCode: (code: number) => void;
    timeoutMs?: number;
  }) => () => void;
};

describe("server graceful shutdown", () => {
  it("waits for HTTP close before ending the database pool", async () => {
    let closed: ((error?: Error) => void) | undefined;
    const closeDatabase = jest.fn(async () => undefined);
    const shutdown = createGracefulShutdown({
      server: { close: (callback) => { closed = callback; } },
      closeDatabase,
      setExitCode: jest.fn(),
      timeoutMs: 60_000,
    });

    shutdown();
    expect(closeDatabase).not.toHaveBeenCalled();

    await closed?.();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when multiple shutdown signals arrive", () => {
    const close = jest.fn();
    const shutdown = createGracefulShutdown({
      server: { close },
      closeDatabase: jest.fn(),
      setExitCode: jest.fn(),
      timeoutMs: 60_000,
    });

    shutdown();
    shutdown();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
