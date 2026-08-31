import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("1.1.2 external Beta release artifacts", () => {
  const externalGuide = "docs/release/EXTERNAL-BETA-1.1.2.md";
  const appStoreGuide = "docs/release/APP-STORE-CONNECT-1.1.2.md";
  const nfcEvidence = "docs/release/NFC-TEST-EVIDENCE.template.md";
  const testerMatrix = "docs/release/BETA-TESTER-MATRIX.template.md";

  it("ships all required non-secret review and tester templates", () => {
    for (const path of [externalGuide, appStoreGuide, nfcEvidence, testerMatrix]) {
      expect(existsSync(join(process.cwd(), path))).toBe(true);
    }
  });

  it("keeps the exact approved Beta description and review metadata", () => {
    const guide = read(appStoreGuide);

    expect(guide).toContain(
      "OneTapReality 是一款 iPhone 旅行纪念册应用。你可以在本机选择照片，生成并编辑旅行册；登录后可通过 OneTapReality 礼品卡或测试链接认领、发布，并只与受邀成员共享。本次 Beta 不包含商品购买、支付或配送。",
    );
    expect(guide).toContain("免登录旅行册");
    expect(guide).toContain("PDF 导出");
    expect(guide).toContain("邮箱登录");
    expect(guide).toContain("碰卡/链接认领");
    expect(guide).toContain("owner/viewer/editor 权限");
    expect(guide).toContain("举报与屏蔽");
    expect(guide).toContain("账号删除");
    expect(guide).toContain("support@onetapreality.com");
    expect(guide).toContain("https://onetapreality.com/privacy/");
    expect(guide).toContain("https://onetapreality.com/");
  });

  it("uses placeholders for review secrets and documents the no-card path", () => {
    const guide = read(appStoreGuide);

    expect(guide).toContain("<APP_REVIEW_EMAIL>");
    expect(guide).toContain("<APP_REVIEW_FIXED_CODE>");
    expect(guide).toContain("<OWNER_GIFT_LINK>");
    expect(guide).toContain("<VIEWER_GIFT_LINK>");
    expect(guide).toContain("<EDITOR_GIFT_LINK>");
    expect(guide).toContain("<CLAIMABLE_GIFT_LINK>");
    expect(guide).toContain("实体卡只承载同一 HTTPS Universal Link");
    expect(guide).toContain("真实凭据只填写在 App Store Connect Review Notes");
    expect(guide).toContain("不得提交到 Git");
    expect(guide).toContain("删除验证码同样使用 `<APP_REVIEW_FIXED_CODE>`");
  });

  it("requires protected staging review configuration and login/deletion smoke before building", () => {
    const external = read(externalGuide);
    const railway = read("docs/backend/RAILWAY.md");

    for (const guide of [external, railway]) {
      expect(guide).toContain("RELEASE_AUDIENCE=external-beta");
      expect(guide).toContain("APPLE_REVIEW_ACCESS_ENABLED=true");
      expect(guide).toContain("APPLE_REVIEW_EMAIL");
      expect(guide).toContain("APPLE_REVIEW_CODE");
      expect(guide).toContain("APPLE_REVIEW_FIXTURE_SECRET");
      expect(guide).toContain("APPLE_REVIEW_CLAIM_TOKEN");
    }
    expect(external).toContain("production");
    expect(external).toContain("APPLE_REVIEW_ACCESS_ENABLED=false");
    expect(external).toContain("审核登录 smoke");
    expect(external).toContain("账号删除挑战 smoke");
    expect(external).toContain("不得打印或复制邮箱、固定验证码、礼品链接或 Secret");
  });

  it("declares privacy, rating, category and release choices accurately", () => {
    const guide = read(appStoreGuide);

    for (const declaration of [
      "Contact Info → Email Address",
      "Identifiers → User ID",
      "User Content → Photos or Videos",
      "User Content → Other User Content",
      "Linked to User: Yes",
      "Purpose: App Functionality",
      "Tracking: No",
      "主分类：旅游",
      "次分类：摄影与录像",
      "User-Generated Content",
      "无公开社交、聊天、广告、赌博或不受限网页",
      "手动发布",
      "仅提交外部 TestFlight Beta",
    ]) {
      expect(guide).toContain(declaration);
    }
  });

  it("documents processors, retention, deletion and invite-only safety", () => {
    const privacy = read("docs/release/PRIVACY.md");
    const websitePrivacy = read("website/privacy/index.html");

    for (const content of [privacy, websitePrivacy]) {
      expect(content).toContain("Resend");
      expect(content).toContain("Railway");
      expect(content).toContain("PostgreSQL");
      expect(content).toContain("Cloudflare R2");
      expect(content).toContain("24 小时");
      expect(content).toContain("永久删除账号");
      expect(content).toContain("举报");
      expect(content).toContain("屏蔽");
      expect(content).toContain("support@onetapreality.com");
      expect(content).toContain("不用于跟踪");
    }
  });

  it("locks the ten-person matrix, device coverage and stop conditions", () => {
    const matrix = read(testerMatrix);
    const external = read(externalGuide);

    expect(matrix).toContain("卡 A：owner + viewer + editor（3 人）");
    expect(matrix).toContain("卡 B：owner + viewer + editor（3 人）");
    expect(matrix).toContain("卡 C：owner + viewer（2 人）");
    expect(matrix).toContain("guest / 本地旅行册专项（2 人）");
    expect(matrix).toContain("至少 5 种 iPhone 代际");
    expect(matrix).toContain("至少一台旧于 iPhone XS");
    expect(matrix).toContain("最低可取得的受支持 iOS");
    expect(matrix).toContain("上一主版本");
    expect(matrix).toContain("当前稳定版本");
    expect(matrix).toContain("邮件邀请");
    expect(matrix).toContain("不开放公共链接");
    expect(matrix).toContain("不给 App Store Connect 权限");

    for (const stopCondition of [
      "跨账号数据",
      "错误环境写卡",
      "账号删除失败",
      "审核凭据外泄",
      "启动崩溃",
    ]) {
      expect(external).toContain(stopCondition);
    }
  });

  it("keeps physical NFC evidence sanitized and scoped to uncovered checks", () => {
    const evidence = read(nfcEvidence);

    expect(evidence).toContain("不得记录完整 URL、token、验证码、邮箱、NFC UID");
    expect(evidence).toContain("NDEF 写后读回");
    expect(evidence).toContain("锁屏唤起");
    expect(evidence).toContain("Universal Link");
    expect(evidence).toContain("连续碰卡可靠性");
    expect(evidence).toContain("owner/viewer/editor 生命周期");
    expect(evidence).toContain("永久停用");
    expect(evidence).toContain("错误环境拒绝");
    expect(evidence).toContain("未覆盖才补测");
  });

  it("links the external checklist from the release and QA runbooks", () => {
    const release = read("docs/release/TESTFLIGHT-RELEASE.md");
    const qa = read("docs/release/QA-CHECKLIST.md");

    expect(release).toContain("APP-STORE-CONNECT-1.1.2.md");
    expect(release).toContain("EXTERNAL-BETA-1.1.2.md");
    expect(release).toContain("NFC-TEST-EVIDENCE.template.md");
    expect(release).toContain("BETA-TESTER-MATRIX.template.md");
    expect(qa).toContain("免登录创建、编辑、删除和 PDF 导出");
    expect(qa).toContain("举报后立即对举报者隐藏");
    expect(qa).toContain("永久删除账号及云端数据");
  });

  it("opens external-Beta staging login without widening privileged access", () => {
    const envExample = read(".env.example");
    const checklist = read("docs/EXECUTION-CHECKLIST.md");
    const security = read("docs/SECURITY.md");
    const railway = read("docs/backend/RAILWAY.md");
    const alpha = read("docs/operations/ALPHA-STAGING.md");
    const cardTest = read("docs/operations/IOS-NFC-CARD-TEST.md");
    const nfcLab = read("docs/operations/NFC-STAGING-LAB.md");
    const rehearsal = read("docs/operations/REHEARSAL-RECORD.md");
    const deploymentLog = read("docs/operations/DEPLOYMENT-LOG.md");
    const qa = read("docs/release/QA-CHECKLIST.md");
    const decision = read("docs/DECISIONS.md");
    const design = read("docs/superpowers/specs/2026-08-30-staging-open-email-auth-design.md");
    const plan = read("docs/superpowers/plans/2026-08-31-staging-open-email-auth.md");

    expect(envExample).toContain("Keep empty in active external-Beta staging and production");
    expect(checklist).toContain("- [ ] 外部 Beta staging 对所有格式有效邮箱开放验证码登录");
    expect(checklist).not.toContain("- [x] 外部 Beta staging 对所有格式有效邮箱开放验证码登录");
    expect(security).toContain("登录开放不授予管理员或礼品访问权限");
    expect(security).toContain("客户端 IP 的固定 15 分钟窗口最多签发 20 封");
    expect(railway).toContain("ALPHA_ALLOWED_EMAILS=");
    expect(railway).toContain("`GIFT_ADMIN_EMAILS` 保持独立");
    expect(railway).toContain("确认以下配置状态");
    expect(railway).toContain("schemaVersion>=14");
    expect(railway).not.toContain("schema 13");
    expect(railway).not.toContain("取得单独云端配置批准后增加以下服务端变量");
    expect(railway).not.toContain("受邀测试者的 `ALPHA_ALLOWED_EMAILS`");
    expect(alpha).toContain("外部 Beta 已取代本手册的邮箱白名单准入规则");
    expect(cardTest).toContain("受控只读邮箱只需格式有效");
    expect(cardTest).toContain("礼品访问继续由成员关系授权");
    expect(cardTest).not.toContain("管理员测试邮箱与受邀只读邮箱在 staging 白名单内");
    expect(nfcLab).toContain("无需追加或移除 `ALPHA_ALLOWED_EMAILS`");
    expect(rehearsal).toContain("2026-08-06 的白名单结果是历史验收证据");
    expect(qa).toContain("此前不在四人开发者名单的受控邮箱");
    for (const content of [decision, railway, deploymentLog, plan]) {
      expect(content).toContain("GIFT_SHARING_ENABLED=false");
      expect(content).toContain("仍服务 external Beta 的同一 staging");
      expect(content).not.toContain("恢复获批邮箱名单并重新部署");
    }
    expect(design).toContain("still serves external Beta");
    expect(design).toContain("twenty issues per hashed client-IP fixed 15-minute window");
    expect(design).not.toContain("set `ALPHA_ALLOWED_EMAILS` to the approved developer list");
    expect(plan).toContain("twenty issues per hashed client-IP fixed 15-minute window");
    expect(plan).toContain("decrement the matching issue scope only if the delete returned that row");
  });
});
