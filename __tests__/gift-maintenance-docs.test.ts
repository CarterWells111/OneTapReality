import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("gift maintenance operations documentation", () => {
  it("removes the obsolete Railway Cron architecture", () => {
    expect(read("docs/SECURITY.md")).not.toContain("Railway Cron");
    expect(read("docs/backend/RAILWAY.md")).not.toContain("同一仓库的维护 Cron 复用 Railway build 配置");
  });

  it("documents local backup verification and separate production approvals", () => {
    const runbook = read("docs/operations/GIFT-MAINTENANCE.md");

    expect(runbook).toContain("pg_dump");
    expect(runbook).toContain("本地恢复验证");
    expect(runbook).toContain("Workers Free");
    expect(runbook).toContain("分别批准");
    expect(runbook).toContain("npm run worker:check");
  });
});
