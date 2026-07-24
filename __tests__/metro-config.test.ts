import { execFileSync } from "node:child_process";
import { join } from "node:path";

describe("Metro configuration", () => {
  it("does not crawl linked worktrees", () => {
    const target = join(process.cwd(), ".worktrees", "feature", "node_modules", "expo");
    const output = execFileSync(
      process.execPath,
      ["-e", `const config = require('./metro.config'); process.stdout.write(String(config.resolver.blockList.test(${JSON.stringify(target)})));`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toBe("true");
  });
});
