import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";

describe("Metro configuration", () => {
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
