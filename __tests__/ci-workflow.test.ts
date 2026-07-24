import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("quality gate workflow", () => {
  it("keeps production checks available for manual runs", () => {
    const workflowPath = join(
      process.cwd(),
      ".github",
      "workflows",
      "quality-gate.yml",
    );
    const workflow = existsSync(workflowPath)
      ? readFileSync(workflowPath, "utf8")
      : "";

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("Lockfile minimum (Node 20.19.4)");
    expect(workflow).toContain("node-version: 20.19.4");
    expect(workflow).toContain("Quality (Node 24)");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test:ci");
    expect(workflow).toContain("npm run build:server");
  });
});
