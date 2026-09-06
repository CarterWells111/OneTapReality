const { spawnSync } = require("node:child_process");
const { resolveBuildVariant } = require("./build-variants.cjs");

const [variantName, ...expoArguments] = process.argv.slice(2);
resolveBuildVariant(variantName);
if (expoArguments.length === 0) {
  throw new Error("An Expo command is required");
}

const expoCli = require.resolve("expo/bin/cli");
const result = spawnSync(process.execPath, [expoCli, ...expoArguments], {
  cwd: process.cwd(),
  env: { ...process.env, APP_VARIANT: variantName },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
