import type { PartnerContent } from "../src/features/partners/partners";
import {
  buildAuditEntry,
  canDisplay,
  listDisplayableForCity,
  validatePartnerContent,
} from "../src/features/partners/partners";

const today = "2026-07-23";

function content(overrides: Partial<PartnerContent> = {}): PartnerContent {
  return {
    id: "partner-longjing",
    partnerName: "龙井茶文化工作室（演示）",
    category: "local-culture",
    city: "hangzhou",
    linkedSkuIds: ["sku-key-hangzhou"],
    source: {
      origin: "合作方直接提供的图文素材",
      obtainedAt: "2026-07-01",
      reference: "邮件存档 2026-07-01",
    },
    authorization: {
      status: "confirmed",
      licenseId: "LIC-2026-001",
      confirmedAt: "2026-07-02",
    },
    displayPeriod: { start: "2026-07-10", end: "2026-12-31" },
    charityDisclosure: {
      beneficiary: "本地茶农合作社（演示）",
      sharePercent: 5,
    },
    flags: { sellable: true, partnershipAnnounced: true },
    ...overrides,
  };
}

describe("validatePartnerContent", () => {
  it("accepts a fully documented, authorized record", () => {
    expect(validatePartnerContent(content())).toEqual([]);
  });

  it("blocks sellable marking without confirmed authorization", () => {
    const pending = content({
      authorization: { status: "pending" },
      flags: { sellable: true, partnershipAnnounced: false },
    });

    expect(validatePartnerContent(pending).join("\n")).toContain("不能标记为可售");
  });

  it("blocks partnership claims without confirmed authorization", () => {
    const declined = content({
      authorization: { status: "declined" },
      flags: { sellable: false, partnershipAnnounced: true },
    });

    expect(validatePartnerContent(declined).join("\n")).toContain("不能对外宣称为合作");
  });

  it("requires a license id when authorization is confirmed", () => {
    const missingLicense = content({
      authorization: { status: "confirmed" },
    });

    expect(validatePartnerContent(missingLicense).join("\n")).toContain("缺少授权凭据编号");
  });

  it("rejects an inverted display period", () => {
    const inverted = content({
      displayPeriod: { start: "2026-12-31", end: "2026-07-10" },
    });

    expect(validatePartnerContent(inverted).join("\n")).toContain("展示周期无效");
  });

  it("bounds charity share percent to 0-100", () => {
    const badShare = content({
      charityDisclosure: { beneficiary: "某机构", sharePercent: 120 },
    });

    expect(validatePartnerContent(badShare).join("\n")).toContain("0-100");
  });
});

describe("canDisplay", () => {
  it("displays authorized content inside its period (含首尾边界)", () => {
    expect(canDisplay(content(), today)).toBe(true);
    expect(canDisplay(content(), "2026-07-10")).toBe(true);
    expect(canDisplay(content(), "2026-12-31")).toBe(true);
  });

  it("hides content outside the display period", () => {
    expect(canDisplay(content(), "2026-07-09")).toBe(false);
    expect(canDisplay(content(), "2027-01-01")).toBe(false);
  });

  it("hides unauthorized content even inside the period", () => {
    const pending = content({
      authorization: { status: "pending" },
      flags: { sellable: false, partnershipAnnounced: false },
    });

    expect(canDisplay(pending, today)).toBe(false);
  });
});

describe("listDisplayableForCity", () => {
  it("filters by city and displayability", () => {
    const shanghaiContent = content({
      id: "partner-bund",
      city: "shanghai",
      linkedSkuIds: ["sku-key-shanghai"],
    });
    const pending = content({
      id: "partner-pending",
      authorization: { status: "pending" },
      flags: { sellable: false, partnershipAnnounced: false },
    });

    const result = listDisplayableForCity(
      [content(), shanghaiContent, pending],
      "hangzhou",
      today
    );
    expect(result.map((item) => item.id)).toEqual(["partner-longjing"]);
  });
});

describe("buildAuditEntry", () => {
  it("records the full audit trail including sku links", () => {
    const entry = buildAuditEntry(content(), today);

    expect(entry).toEqual({
      contentId: "partner-longjing",
      partnerName: "龙井茶文化工作室（演示）",
      category: "local-culture",
      city: "hangzhou",
      authorizationStatus: "confirmed",
      licenseId: "LIC-2026-001",
      displayPeriod: "2026-07-10 ~ 2026-12-31",
      displayed: true,
      sellable: true,
      linkedSkuIds: ["sku-key-hangzhou"],
      charityDisclosed: true,
      checkedAt: today,
    });
  });

  it("marks unauthorized content as neither displayed nor sellable", () => {
    const pending = content({
      authorization: { status: "pending" },
      flags: { sellable: true, partnershipAnnounced: false },
    });

    const entry = buildAuditEntry(pending, today);
    expect(entry.displayed).toBe(false);
    expect(entry.sellable).toBe(false);
  });
});
