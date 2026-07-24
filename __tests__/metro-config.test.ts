import { execFileSync } from "node:child_process";
import { join } from "node:path";

describe("Metro configuration", () => {
  it("does not block the active linked worktree itself", () => {
    const target = join(process.cwd(), ".worktrees", "feature", "node_modules", "expo");
    const output = execFileSync(
      process.execPath,
      ["-e", `const config = require('./metro.config'); process.stdout.write(JSON.stringify([config.resolver.blockList.test(${JSON.stringify(target)}), config.resolver.blockList.test('.worktrees/feature/node_modules/expo')]));`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toBe("[false,false]");
  });
});
