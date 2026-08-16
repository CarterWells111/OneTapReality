import { existsSync } from "node:fs";
import { join } from "node:path";

describe("iOS TestFlight release guards", () => {
  const modulePath = join(
    process.cwd(),
    "scripts",
    "release-ios-testflight-guards.cjs",
  );

  it("keeps the selected profile in the build-only resume command", () => {
    if (!existsSync(modulePath)) {
      expect(existsSync(modulePath)).toBe(true);
      return;
    }

    const { formatResumeCommand } = require(modulePath) as {
      formatResumeCommand: (buildId: string, profile: string) => string;
    };

    expect(formatResumeCommand("build-123", "staging-testflight")).toBe(
      "node scripts/release-ios-testflight.cjs --profile=staging-testflight --build-id=build-123",
    );
  });

  it("accepts only a finished iOS store build from the selected profile and project", () => {
    if (!existsSync(modulePath)) {
      expect(existsSync(modulePath)).toBe(true);
      return;
    }

    const { assertBuildMatchesSubmission } = require(modulePath) as {
      assertBuildMatchesSubmission: (
        build: Record<string, unknown>,
        expected: Record<string, string>,
      ) => void;
    };
    const expected = {
      buildId: "build-123",
      profile: "staging-testflight",
      projectId: "project-123",
    };
    const validBuild = {
      id: "build-123",
      status: "FINISHED",
      platform: "IOS",
      distribution: "STORE",
      buildProfile: "staging-testflight",
      app: { id: "project-123" },
    };

    expect(() => assertBuildMatchesSubmission(validBuild, expected)).not.toThrow();
    for (const [field, value] of [
      ["status", "ERRORED"],
      ["platform", "ANDROID"],
      ["distribution", "INTERNAL"],
      ["buildProfile", "production"],
    ]) {
      expect(() =>
        assertBuildMatchesSubmission({ ...validBuild, [field]: value }, expected),
      ).toThrow();
    }
    expect(() =>
      assertBuildMatchesSubmission(
        { ...validBuild, app: { id: "another-project" } },
        expected,
      ),
    ).toThrow();
  });

  it("requires staging TestFlight build and submit to remain separate approvals", () => {
    const { assertApprovalSequence } = require(modulePath) as {
      assertApprovalSequence: (options: {
        profile: string;
        submit: boolean;
        buildId: string | null;
      }) => void;
    };

    expect(() =>
      assertApprovalSequence({
        profile: "staging-testflight",
        submit: true,
        buildId: null,
      }),
    ).toThrow();
    expect(() =>
      assertApprovalSequence({
        profile: "staging-testflight",
        submit: false,
        buildId: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertApprovalSequence({
        profile: "staging-testflight",
        submit: true,
        buildId: "approved-build",
      }),
    ).not.toThrow();
  });

  it("uses the EAS build fragment version field and fixed staging follow-up", () => {
    const { formatBuildVersion, getSubmissionFollowUp } = require(modulePath) as {
      formatBuildVersion: (build: Record<string, unknown>) => string;
      getSubmissionFollowUp: (profile: string) => string[];
    };

    expect(
      formatBuildVersion({ appVersion: "1.1.0", appBuildVersion: "42" }),
    ).toBe("version 1.1.0 (42)");
    const followUp = getSubmissionFollowUp("staging-testflight").join("\n");
    expect(followUp).toContain("OneTapReality Staging NFC");
    expect(followUp).not.toContain("add the build to a TestFlight group");
  });
});
