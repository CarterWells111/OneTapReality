import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("external Beta first-month operations documentation", () => {
  const runbookPath = "docs/operations/EXTERNAL-BETA-OBSERVATION.md";

  it("publishes one authoritative staging-first daily and weekly runbook", () => {
    expect(existsSync(join(process.cwd(), runbookPath))).toBe(true);
    const runbook = read(runbookPath);

    for (const required of [
      "外部 Beta 仅连接 staging",
      "北京时间 09:00",
      "每周一北京时间 09:15",
      "连续 3 次",
      "P0",
      "P1",
      "P2",
      "28 天",
      "4 次周报",
      "10–20 位",
    ]) {
      expect(runbook).toContain(required);
    }
  });

  it("keeps automated observation read-only, sanitized, and free of new paid services", () => {
    const runbook = read(runbookPath);

    for (const forbiddenAction of ["POST", "migration", "deployment", "pg_dump", "维护 POST", "写 SQL"]) {
      expect(runbook).toContain(forbiddenAction);
    }
    expect(runbook).toContain("不得执行");
    expect(runbook).toContain("只读聚合 SELECT");
    expect(runbook).toContain("不增加分析 SDK");
    expect(runbook).toContain("不新增付费监控");
    expect(runbook).toContain("待人工确认");
    expect(runbook).toContain("不得猜测为零");
    expect(runbook).toContain("不得输出邮箱、Token、对象键、连接串或用户内容");
    expect(runbook).toContain("production 最近维护状态由负责人每日人工核对");
    expect(runbook).toContain("不得向自动任务提供 production 数据库凭据");
    expect(runbook).toContain("last_error_code");
    expect(runbook).toContain("complete_by");
  });

  it("requires Schema 14 for the active external Beta gate", () => {
    const release = read("docs/release/EXTERNAL-BETA-1.1.2.md");

    expect(release).toContain("schemaVersion>=14");
    expect(release).not.toContain("schemaVersion>=13");
  });

  it("links the runbook from active operations and release governance", () => {
    for (const path of [
      "docs/DECISIONS.md",
      "docs/EXECUTION-CHECKLIST.md",
      "docs/operations/GIFT-MAINTENANCE.md",
      "docs/operations/DEPLOYMENT-LOG.md",
      "docs/release/EXTERNAL-BETA-1.1.2.md",
    ]) {
      expect(read(path)).toContain("EXTERNAL-BETA-OBSERVATION.md");
    }
  });

  it("records completed NFC and external Beta gates instead of stale blocked states", () => {
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const deploymentLog = read("docs/operations/DEPLOYMENT-LOG.md");
    const external = read("docs/release/EXTERNAL-BETA-1.1.2.md");

    expect(checklist).toContain("三张 iOS 实体测试卡完成");
    expect(checklist).toContain("外部 TestFlight 已发布");
    expect(deploymentLog).toContain("实体 NFC 验收完成");
    expect(external).toContain("状态：已发布并进入首月观察");
    expect(checklist).not.toContain("其余准入项（EAS alpha 构建、实体卡演练）仍为 Blocked");
  });
});
