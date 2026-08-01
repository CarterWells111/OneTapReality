function createGracefulShutdown({
  server,
  closeDatabase,
  setExitCode,
  reportError = console.error,
  timeoutMs = 10_000,
}) {
  let started = false;

  return function shutdown() {
    if (started) return;
    started = true;

    const deadline = setTimeout(() => {
      setExitCode(1);
      server.closeAllConnections?.();
    }, timeoutMs);
    deadline.unref?.();

    server.close(async (error) => {
      try {
        if (error) {
          reportError("Unable to close HTTP server");
          setExitCode(1);
        }
        await closeDatabase();
      } catch {
        reportError("Unable to close PostgreSQL pool");
        setExitCode(1);
      } finally {
        clearTimeout(deadline);
      }
    });
  };
}

module.exports = { createGracefulShutdown };
