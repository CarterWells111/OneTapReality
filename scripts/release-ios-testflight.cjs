// Unattended iOS TestFlight release: preflight -> EAS build -> App Store Connect.
//
// Every step is non-interactive and fails loudly, so an agent can run this end
// to end without a human at the keyboard. See docs/release/TESTFLIGHT-RELEASE.md
// for prerequisites and for the failures this ordering is designed to avoid.
//
//   node scripts/release-ios-testflight.cjs                  full run
//   node scripts/release-ios-testflight.cjs --no-submit      build only
//   node scripts/release-ios-testflight.cjs --build-id=<id>  submit an existing build
//   node scripts/release-ios-testflight.cjs --skip-checks    skip lint/typecheck/tests
//   node scripts/release-ios-testflight.cjs --allow-dirty    build with uncommitted changes

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  assertBuildMatchesSubmission,
  formatResumeCommand,
} = require("./release-ios-testflight-guards.cjs");

const EAS_CLI = process.env.EAS_CLI ?? "eas-cli@latest";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 90 * 60 * 1000;

function parseArgs(argv) {
  const options = {
    profile: "production",
    submit: true,
    checks: true,
    allowDirty: false,
    buildId: null,
  };
  for (const arg of argv) {
    if (arg === "--no-submit") options.submit = false;
    else if (arg === "--skip-checks") options.checks = false;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg.startsWith("--profile=")) options.profile = arg.slice("--profile=".length);
    else if (arg.startsWith("--build-id=")) options.buildId = arg.slice("--build-id=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function step(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

// npm and npx are .cmd shims on Windows, and Node refuses to spawn those
// without a shell. Passing an args array together with shell:true is deprecated
// (DEP0190) because the args are concatenated unescaped, so quote them here and
// hand the shell a single command string instead.
const IS_WINDOWS = process.platform === "win32";

function quoteForShell(arg) {
  if (!/[\s"'^&|<>()$`\\]/.test(arg)) return arg;
  if (IS_WINDOWS) return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function spawnPortable(command, args, extraOptions = {}) {
  const options = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...extraOptions };
  if (!IS_WINDOWS) return spawnSync(command, args, options);
  const line = [command, ...args].map(quoteForShell).join(" ");
  return spawnSync(line, { ...options, shell: true });
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const label = `${command} ${args.join(" ")}`;
  if (!capture) console.log(`$ ${label}`);
  const result = spawnPortable(command, args, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw new Error(`Failed to launch \`${label}\`: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    if (capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`\`${label}\` exited with code ${result.status}`);
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const npx = (args, options) => run("npx", ["--yes", EAS_CLI, ...args], options);

// eas-cli prints progress lines alongside --json output, so pull out the JSON.
function parseJsonFrom(output) {
  const start = output.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in eas-cli output:\n${output.slice(0, 500)}`);
  for (let end = output.length; end > start; end -= 1) {
    try {
      return JSON.parse(output.slice(start, end));
    } catch {
      // Trim from the right until the payload parses.
    }
  }
  throw new Error(`Could not parse JSON from eas-cli output:\n${output.slice(0, 500)}`);
}

function assertCleanTree(allowDirty) {
  const { stdout } = run("git", ["status", "--porcelain"], { capture: true });
  if (stdout.trim() === "") return;
  if (allowDirty) {
    console.warn("WARNING: building with uncommitted changes (--allow-dirty).");
    console.warn(stdout.trim());
    return;
  }
  throw new Error(
    `Working tree is not clean:\n${stdout.trim()}\n\n` +
      "EAS archives the working directory, so commit or stash first. Pass --allow-dirty to override.",
  );
}

function readProfileOrigin(cwd, profile) {
  const easJson = JSON.parse(readFileSync(join(cwd, "eas.json"), "utf8"));
  const origin = easJson.build?.[profile]?.env?.EXPO_PUBLIC_API_ORIGIN;
  if (!origin) throw new Error(`eas.json build.${profile}.env.EXPO_PUBLIC_API_ORIGIN is not set`);
  return origin;
}

function readProjectId(cwd) {
  const appJson = JSON.parse(readFileSync(join(cwd, "app.json"), "utf8")).expo;
  const projectId = appJson?.extra?.eas?.projectId;
  if (!projectId) throw new Error("app.json expo.extra.eas.projectId is not set");
  return projectId;
}

// The router origin is injected at config-evaluation time by app.config.ts, so
// it is only correct when EXPO_PUBLIC_API_ORIGIN matches the build profile.
function verifyExpoConfig(cwd, origin) {
  const result = spawnPortable("npx", ["expo", "config", "--json"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, EXPO_PUBLIC_API_ORIGIN: origin },
  });
  if (result.status !== 0) throw new Error(`\`expo config\` failed:\n${result.stderr}`);

  const config = parseJsonFrom(result.stdout);
  const appJson = JSON.parse(readFileSync(join(cwd, "app.json"), "utf8")).expo;
  const routerPlugin = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-router");
  const resolvedOrigin = routerPlugin?.[1]?.origin;

  const facts = {
    name: config.name,
    version: config.version,
    bundleIdentifier: config.ios?.bundleIdentifier,
    projectId: config.extra?.eas?.projectId,
    routerOrigin: resolvedOrigin,
    nonExemptEncryption: config.ios?.infoPlist?.ITSAppUsesNonExemptEncryption,
  };
  for (const [key, value] of Object.entries(facts)) console.log(`  ${key.padEnd(20)} ${value}`);

  // app.json is the source of truth; flag drift rather than hardcoding values
  // here, so this check keeps working after a rename or version bump.
  const problems = [];
  if (facts.bundleIdentifier !== appJson.ios?.bundleIdentifier) {
    problems.push(`bundleIdentifier ${facts.bundleIdentifier} != app.json ${appJson.ios?.bundleIdentifier}`);
  }
  if (facts.projectId !== appJson.extra?.eas?.projectId) {
    problems.push(`projectId ${facts.projectId} != app.json ${appJson.extra?.eas?.projectId}`);
  }
  if (facts.routerOrigin !== origin) {
    problems.push(`expo-router origin ${facts.routerOrigin} != profile origin ${origin}`);
  }
  if (facts.nonExemptEncryption !== false) {
    problems.push(`ITSAppUsesNonExemptEncryption is ${facts.nonExemptEncryption}; expected false`);
  }
  if (problems.length > 0) throw new Error(`Expo config mismatch:\n  - ${problems.join("\n  - ")}`);
}

function startBuild(profile) {
  const { stdout } = npx(
    ["build", "--platform", "ios", "--profile", profile, "--non-interactive", "--no-wait", "--json"],
    { capture: true },
  );
  const payload = parseJsonFrom(stdout);
  const build = Array.isArray(payload) ? payload[0] : payload;
  if (!build?.id) throw new Error(`Could not read a build id from eas-cli output:\n${stdout.slice(0, 500)}`);
  return build;
}

function viewBuild(buildId) {
  const { stdout } = npx(["build:view", buildId, "--json"], { capture: true });
  return parseJsonFrom(stdout);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBuild(buildId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let build;
    try {
      build = viewBuild(buildId);
    } catch (error) {
      // A transient CLI or network hiccup should not abandon a running build.
      console.warn(`  (status check failed, retrying: ${error.message.split("\n")[0]})`);
      continue;
    }
    const status = String(build.status ?? "").toUpperCase();
    console.log(`  status: ${status}`);
    if (status === "FINISHED") return build;
    if (["ERRORED", "CANCELED"].includes(status)) {
      const message = build.error?.message ?? "no error message";
      throw new Error(
        `Build ${buildId} ${status}: ${message}\n` +
          `Logs: https://expo.dev/accounts/onereality/projects/onetapreality/builds/${buildId}\n` +
          "The phase log is only visible signed in to expo.dev; eas-cli does not expose it.",
      );
    }
  }
  throw new Error(`Timed out after ${POLL_TIMEOUT_MS / 60000} minutes waiting for build ${buildId}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const projectId = readProjectId(cwd);
  let buildId = options.buildId;
  let finishedBuild;

  if (!buildId) {
    step("1. Repository state");
    assertCleanTree(options.allowDirty);
    run("git", ["log", "-1", "--oneline"]);

    step("2. Clean dependency install");
    run("npm", ["ci"]);

    // Runs before the expensive checks: a lockfile gap fails the cloud build in
    // ~15s but only after a multi-minute upload, so catch it here instead.
    step("3. Lockfile completeness (cross-platform)");
    run("node", [join("scripts", "check-release-lockfile.cjs")]);

    if (options.checks) {
      step("4. Lint, typecheck, tests, server build");
      run("npm", ["run", "lint"]);
      run("npm", ["run", "typecheck"]);
      run("npm", ["run", "test:ci"]);
      run("npm", ["run", "build:server"]);
    } else {
      step("4. Lint, typecheck, tests, server build — SKIPPED (--skip-checks)");
    }

    const origin = readProfileOrigin(cwd, options.profile);
    step(`5. Expo config resolution (origin ${origin})`);
    verifyExpoConfig(cwd, origin);

    step("6. EAS account and credentials");
    npx(["whoami"]);
    const version = npx(["build:version:get", "--platform", "ios", "--profile", options.profile], {
      capture: true,
      allowFailure: true,
    });
    const currentBuildNumber = version.stdout.match(/buildNumber\s*[-:]?\s*(\d+)/i)?.[1];
    if (currentBuildNumber) console.log(`  current remote buildNumber: ${currentBuildNumber} (next: ${Number(currentBuildNumber) + 1})`);

    step(`7. EAS build (${options.profile})`);
    const build = startBuild(options.profile);
    buildId = build.id;
    console.log(`  build id: ${buildId}`);
    console.log(`  logs:     https://expo.dev/accounts/onereality/projects/onetapreality/builds/${buildId}`);

    step("8. Waiting for the build to finish");
    finishedBuild = await waitForBuild(buildId);
    console.log(
      `  version ${finishedBuild.appVersion} (${finishedBuild.iosBuildNumber ?? finishedBuild.buildNumber})`,
    );
  } else {
    console.log(`Skipping build; validating existing build ${buildId}.`);
    finishedBuild = viewBuild(buildId);
  }

  assertBuildMatchesSubmission(finishedBuild, {
    buildId,
    profile: options.profile,
    projectId,
  });

  if (!options.submit) {
    step("Done (build only)");
    console.log(`Build ${buildId} is ready. Submit later with:`);
    console.log(`  ${formatResumeCommand(buildId, options.profile)}`);
    return;
  }

  step("9. Submit to App Store Connect");
  npx(["submit", "--platform", "ios", "--profile", options.profile, "--id", buildId, "--non-interactive"]);

  step("Done");
  console.log("Uploaded to App Store Connect. Apple processing usually takes 5-10 minutes.");
  console.log("Remaining steps need a human in App Store Connect:");
  console.log("  - answer the export compliance question");
  console.log("  - add the build to a TestFlight group");
  console.log("  https://appstoreconnect.apple.com/apps/6794186067/testflight/ios");
}

main().catch((error) => {
  console.error(`\nRELEASE FAILED\n${error.message}`);
  process.exit(1);
});
