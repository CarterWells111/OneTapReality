import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Beta release governance", () => {
  it("records the approved shared-album migration chain without reusing its numbers", () => {
    const decisions = read("docs/DECISIONS.md");
    const journal = read("drizzle/meta/_journal.json");

    expect(decisions).toContain("共享相册协作进入主线并取代旧 Beta 候选排除规则");
    expect(decisions).toContain("尚未实施的 `0008_database_phase2` 不得再占用或改写");
    expect(existsSync(join(process.cwd(), "drizzle", "0008_database_phase2.sql"))).toBe(false);
    expect(existsSync(join(process.cwd(), "drizzle", "0008_shared_album_covers.sql"))).toBe(true);
    expect(existsSync(join(process.cwd(), "drizzle", "0009_shared_album_covers.sql"))).toBe(false);
    expect(existsSync(join(process.cwd(), "drizzle", "0009_gift_member_activations.sql"))).toBe(true);
    expect(existsSync(join(process.cwd(), "drizzle", "0010_shared_album_collaboration.sql"))).toBe(true);
    expect(journal).not.toContain("0008_database_phase2");
    expect(journal).toContain("0008_shared_album_covers");
    expect(journal).toContain("0009_gift_member_activations");
    expect(journal).toContain("0010_shared_album_collaboration");
  });

  it("keeps the first Beta iOS-only without pretending Android is complete", () => {
    const decisions = read("docs/DECISIONS.md");
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const deploymentLog = read("docs/operations/DEPLOYMENT-LOG.md");

    expect(decisions).toContain("首批 iOS Beta 实体卡准入");
    expect(decisions).toContain("第 1–2 周仅支持 iPhone / iOS");
    expect(decisions).toContain("第 3–4 周");
    expect(checklist).toContain("四周计划第 1–2 周的首批 Beta 仅支持 iPhone / iOS");
    expect(checklist).toContain("Android App Links 不属于前两周准入门槛");
    expect(deploymentLog).toContain("Android 后续非阻塞 Backlog");
    expect(deploymentLog).not.toContain("Partial（Android release 指纹阻塞）");
  });

  it("allows one separately approved staging rehearsal build before card testing", () => {
    const decisions = read("docs/DECISIONS.md");
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const alphaRunbook = read("docs/operations/ALPHA-STAGING.md");

    expect(decisions).toContain("仅用于 staging 演练的首个 `alpha` 内部构建");
    expect(checklist).toContain("`alpha` ad-hoc 构建");
    expect(checklist).toContain("`staging-testflight` TestFlight 内部构建");
    expect(checklist).toContain("云构建与 App Store Connect 提交必须分别批准");
    expect(alphaRunbook).toContain("首个 staging 演练构建");
  });

  it("keeps staging TestFlight internal-only and separate from production release", () => {
    const decisions = read("docs/DECISIONS.md");
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const testflightRunbook = read("docs/release/TESTFLIGHT-RELEASE.md");
    const alphaRunbook = read("docs/operations/ALPHA-STAGING.md");
    const cardGuide = read("docs/operations/IOS-NFC-CARD-TEST.md");

    expect(decisions).toContain("Staging TestFlight 内部演练");
    expect(decisions).toContain("`staging-testflight` 只连接 staging API");
    expect(checklist).toContain("`staging-testflight` TestFlight 内部构建");
    expect(checklist).toContain("不代表 production 或公开 App Store 放行");
    expect(testflightRunbook).toContain("--profile=staging-testflight --no-submit");
    expect(testflightRunbook).toContain("--profile=staging-testflight --build-id=");
    expect(testflightRunbook).toContain("不得点击 App Store 的公开审核或发布操作");
    expect(testflightRunbook).toContain("EAS `preview` environment");
    expect(testflightRunbook).toContain("OneTapReality开发员测试");
    expect(testflightRunbook).toContain("该目标群组已启用自动分发");
    expect(testflightRunbook).toContain("其他内部群组均未启用自动分发");
    expect(testflightRunbook).toContain("省略 `--no-submit` 会被脚本拒绝");
    expect(testflightRunbook).toContain("自动加入 `OneTapReality开发员测试`");
    expect(testflightRunbook).toContain("不得新建或改选群组");
    expect(alphaRunbook).toContain("`alpha` 或 `staging-testflight`");
    expect(cardGuide).toContain("`alpha` 或 `staging-testflight`");
    expect(cardGuide).toContain("https://api-staging.onetapreality.com");
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
    expect(guide).toContain("Prepare blank card");
    expect(guide).toContain("Initialize current blank card");
    expect(guide).toContain("active 状态");
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
