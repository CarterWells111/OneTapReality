function formatResumeCommand(buildId, profile) {
  return `node scripts/release-ios-testflight.cjs --profile=${profile} --build-id=${buildId}`;
}

function assertApprovalSequence({ profile, submit, buildId }) {
  if (profile === "staging-testflight" && submit && !buildId) {
    throw new Error(
      "staging-testflight requires two approvals: build with --no-submit first, then submit the approved build with --build-id=<id>",
    );
  }
}

function formatBuildVersion(build) {
  return `version ${build?.appVersion ?? "unknown"} (${build?.appBuildVersion ?? "unknown"})`;
}

function getSubmissionFollowUp(profile) {
  if (profile === "staging-testflight") {
    return [
      "The submit profile automatically targets the internal group OneTapReality Staging NFC.",
      "Verify the build appears in that group; do not create or select another group.",
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

function assertBuildMatchesSubmission(build, { buildId, profile, projectId }) {
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

  if (problems.length > 0) {
    throw new Error(
      `Build ${buildId} is not eligible for the ${profile} submission:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

module.exports = {
  assertApprovalSequence,
  assertBuildMatchesSubmission,
  formatBuildVersion,
  formatResumeCommand,
  getSubmissionFollowUp,
};
