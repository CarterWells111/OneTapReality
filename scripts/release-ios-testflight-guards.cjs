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
};
