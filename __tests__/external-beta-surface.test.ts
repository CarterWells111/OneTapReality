import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  isExternalBetaAudience,
  parseReleaseAudience,
} from "../src/features/release/release-audience";

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (relativePath === join("src", "app", "api")) return [];
      return collectSourceFiles(relativePath);
    }
    return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [relativePath] : [];
  });
}

function readSources(paths: readonly string[]): string {
  return paths.map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
}

const forbiddenExternalRoutePattern =
  /^src\/app\/(?:(?:\(tabs\)\/)?shop(?:\/|\.[cm]?[jt]sx?$)|backend(?:\/|\.[cm]?[jt]sx?$)|nfc-demo(?:\/|\.[cm]?[jt]sx?$))/u;

function normalizeSourcePath(path: string): string {
  return path.replaceAll("\\", "/");
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
    expect(releaseScript).toContain("expectedAppBuildVersion");
    expect(releaseScript).toContain("getExpectedExternalBuildNumber");
    expect(releaseScript).toContain(
      "allowFailure: options.profile !== EXTERNAL_BETA_PROFILE",
    );
    expect(releaseScript.indexOf("getExpectedExternalBuildNumber(versionOutput)")).toBeLessThan(
      releaseScript.indexOf("startBuild(options.profile)"),
    );
    expect(
      releaseScript.indexOf("auditExternalBetaRemoteEnvironmentVariables();"),
    ).toBeLessThan(releaseScript.indexOf("fingerprintHash = generateFingerprint"));
    expect(releaseScript).toContain("suppressCapturedOutputOnFailure: true");
  });

  it("removes every commerce and internal-tool route module from the public route graph", () => {
    const forbiddenRoutes = [
      "src/app/(tabs)/shop.tsx",
      "src/app/shop/[skuId].tsx",
      "src/app/shop/orders.tsx",
      "src/app/shop/favorites.tsx",
      "src/app/backend/index.tsx",
      "src/app/nfc-demo/[city].tsx",
    ];

    for (const path of forbiddenRoutes) {
      expect(existsSync(join(process.cwd(), path))).toBe(false);
    }

    const routeModules = collectSourceFiles("src/app");
    expect(
      routeModules.map(normalizeSourcePath).filter((path) => forbiddenExternalRoutePattern.test(path)),
    ).toEqual([]);
    for (const prohibitedExample of [
      "src/app/shop/index.tsx",
      "src/app/shop/category/[id].tsx",
      "src/app/backend/status.tsx",
      "src/app/nfc-demo/index.tsx",
      "src/app/(tabs)/shop/index.tsx",
    ]) {
      expect(forbiddenExternalRoutePattern.test(prohibitedExample)).toBe(true);
    }

    const routeGraph = readSources(routeModules);
    expect(routeGraph).not.toMatch(
      /["'`](?:\/shop(?:\/[^"'`]*)?|\/backend(?:\/[^"'`]*)?|\/nfc-demo(?:\/[^"'`]*)?)["'`]|name=["'](?:shop|backend|nfc-demo)/u,
    );
    expect(routeGraph).not.toMatch(/DeveloperNfcConsole|developer-nfc-console|nfc-url-writer/u);
  });

  it("keeps named test scripts free of deleted route-specific suites", () => {
    const packageJson = readJson("package.json");
    const backendScript = String(packageJson.scripts["test:backend"] ?? "");
    const namedTestPaths = backendScript
      .split(/\s+/u)
      .filter((token) => token.startsWith("__tests__/"));

    expect(namedTestPaths.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });

  it("keeps external user-visible source free of commerce, internal and misleading claims", () => {
    const externalSources = readSources([
      ...collectSourceFiles("src/app"),
      ...collectSourceFiles("src/components"),
      ...collectSourceFiles("src/features/cities"),
      "src/features/export/share-action-sheet.ts",
    ]);

    expect(externalSources).not.toMatch(/纪念品商店|购物袋|我的订单|我的收藏|优惠券|配送|物流进度/u);
    expect(externalSources).not.toMatch(/后端状态|开发者管理员|本地演示|AI\s*辅助|OWNER ONLY|OWNER APPROVAL REQUIRED/u);
    expect(externalSources).not.toMatch(/\.tralbum/u);
    expect(externalSources).toContain("本地草稿默认保存在此设备；只有你主动发布礼品时，所选内容才会上传给受邀成员。");
    expect(externalSources).toContain("本地规则生成的可编辑初稿，不分析照片内容");
  });

  it("does not render an English city slug or dotted placeholder treatment", () => {
    const citySearch = readFileSync(join(process.cwd(), "src/app/city-map/index.tsx"), "utf8");
    const cityUi = readSources([
      "src/app/(tabs)/cities.tsx",
      "src/features/cities/city-card.tsx",
      "src/features/cities/city-workspace-content.tsx",
    ]);

    expect(citySearch).not.toContain("styles.dropdownId");
    expect(citySearch).not.toMatch(/<Text[^>]*>\s*\{entry\.id\}/u);
    expect(cityUi).not.toMatch(/borderStyle:\s*["']dashed["']/u);
  });

  it("keeps privacy copy and client errors free of infrastructure and raw server details", () => {
    const privacy = readFileSync(join(process.cwd(), "src/app/privacy/index.tsx"), "utf8");
    const clientRoutes = readSources([
      ...collectSourceFiles("src/app"),
      "src/features/gifts/shared-album-editor.tsx",
    ]);

    expect(privacy).not.toMatch(/SQLite|R2|Canvas|staging|production|\bowner\b|\bviewer\b|\beditor\b/u);
    expect(clientRoutes).not.toMatch(
      /set(?:Message|Error|Status|RequestMessage)\([^;\n]*(?:error|caughtError)\.message/u,
    );
  });
});
