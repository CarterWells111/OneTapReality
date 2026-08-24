import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isExternalBetaAudience,
  parseReleaseAudience,
} from "../src/features/release/release-audience";

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}

describe("external Beta release surface", () => {
  it("keeps all package and native marketing versions on 1.1.2", () => {
    const packageJson = readJson("package.json");
    const packageLock = readJson("package-lock.json");
    const appJson = readJson("app.json");

    expect(packageJson.version).toBe("1.1.2");
    expect(packageLock.version).toBe("1.1.2");
    expect(packageLock.packages[""].version).toBe("1.1.2");
    expect(appJson.expo.version).toBe("1.1.2");
  });

  it("exposes only the two public client variables to beta-external", () => {
    const eas = readJson("eas.json");
    const env = eas.build["beta-external"].env;

    expect(Object.keys(env).sort()).toEqual([
      "EXPO_PUBLIC_API_ORIGIN",
      "EXPO_PUBLIC_RELEASE_AUDIENCE",
    ]);
    expect(JSON.stringify(env)).not.toMatch(
      /DATABASE_URL|PEPPER|SECRET|PASSWORD|RESEND_API_KEY|R2_ACCESS_KEY/i,
    );
  });

  it("keeps release audiences closed to the two build-time values", () => {
    expect(parseReleaseAudience(undefined)).toBe("internal");
    expect(parseReleaseAudience("external-beta")).toBe("external-beta");
    expect(isExternalBetaAudience("external-beta")).toBe(true);
    expect(() => parseReleaseAudience("public")).toThrow("Unsupported release audience");
  });

  it("runs all local gates and metadata checks before an external EAS build", () => {
    const releaseScript = readFileSync(
      join(process.cwd(), "scripts/release-ios-testflight.cjs"),
      "utf8",
    );

    expect(releaseScript).toContain('"beta:preflight:ios"');
    expect(releaseScript).toContain('"test:ci"');
    expect(releaseScript).toContain('"build:server"');
    expect(releaseScript).toContain('"fingerprint:generate"');
    expect(releaseScript).toContain("gitCommitHash");
    expect(releaseScript).toContain("fingerprintHash");
  });
});
