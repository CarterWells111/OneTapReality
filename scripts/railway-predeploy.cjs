const { spawnSync } = require("node:child_process");

function runRailwayPredeploy({
  env = process.env,
  execute = spawnSync,
  log = console.log,
} = {}) {
  if (env.RUN_DB_MIGRATIONS !== "true") {
    log("Skipping database migrations for this Railway service.");
    return 0;
  }

  const result = execute("npm", ["run", "db:migrate"], { stdio: "inherit" });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  process.exitCode = runRailwayPredeploy();
}

module.exports = { runRailwayPredeploy };
