const { runRailwayPredeploy } = require("../scripts/railway-predeploy.cjs");

describe("Railway pre-deploy migration gate", () => {
  it("skips migrations when the service has not opted in", () => {
    const execute = jest.fn();
    const log = jest.fn();

    const exitCode = runRailwayPredeploy({
      env: {},
      execute,
      log,
    });

    expect(exitCode).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Skipping database migrations for this Railway service.",
    );
  });

  it("runs the migration command only when the API service opts in", () => {
    const execute = jest.fn().mockReturnValue({ status: 0 });

    const exitCode = runRailwayPredeploy({
      env: { RUN_DB_MIGRATIONS: "true" },
      execute,
      log: jest.fn(),
    });

    expect(exitCode).toBe(0);
    expect(execute).toHaveBeenCalledWith("npm", ["run", "db:migrate"], {
      stdio: "inherit",
    });
  });
});
