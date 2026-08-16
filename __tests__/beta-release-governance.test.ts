import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Beta release governance", () => {
  it("keeps database phase two and album covers out of the Beta candidate", () => {
    const decisions = read("docs/DECISIONS.md");
    const journal = read("drizzle/meta/_journal.json");

    expect(decisions).toContain("Beta 发布准备与数据库迁移顺序");
    expect(decisions).toContain("0008_database_phase2");
    expect(decisions).toContain("0009_shared_album_covers");
    expect(decisions).toContain("不得进入同一个 Beta 候选版本");
    expect(existsSync(join(process.cwd(), "drizzle", "0008_database_phase2.sql"))).toBe(false);
    expect(existsSync(join(process.cwd(), "drizzle", "0008_shared_album_covers.sql"))).toBe(false);
    expect(existsSync(join(process.cwd(), "drizzle", "0009_shared_album_covers.sql"))).toBe(false);
    expect(journal).not.toContain("0008_database_phase2");
    expect(journal).not.toContain("0009_shared_album_covers");
  });

  it("keeps the first Beta iOS-only without pretending Android is complete", () => {
    const decisions = read("docs/DECISIONS.md");
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const deploymentLog = read("docs/operations/DEPLOYMENT-LOG.md");

    expect(decisions).toContain("首批 iOS Beta 实体卡准入");
    expect(checklist).toContain("当前首批 Beta 仅支持 iPhone / iOS");
    expect(checklist).toContain("Android App Links 不属于本轮准入门槛");
    expect(deploymentLog).toContain("Android 后续非阻塞 Backlog");
    expect(deploymentLog).not.toContain("Partial（Android release 指纹阻塞）");
  });

  it("keeps a sanitized three-card iOS staging rehearsal guide", () => {
    const guide = read("docs/operations/IOS-NFC-CARD-TEST.md");
    const batchLog = read("docs/operations/NFC-CARD-BATCH-LOG.md");

    expect(guide).toContain("IOS-STG-001");
    expect(guide).toContain("IOS-STG-002");
    expect(guide).toContain("IOS-STG-003");
    expect(guide).toContain("不得记录完整 URL、token、验证码或邮箱");
    expect(guide).toContain("锁屏碰卡");
    expect(guide).toContain("GIFT_SHARING_ENABLED=false");
    expect(batchLog).toContain("IOS-BETA-STAGING-001");
  });

  it("keeps the Beta preparation specification and execution plan reviewable", () => {
    const design = read("docs/superpowers/specs/2026-08-16-beta-release-preparation-design.md");
    const plan = read("docs/superpowers/plans/2026-08-16-beta-release-preparation.md");

    expect(design).toContain("不触发云端构建");
    expect(design).toContain("staging 变量只读核对");
    expect(plan).toContain("REQUIRED SUB-SKILL");
    expect(plan).toContain("分别审批");
  });

  it("records the read-only staging gift configuration verification", () => {
    const rehearsal = read("docs/operations/REHEARSAL-RECORD.md");
    const deploymentLog = read("docs/operations/DEPLOYMENT-LOG.md");

    expect(rehearsal).toContain("2026-08-16 只读核对通过");
    expect(rehearsal).toContain("`GIFT_SHARING_ENABLED=true`");
    expect(rehearsal).toContain("`GIFT_URL_ORIGIN=https://staging.onetapreality.com`");
    expect(deploymentLog).toContain("staging 礼品分享配置只读复核");
    expect(deploymentLog).toContain("未修改变量、未触发部署");
  });
});
