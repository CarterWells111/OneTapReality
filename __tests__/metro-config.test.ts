import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";

describe("Metro configuration", () => {
  it("blocks linked worktrees only from the primary checkout", () => {
    const target = join(process.cwd(), ".worktrees", "feature", "node_modules", "expo");
    const output = execFileSync(
      process.execPath,
      ["-e", `const config = require('./metro.config'); process.stdout.write(JSON.stringify([config.resolver.blockList.test(${JSON.stringify(target)}), config.resolver.blockList.test(${JSON.stringify(join(process.cwd(), "node_modules", "expo-router", "entry.js")))]));`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toBe(JSON.stringify([!process.cwd().split(sep).includes(".worktrees"), false]));
  });
});
