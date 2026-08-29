function formatResumeCommand(buildId, profile) {
  return `node scripts/release-ios-testflight.cjs --profile=${profile} --build-id=${buildId}`;
}

function assertApprovalSequence({ profile, submit, buildId }) {
  if (["staging-testflight", "beta-external"].includes(profile) && submit && !buildId) {
    throw new Error(
      `${profile} requires two approvals: build with --no-submit first, then submit the approved build with --build-id=<id>`,
    );
  }
}

const MINIMUM_EXTERNAL_BUILD_NUMBER = 23;
const EXTERNAL_BETA_ENVIRONMENT = "preview";
const EXTERNAL_BETA_ENVIRONMENT_SCOPES = Object.freeze(["project", "account"]);
// beta-external pins both public client values inline in eas.json. Any remote
// preview variable would create an override or secret-merging ambiguity.
const EXTERNAL_BETA_REMOTE_ENV_ALLOWLIST = Object.freeze([]);

function stripAnsi(value) {
  return String(value ?? "").replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
}

function parseRemoteBuildNumberValue(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  const buildNumber = Number(value);
  return Number.isSafeInteger(buildNumber) ? buildNumber : null;
}

function parseRemoteBuildNumber(output) {
  const normalized = stripAnsi(output);
  const jsonStart = normalized.indexOf("{");
  const jsonEnd = normalized.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const payload = JSON.parse(normalized.slice(jsonStart, jsonEnd + 1));
      const jsonBuildNumber = parseRemoteBuildNumberValue(payload?.buildNumber);
      if (jsonBuildNumber !== null) return jsonBuildNumber;
    } catch {
      // Fall back to the stable human-readable output used by older EAS CLI versions.
    }
  }
  const match =
    normalized.match(/\bios\s+build\s*number\s*(?:[-:=]\s*)?(\d+)\b/iu) ??
    normalized.match(/\bbuildnumber\s*(?:[-:=]\s*)?(\d+)\b/iu);
  if (!match) return null;
  return parseRemoteBuildNumberValue(match[1]);
}

function parseExternalBetaEnvironmentVariableNames(output) {
  const lines = stripAnsi(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("External Beta remote environment output is unparseable");
  }

  const environmentHeader = lines.shift();
  const headerMatch = environmentHeader.match(/^Environment:\s*([a-z0-9_-]+)$/iu);
  if (!headerMatch || headerMatch[1].toLowerCase() !== EXTERNAL_BETA_ENVIRONMENT) {
    throw new Error("External Beta environment audit expected Environment: preview");
  }

  if (
    lines.length === 1 &&
    lines[0].toLowerCase() === "no variables found for this environment."
  ) {
    return [];
  }
  if (
    lines.length === 0 ||
    lines.some(
      (line) => line.toLowerCase() === "no variables found for this environment.",
    )
  ) {
    throw new Error("External Beta remote environment output is unparseable");
  }

  return lines.map((line) => {
    const separator = line.indexOf("=");
    const name = separator > 0 ? line.slice(0, separator) : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
      throw new Error("External Beta remote environment output is unparseable");
    }
    return name;
  });
}

function getExternalBetaEnvironmentAuditArgs(scope) {
  if (!EXTERNAL_BETA_ENVIRONMENT_SCOPES.includes(scope)) {
    throw new Error(`Unsupported external Beta environment scope: ${scope}`);
  }
  return [
    "env:list",
    "--environment",
    EXTERNAL_BETA_ENVIRONMENT,
    "--scope",
    scope,
    "--format",
    "short",
  ];
}

function auditExternalBetaEnvironmentOutput(output, { scope }) {
  if (!EXTERNAL_BETA_ENVIRONMENT_SCOPES.includes(scope)) {
    throw new Error(`Unsupported external Beta environment scope: ${scope}`);
  }
  const variableNames = parseExternalBetaEnvironmentVariableNames(output);
  const unexpectedCount = variableNames.filter(
    (name) => !EXTERNAL_BETA_REMOTE_ENV_ALLOWLIST.includes(name),
  ).length;
  if (unexpectedCount > 0) {
    throw new Error(
      `External Beta remote preview ${scope} scope must be empty; ` +
        `found ${unexpectedCount} variable name(s). Remove or move every remote preview ` +
        "variable before release.",
    );
  }
}

function auditExternalBetaRemoteEnvironments(readScope) {
  const outputs = [];
  for (const scope of EXTERNAL_BETA_ENVIRONMENT_SCOPES) {
    try {
      outputs.push({ scope, output: readScope(scope) });
    } catch {
      throw new Error(
        `External Beta remote preview ${scope} variable-name audit failed; release aborted`,
      );
    }
  }
  for (const { scope, output } of outputs) {
    auditExternalBetaEnvironmentOutput(output, { scope });
  }
}

function getExpectedExternalBuildNumber(output) {
  const currentBuildNumber = parseRemoteBuildNumber(output);
  if (currentBuildNumber === null) {
    throw new Error("Could not read the authoritative remote iOS build number from EAS");
  }
  const expectedBuildNumber = currentBuildNumber + 1;
  if (!Number.isSafeInteger(expectedBuildNumber)) {
    throw new Error("The next remote iOS build number is outside the safe integer range");
  }
  if (expectedBuildNumber < MINIMUM_EXTERNAL_BUILD_NUMBER) {
    throw new Error(
      `External Beta build number must be at least ${MINIMUM_EXTERNAL_BUILD_NUMBER}; ` +
        `remote ${currentBuildNumber} would produce ${expectedBuildNumber}`,
    );
  }
  return expectedBuildNumber;
}

function parseAppBuildVersion(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return null;
  const buildNumber = Number(value);
  return Number.isSafeInteger(buildNumber) ? buildNumber : null;
}

function assertReleaseOptions(options) {
  const { profile, profileExplicit, checks, allowDirty } = options;
  if (profile === "beta-external") {
    if (!profileExplicit) {
      throw new Error("External Beta requires explicit --profile=beta-external");
    }
    if (!checks) {
      throw new Error("External Beta forbids --skip-checks; all release gates are mandatory");
    }
    if (allowDirty) {
      throw new Error("External Beta forbids --allow-dirty; commit every change before release");
    }
  }
  assertApprovalSequence(options);
}

function formatBuildVersion(build) {
  return `version ${build?.appVersion ?? "unknown"} (${build?.appBuildVersion ?? "unknown"})`;
}

function getSubmissionFollowUp(profile) {
  if (profile === "staging-testflight") {
    return [
      "The submit profile automatically targets the internal group OneTapReality开发员测试.",
      "Verify the build appears in that group and that automatic distribution is disabled for every other internal group.",
      "Do not create or select another group.",
      "https://appstoreconnect.apple.com/apps/6794186067/testflight/ios",
    ];
  }
  if (profile === "beta-external") {
    return [
      "In App Store Connect, manually add the processed build to the existing external TestFlight group.",
      "Complete the external Beta metadata and submit this build for Beta App Review.",
      "Do not enable a public link and do not submit the public App Store version.",
      "https://appstoreconnect.apple.com/apps/6794186067/testflight/ios",
    ];
  }
  return [
    "Remaining steps need a human in App Store Connect:",
    "  - answer the export compliance question",
    "  - add the build to a TestFlight group",
    "  https://appstoreconnect.apple.com/apps/6794186067/testflight/ios",
  ];
}

function assertBuildMatchesSubmission(
  build,
  {
    buildId,
    profile,
    projectId,
    appVersion,
    gitCommitHash,
    fingerprintHash,
    requireArtifactMetadata = false,
    expectedAppBuildVersion,
  },
) {
  const problems = [];
  const status = String(build?.status ?? "").toUpperCase();
  const platform = String(build?.platform ?? "").toUpperCase();
  const distribution = String(build?.distribution ?? "").toUpperCase();

  if (build?.id !== buildId) problems.push(`id ${build?.id ?? "missing"} != ${buildId}`);
  if (status !== "FINISHED") problems.push(`status ${status || "missing"} != FINISHED`);
  if (platform !== "IOS") problems.push(`platform ${platform || "missing"} != IOS`);
  if (distribution !== "STORE") {
    problems.push(`distribution ${distribution || "missing"} != STORE`);
  }
  if (build?.buildProfile !== profile) {
    problems.push(`buildProfile ${build?.buildProfile ?? "missing"} != ${profile}`);
  }
  if (build?.app?.id !== projectId) {
    problems.push(`project ${build?.app?.id ?? "missing"} != ${projectId}`);
  }
  if (appVersion && build?.appVersion !== appVersion) {
    problems.push(`appVersion ${build?.appVersion ?? "missing"} != ${appVersion}`);
  }

  if (profile === "beta-external") {
    const actualBuildNumber = parseAppBuildVersion(build?.appBuildVersion);
    if (actualBuildNumber === null) {
      problems.push("appBuildVersion must be a numeric external Beta build number");
    } else {
      if (actualBuildNumber < MINIMUM_EXTERNAL_BUILD_NUMBER) {
        problems.push(
          `appBuildVersion ${actualBuildNumber} must be at least ${MINIMUM_EXTERNAL_BUILD_NUMBER}`,
        );
      }
      if (
        expectedAppBuildVersion !== undefined &&
        actualBuildNumber !== expectedAppBuildVersion
      ) {
        problems.push(
          `appBuildVersion ${actualBuildNumber} != expected remote next ${expectedAppBuildVersion}`,
        );
      }
    }
  }

  const actualGitCommitHash = build?.gitCommitHash;
  if (gitCommitHash && actualGitCommitHash !== gitCommitHash) {
    problems.push(`gitCommitHash ${actualGitCommitHash ?? "missing"} != ${gitCommitHash}`);
  } else if (requireArtifactMetadata && !actualGitCommitHash) {
    problems.push("gitCommitHash is missing from EAS build metadata");
  }

  const actualFingerprintHash = build?.fingerprint?.hash;
  if (fingerprintHash && actualFingerprintHash !== fingerprintHash) {
    problems.push(`fingerprint ${actualFingerprintHash ?? "missing"} != ${fingerprintHash}`);
  } else if (requireArtifactMetadata && !actualFingerprintHash) {
    problems.push("fingerprint.hash is missing from EAS build metadata");
  }

  if (problems.length > 0) {
    throw new Error(
      `Build ${buildId} is not eligible for the ${profile} submission:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

module.exports = {
  assertApprovalSequence,
  assertReleaseOptions,
  assertBuildMatchesSubmission,
  formatBuildVersion,
  formatResumeCommand,
  getSubmissionFollowUp,
  getExpectedExternalBuildNumber,
  auditExternalBetaEnvironmentOutput,
  auditExternalBetaRemoteEnvironments,
  getExternalBetaEnvironmentAuditArgs,
  parseExternalBetaEnvironmentVariableNames,
  parseRemoteBuildNumber,
};
