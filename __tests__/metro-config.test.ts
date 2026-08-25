import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";

describe("Metro configuration", () => {
  it("treats SQLite WebAssembly as an asset instead of JavaScript source", () => {
    const { METRO_SOURCE_EXTENSIONS } = require(
      "../scripts/external-beta-surface-guards.cjs"
    ) as { METRO_SOURCE_EXTENSIONS: string[] };
    const program = "const config = require('./metro.config'); process.stdout.write(JSON.stringify({ assetExts: config.resolver.assetExts, sourceExts: config.resolver.sourceExts }));";
    const output = execFileSync(process.execPath, ["-e", program], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const extensions = JSON.parse(output) as { assetExts: string[]; sourceExts: string[] };

    expect(extensions.assetExts).toContain("wasm");
    expect(extensions.sourceExts).not.toContain("wasm");
    expect(METRO_SOURCE_EXTENSIONS.map((extension) => extension.slice(1))).toEqual(
      extensions.sourceExts,
    );
  });

  it.each([
    ["internal", "activate-entry.internal.tsx"],
    ["external-beta", "activate-entry.tsx"],
    ["public", "activate-entry.tsx"],
  ] as const)("selects the %s activation entry with Metro's resolver", (audience, fileName) => {
    const program = [
      "const path = require('node:path');",
      "const config = require('./metro.config');",
      "if (typeof config.resolver.resolveRequest !== 'function') { process.stdout.write('null'); process.exit(0); }",
      "const context = {",
      "  originModulePath: path.join(process.cwd(), 'src/app/activate.tsx'),",
      "  resolveRequest: (_context, moduleName, platform) => ({ filePath: moduleName, platform, type: 'sourceFile' }),",
      "};",
      "const selected = config.resolver.resolveRequest(context, '../features/gifts/activate-entry', 'ios');",
      "const unrelated = config.resolver.resolveRequest(context, '../components/ui', 'ios');",
      "process.stdout.write(JSON.stringify({ selected, unrelated }));",
    ].join("\n");
    const output = execFileSync(process.execPath, ["-e", program], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EXPO_PUBLIC_RELEASE_AUDIENCE: audience },
    });
    const result = JSON.parse(output) as {
      selected: { filePath: string; platform: string };
      unrelated: { filePath: string; platform: string };
    } | null;

    expect(result).not.toBeNull();
    expect(result?.selected.filePath).toBe(
      join(process.cwd(), "src", "features", "gifts", fileName),
    );
    expect(result?.selected.platform).toBe("ios");
    expect(result?.unrelated.filePath).toBe("../components/ui");
  });

  it("fails closed when Metro receives an unknown release audience", () => {
    expect(() => execFileSync(
      process.execPath,
      ["-e", "require('./metro.config')"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, EXPO_PUBLIC_RELEASE_AUDIENCE: "unexpected" },
        stdio: "pipe",
      },
    )).toThrow();
  });

  it("blocks generated and cache directories from Metro's file crawl", () => {
    const excludedDirectories = [
      ".pnpm-store",
      ".runtime",
      ".tmp",
      ".tmp-mapdata",
      "app-store-previews",
      "dist",
      "output",
    ];
    const targets = excludedDirectories.map((directory) =>
      join(process.cwd(), directory, "nested", "file.js"),
    );
    const sourceFile = join(process.cwd(), "src", "app", "index.tsx");
    const program = `const config = require('./metro.config'); process.stdout.write(JSON.stringify(${JSON.stringify(
      [...targets, sourceFile],
    )}.map((target) => config.resolver.blockList.test(target))))`;
    const output = execFileSync(process.execPath, ["-e", program], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toEqual([
      ...excludedDirectories.map(() => true),
      false,
    ]);
  });

  it("blocks linked worktrees only from the primary checkout", () => {
    const target = join(process.cwd(), ".worktrees", "feature", "node_modules", "expo");
    const routerEntry = join(process.cwd(), "node_modules", "expo-router", "entry.js");
    const program = "const config = require('./metro.config'); process.stdout.write(JSON.stringify([config.resolver.blockList.test(" + JSON.stringify(target) + "), config.resolver.blockList.test(" + JSON.stringify(routerEntry) + ")]));";
    const output = execFileSync(process.execPath, ["-e", program], { cwd: process.cwd(), encoding: "utf8" });

    expect(output).toBe(JSON.stringify([!process.cwd().split(sep).includes(".worktrees"), false]));
  });
});
