// Catches the lockfile gaps that only surface on the EAS macOS builder.
//
// EAS Build runs `npm ci --include=dev` on macOS arm64. npm resolves a lockfile
// for the platform it runs on, so a lockfile generated on Windows can omit
// entries that only macOS needs and still pass `npm ci` locally. The failure
// then costs a full cloud build to discover:
//
//   npm error code EUSAGE
//   npm error Missing: @emnapi/core@1.11.3 from lock file
//
// That case came from `@napi-rs/wasm-runtime`, which declares @emnapi/core and
// @emnapi/runtime as non-optional peers. It is reachable only through an
// optional wasm binding that never installs on win32, so resolving the lockfile
// on Windows skipped its peers and never recorded them.
//
// This script walks the lockfile the way npm resolves modules and reports any
// dependency or required peer that has no entry in the tree.

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function loadLockfile(cwd) {
  const path = join(cwd, "package-lock.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
}

// npm resolves a dependency by walking up the node_modules chain from the
// requiring package, so mirror that lookup order against the lockfile paths.
function resolveFrom(packages, requirePath, dependency) {
  const segments = requirePath === "" ? [] : requirePath.split("/node_modules/");
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const base = segments.slice(0, depth).join("/node_modules/");
    const candidate = `${base ? `${base}/node_modules/` : "node_modules/"}${dependency}`;
    if (packages[candidate]) return { path: candidate, entry: packages[candidate] };
  }
  return null;
}

function satisfiesClause(version, clause) {
  const range = clause.trim();
  if (!range || range === "*" || range === "latest") return true;
  const wanted = range.match(/^([\^~]?)(\d+)\.(\d+)\.(\d+)/);
  const actual = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  // Anything this parser does not understand is treated as satisfied so the
  // check only ever reports problems it is confident about.
  if (!wanted || !actual) return true;

  const operator = wanted[1];
  const [wantedMajor, wantedMinor, wantedPatch] = wanted.slice(2).map(Number);
  const [major, minor, patch] = actual.slice(1).map(Number);

  if (operator === "^") {
    if (wantedMajor === 0) return major === 0 && minor === wantedMinor && patch >= wantedPatch;
    return major === wantedMajor && (minor > wantedMinor || (minor === wantedMinor && patch >= wantedPatch));
  }
  if (operator === "~") return major === wantedMajor && minor === wantedMinor && patch >= wantedPatch;
  return major === wantedMajor && minor === wantedMinor && patch === wantedPatch;
}

function satisfies(version, range) {
  return range.split("||").some((clause) => satisfiesClause(version, clause));
}

function checkLockfile(lockfile) {
  const packages = lockfile.packages ?? {};
  const missing = [];
  const mismatched = [];

  for (const [path, entry] of Object.entries(packages)) {
    if (entry.link) continue;

    const required = [
      ...Object.entries(entry.dependencies ?? {}).map(([name, range]) => ({ name, range, kind: "dependency" })),
      ...Object.entries(entry.peerDependencies ?? {})
        // Optional peers are the caller's choice to install, so npm does not
        // require them to be present in the lockfile.
        .filter(([name]) => !entry.peerDependenciesMeta?.[name]?.optional)
        .map(([name, range]) => ({ name, range, kind: "peer" })),
    ];

    for (const { name, range, kind } of required) {
      const resolved = resolveFrom(packages, path, name);
      if (!resolved) {
        missing.push({ from: path || "(root)", name, range, kind });
      } else if (!satisfies(resolved.entry.version, range)) {
        mismatched.push({ from: path || "(root)", name, range, kind, found: resolved.entry.version });
      }
    }
  }

  return { missing, mismatched, packageCount: Object.keys(packages).length };
}

function report({ missing, mismatched, packageCount }) {
  console.log(`Checked ${packageCount} lockfile entries.`);

  if (mismatched.length > 0) {
    // `overrides` in package.json intentionally pin different versions, so a
    // mismatch is informational rather than a failure.
    console.log(`\n${mismatched.length} version mismatch(es) — usually intentional (package.json "overrides"):`);
    for (const item of mismatched.slice(0, 20)) {
      console.log(`  ${item.from}\n      wants ${item.kind} ${item.name}@${item.range}, tree has ${item.found}`);
    }
  }

  if (missing.length === 0) {
    console.log("\nOK: every dependency and required peer resolves in the lockfile.");
    return 0;
  }

  console.error(`\nFAIL: ${missing.length} entr(ies) missing from the lockfile.`);
  console.error("`npm ci` will fail on the EAS macOS builder with EUSAGE even if it passes here.\n");
  for (const item of missing) {
    console.error(`  ${item.from}\n      needs ${item.kind} ${item.name}@${item.range} — no entry in the tree`);
  }
  console.error("\nFix: add each missing package to devDependencies at a version satisfying the range,");
  console.error("then run `npm install` and re-run this check. Regenerating the lockfile on Windows");
  console.error("does not help — npm prunes entries the current platform cannot install.");
  return 1;
}

function main() {
  const cwd = process.cwd();
  const result = checkLockfile(loadLockfile(cwd));
  process.exit(report(result));
}

if (require.main === module) main();

module.exports = { checkLockfile, resolveFrom, satisfies };
