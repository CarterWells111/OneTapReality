import { execFileSync } from "node:child_process";
import { join } from "node:path";

describe("Metro configuration", () => {
  it("does not crawl sibling worktrees while allowing the active worktree", () => {
    const target = join(process.cwd(), "..", "feature", "node_modules", "expo");
    const activeProjectDependency = join(process.cwd(), "node_modules", "expo-router", "build", "static", "getServerManifest.js");
    const output = execFileSync(
      process.execPath,
      ["-e", `const config = require('./metro.config'); process.stdout.write(JSON.stringify([config.resolver.blockList.test(${JSON.stringify(target)}), config.resolver.blockList.test(${JSON.stringify(activeProjectDependency)})]));`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toBe("[true,false]");
  });
});
