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

    expect(() =>
      assertApprovalSequence({
        profile: "beta-external",
        submit: true,
        buildId: null,
      }),
    ).toThrow("two approvals");
  });

  it("forbids every external Beta release bypass and requires an explicit profile", () => {
    const { assertReleaseOptions } = require(modulePath) as {
      assertReleaseOptions: (options: Record<string, unknown>) => void;
    };
    const valid = {
      profile: "beta-external",
      profileExplicit: true,
      submit: false,
      buildId: null,
      checks: true,
      allowDirty: false,
    };

    expect(() => assertReleaseOptions(valid)).not.toThrow();
    expect(() => assertReleaseOptions({ ...valid, profileExplicit: false })).toThrow(
      "explicit --profile=beta-external",
    );
    expect(() => assertReleaseOptions({ ...valid, checks: false })).toThrow(
      "--skip-checks",
    );
    expect(() => assertReleaseOptions({ ...valid, allowDirty: true })).toThrow(
      "--allow-dirty",
    );
  });

  it("enforces the external version, commit and EAS fingerprint metadata", () => {
    const { assertBuildMatchesSubmission } = require(modulePath) as {
      assertBuildMatchesSubmission: (
        build: Record<string, unknown>,
        expected: Record<string, unknown>,
      ) => void;
    };
    const expected = {
      buildId: "build-112",
      profile: "beta-external",
      projectId: "project-123",
      appVersion: "1.1.2",
      gitCommitHash: "abc123",
      fingerprintHash: "fingerprint-123",
      requireArtifactMetadata: true,
      expectedAppBuildVersion: 23,
    };
    const validBuild = {
      id: "build-112",
      status: "FINISHED",
      platform: "IOS",
      distribution: "STORE",
      buildProfile: "beta-external",
      appVersion: "1.1.2",
      appBuildVersion: "23",
      gitCommitHash: "abc123",
      fingerprint: { hash: "fingerprint-123" },
      app: { id: "project-123" },
    };

    expect(() => assertBuildMatchesSubmission(validBuild, expected)).not.toThrow();
    for (const changed of [
      { appVersion: "1.1.1" },
      { gitCommitHash: "different" },
      { fingerprint: { hash: "different" } },
      { fingerprint: null },
      { appBuildVersion: "22" },
      { appBuildVersion: undefined },
      { appBuildVersion: "24" },
    ]) {
      expect(() =>
        assertBuildMatchesSubmission({ ...validBuild, ...changed }, expected),
      ).toThrow();
    }
  });

  it("requires every resumed external build to be numeric and newer than Build 22", () => {
    const { assertBuildMatchesSubmission } = require(modulePath) as {
      assertBuildMatchesSubmission: (
        build: Record<string, unknown>,
        expected: Record<string, unknown>,
      ) => void;
    };
    const expected = {
      buildId: "build-resume",
      profile: "beta-external",
      projectId: "project-123",
    };
    const validBuild = {
      id: "build-resume",
      status: "FINISHED",
      platform: "IOS",
      distribution: "STORE",
      buildProfile: "beta-external",
      appBuildVersion: "23",
      app: { id: "project-123" },
    };

    expect(() => assertBuildMatchesSubmission(validBuild, expected)).not.toThrow();
    for (const appBuildVersion of ["22", undefined, "not-a-number"]) {
      expect(() =>
        assertBuildMatchesSubmission({ ...validBuild, appBuildVersion }, expected),
      ).toThrow(/appBuildVersion/);
    }

    const internalExpected = {
      ...expected,
      profile: "staging-testflight",
    };
    expect(() =>
      assertBuildMatchesSubmission(
        {
          ...validBuild,
          buildProfile: "staging-testflight",
          appBuildVersion: undefined,
        },
        internalExpected,
      ),
    ).not.toThrow();
  });

  it("derives the external candidate from the authoritative remote iOS build number", () => {
    const {
      getExpectedExternalBuildNumber,
      parseRemoteBuildNumber,
    } = require(modulePath) as {
      getExpectedExternalBuildNumber: (output: string) => number;
      parseRemoteBuildNumber: (output: string) => number | null;
    };

    expect(parseRemoteBuildNumber("iOS build number: 22")).toBe(22);
    expect(parseRemoteBuildNumber("buildNumber - 41")).toBe(41);
    expect(parseRemoteBuildNumber('{"buildNumber":"22"}')).toBe(22);
    expect(getExpectedExternalBuildNumber("iOS build number: 22")).toBe(23);
    expect(getExpectedExternalBuildNumber("buildNumber - 41")).toBe(42);
    expect(() => getExpectedExternalBuildNumber("no remote version available")).toThrow(
      "remote iOS build number",
    );
    expect(() => getExpectedExternalBuildNumber("iOS build number: 21")).toThrow(
      "at least 23",
    );
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
    expect(followUp).toContain("OneTapReality开发员测试");
    expect(followUp).toContain(
      "automatic distribution is disabled for every other internal group",
    );
    expect(followUp).not.toContain("add the build to a TestFlight group");

    const externalFollowUp = getSubmissionFollowUp("beta-external").join("\n");
    expect(externalFollowUp).toContain("manually add");
    expect(externalFollowUp).toContain("Beta App Review");
    expect(externalFollowUp).not.toContain("automatically targets");
  });
});
