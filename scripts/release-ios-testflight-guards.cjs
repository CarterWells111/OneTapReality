function formatResumeCommand(buildId, profile) {
  return `node scripts/release-ios-testflight.cjs --profile=${profile} --build-id=${buildId}`;
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
  if (build?.project?.id !== projectId) {
    problems.push(`project ${build?.project?.id ?? "missing"} != ${projectId}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Build ${buildId} is not eligible for the ${profile} submission:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

module.exports = {
  assertBuildMatchesSubmission,
  formatResumeCommand,
};
