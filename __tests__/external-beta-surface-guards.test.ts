import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type SurfaceScanReport = {
  readonly forbiddenModules: readonly { readonly file: string; readonly reason: string }[];
  readonly forbiddenReferences: readonly {
    readonly file: string;
    readonly reference: string;
  }[];
  readonly forbiddenRoutes: readonly { readonly file: string; readonly routeUrl: string }[];
  readonly ok: boolean;
  readonly reachableModules: readonly string[];
  readonly routeEntries: readonly { readonly file: string; readonly routeUrl: string }[];
  readonly unresolvedLocalSpecifiers: readonly {
    readonly importer: string;
    readonly specifier: string;
  }[];
};

type SurfaceGuards = {
  readonly routeUrlFromEntryPath?: (entryPath: string) => string;
  readonly scanExternalBetaSurface?: (projectRoot: string) => SurfaceScanReport;
};

const surfaceGuards: SurfaceGuards = (() => {
  try {
    return require("../scripts/external-beta-surface-guards.cjs") as SurfaceGuards;
  } catch {
    return {};
  }
})();

const fixtureRoots: string[] = [];

function createFixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "external-beta-surface-"));
  fixtureRoots.push(root);
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source, "utf8");
  }
  return root;
}

function requireGuard<K extends keyof SurfaceGuards>(key: K): NonNullable<SurfaceGuards[K]> | null {
  const guard = surfaceGuards[key];
  if (typeof guard !== "function") {
    expect(guard).toEqual(expect.any(Function));
    return null;
  }
  return guard as NonNullable<SurfaceGuards[K]>;
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { force: true, recursive: true });
  }
});

describe("external Beta static route and module graph guards", () => {
  it("normalizes every Expo route group plus layout and index conventions", () => {
    const routeUrlFromEntryPath = requireGuard("routeUrlFromEntryPath");
    if (!routeUrlFromEntryPath) return;

    expect(routeUrlFromEntryPath("src/app/(public)/shop.tsx")).toBe("/shop");
    expect(routeUrlFromEntryPath("src/app/(public)/account/(private)/index.tsx")).toBe(
      "/account",
    );
    expect(routeUrlFromEntryPath("src/app/(public)/account/(private)/_layout.tsx")).toBe(
      "/account",
    );
    expect(routeUrlFromEntryPath("src/app/(public)/account/(private)/_layout.ios.tsx")).toBe(
      "/account",
    );
    expect(routeUrlFromEntryPath("src/app/(public)/shop.native.tsx")).toBe("/shop");
  });

  it("rejects shop, backend and nfc-demo routes inside arbitrary groups and URL depths", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/(public)/shop.tsx": "export default function Shop() { return null; }",
      "src/app/(public)/account/(private)/backend/status.tsx":
        "export default function Status() { return null; }",
      "src/app/(public)/trips/nfc-demo/index.tsx":
        "export default function Demo() { return null; }",
      "src/app/(public)/trips/index.tsx": "export default function Trips() { return null; }",
      "src/app/api/health+api.ts":
        "import { DeveloperNfcConsole } from '@/features/gifts/developer-nfc-console'; export function GET() { return DeveloperNfcConsole; }",
      "src/app/api/hidden+api.ios.ts":
        "import { DeveloperNfcConsole } from '@/features/gifts/developer-nfc-console'; export function GET() { return DeveloperNfcConsole; }",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.forbiddenRoutes).toEqual([
      { file: "src/app/(public)/account/(private)/backend/status.tsx", routeUrl: "/account/backend/status" },
      { file: "src/app/(public)/shop.tsx", routeUrl: "/shop" },
      { file: "src/app/(public)/trips/nfc-demo/index.tsx", routeUrl: "/trips/nfc-demo" },
    ]);
    const routeFiles = report.routeEntries.map(({ file }) => file);
    expect(routeFiles).not.toContain("src/app/api/health+api.ts");
    expect(routeFiles).not.toContain("src/app/api/hidden+api.ios.ts");
    expect(report.ok).toBe(false);
  });

  it("follows aliases and nested re-exports into forbidden client modules", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/(public)/index.tsx": "export { PublicScreen as default } from '@/ui/public-screen';",
      "src/ui/public-screen.ts": "export { PublicScreen } from './screen-bridge';",
      "src/ui/screen-bridge.ts":
        "export { DeveloperNfcConsole as PublicScreen } from '../features/gifts/developer-nfc-console';",
      "src/features/gifts/developer-nfc-console.tsx":
        "export { writeNfcUrl as DeveloperNfcConsole } from '../../services/nfc/nfc-url-writer';",
      "src/services/nfc/nfc-url-writer.ts":
        "export { catalog as writeNfcUrl } from '../../features/commerce/catalog/catalog';",
      "src/features/commerce/catalog/catalog.ts": "export const catalog = null;",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.reachableModules).toEqual(
      expect.arrayContaining([
        "src/ui/screen-bridge.ts",
        "src/features/gifts/developer-nfc-console.tsx",
        "src/services/nfc/nfc-url-writer.ts",
        "src/features/commerce/catalog/catalog.ts",
      ]),
    );
    expect(report.forbiddenModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "src/features/gifts/developer-nfc-console.tsx" }),
        expect.objectContaining({ file: "src/services/nfc/nfc-url-writer.ts" }),
        expect.objectContaining({ file: "src/features/commerce/catalog/catalog.ts" }),
      ]),
    );
    expect(report.ok).toBe(false);
  });

  it("checks forbidden route references in modules reached through the client graph", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/(public)/index.tsx": "export { PublicScreen as default } from '@/ui/public-screen';",
      "src/ui/public-screen.tsx":
        "export const PublicScreen = () => null; export const retiredHref = '/account/shop';",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.forbiddenReferences).toEqual([
      { file: "src/ui/public-screen.tsx", reference: "/account/shop" },
    ]);
    expect(report.ok).toBe(false);
  });

  it("rejects platform-specific developer console and NFC writer modules by path", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/index.tsx":
        "import { Tool } from '@/features/gifts/developer-nfc-console.ios'; import { write } from '@/services/nfc/nfc-url-writer.native'; export default Tool ?? write;",
      "src/features/gifts/developer-nfc-console.ios.tsx": "export const Tool = null;",
      "src/services/nfc/nfc-url-writer.native.ts": "export const write = null;",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.forbiddenModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "src/features/gifts/developer-nfc-console.ios.tsx" }),
        expect.objectContaining({ file: "src/services/nfc/nfc-url-writer.native.ts" }),
      ]),
    );
    expect(report.ok).toBe(false);
  });

  it("follows static imports, exports, dynamic imports and require calls with safe cycles", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/(public)/index.tsx":
        "export { value as default } from '@/safe/a'; import '@/safe/android-only'; void import('@/safe/lazy');",
      "src/safe/android-only.android.ts": "export const androidOnly = true;",
      "src/safe/a.ts": "export { value } from './b';",
      "src/safe/b.ts": "const cycle = require('./c'); export const value = cycle.value;",
      "src/safe/c.ts":
        "import './a'; require('./missing-art.png'); export const value = null;",
      "src/safe/lazy.ts": "import './b'; export const lazy = true;",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.ok).toBe(true);
    expect(report.reachableModules).toEqual(
      expect.arrayContaining([
        "src/app/(public)/index.tsx",
        "src/safe/a.ts",
        "src/safe/android-only.android.ts",
        "src/safe/b.ts",
        "src/safe/c.ts",
        "src/safe/lazy.ts",
      ]),
    );
    expect(report.unresolvedLocalSpecifiers).toEqual([]);
  });

  it("fails closed when a reachable local source reference cannot be resolved", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;
    const root = createFixture({
      "src/app/index.tsx":
        "import '@/missing/alias'; const missing = require('./missing-relative'); export default missing;",
    });

    const report = scanExternalBetaSurface(root);

    expect(report.unresolvedLocalSpecifiers).toEqual([
      { importer: "src/app/index.tsx", specifier: "./missing-relative" },
      { importer: "src/app/index.tsx", specifier: "@/missing/alias" },
    ]);
    expect(report.ok).toBe(false);
  });

  it("accepts the current external client route graph", () => {
    const scanExternalBetaSurface = requireGuard("scanExternalBetaSurface");
    if (!scanExternalBetaSurface) return;

    const report = scanExternalBetaSurface(process.cwd());

    expect(report.forbiddenRoutes).toEqual([]);
    expect(report.forbiddenModules).toEqual([]);
    expect(report.forbiddenReferences).toEqual([]);
    expect(report.unresolvedLocalSpecifiers).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
