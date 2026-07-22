/**
 * 地方文化 / 非遗 / 环保合作内容的可审计展示模型。
 * 不抓取外部内容、不涉及签约流程、不改动城市 UI。
 */

import { cities, type City } from "../../types/memory";

export const partnerCategories = [
  "local-culture",
  "intangible-heritage",
  "eco",
] as const;

export type PartnerCategory = (typeof partnerCategories)[number];

export const authorizationStatuses = ["confirmed", "pending", "declined"] as const;

export type AuthorizationStatus = (typeof authorizationStatuses)[number];

export type PartnerContent = {
  id: string;
  partnerName: string;
  category: PartnerCategory;
  city: City;
  /** 关联的商品 SKU（可为空数组）。 */
  linkedSkuIds: string[];
  /** 内容来源记录。 */
  source: {
    origin: string;
    obtainedAt: string;
    reference?: string;
  };
  /** 授权记录。 */
  authorization: {
    status: AuthorizationStatus;
    licenseId?: string;
    confirmedAt?: string;
  };
  /** 展示周期（YYYY-MM-DD，含首尾）。 */
  displayPeriod: {
    start: string;
    end: string;
  };
  /** 公益披露：如有分成或捐赠必须填写。 */
  charityDisclosure?: {
    beneficiary: string;
    sharePercent: number;
    note?: string;
  };
  flags: {
    /** 是否可标记为可售（关联商品可上架）。 */
    sellable: boolean;
    /** 是否可对外宣称为合作。 */
    partnershipAnnounced: boolean;
  };
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function validatePartnerContent(content: PartnerContent): string[] {
  const errors: string[] = [];
  const label = content.id || "(缺少 id)";

  if (!content.id) {
    errors.push("合作内容缺少 id");
  }
  if (!content.partnerName) {
    errors.push(`内容 ${label} 缺少合作方名称`);
  }
  if (!(partnerCategories as readonly string[]).includes(content.category)) {
    errors.push(`内容 ${label} 的分类无效`);
  }
  if (!(cities as readonly string[]).includes(content.city)) {
    errors.push(`内容 ${label} 的城市无效`);
  }
  if (!content.source.origin || !datePattern.test(content.source.obtainedAt)) {
    errors.push(`内容 ${label} 的来源记录不完整`);
  }
  if (
    !datePattern.test(content.displayPeriod.start) ||
    !datePattern.test(content.displayPeriod.end) ||
    content.displayPeriod.start > content.displayPeriod.end
  ) {
    errors.push(`内容 ${label} 的展示周期无效`);
  }
  if (content.authorization.status === "confirmed" && !content.authorization.licenseId) {
    errors.push(`内容 ${label} 标记已授权但缺少授权凭据编号`);
  }
  if (content.flags.sellable && content.authorization.status !== "confirmed") {
    errors.push(`内容 ${label} 未获授权，不能标记为可售`);
  }
  if (content.flags.partnershipAnnounced && content.authorization.status !== "confirmed") {
    errors.push(`内容 ${label} 未获授权，不能对外宣称为合作`);
  }
  if (content.charityDisclosure) {
    const { sharePercent } = content.charityDisclosure;
    if (!content.charityDisclosure.beneficiary) {
      errors.push(`内容 ${label} 的公益披露缺少受益方`);
    }
    if (sharePercent < 0 || sharePercent > 100) {
      errors.push(`内容 ${label} 的公益分成比例必须在 0-100 之间`);
    }
  }
  return errors;
}

/**
 * 纯函数：判断内容当前是否可展示——
 * 授权已确认、通过校验，且今天在展示周期内。
 */
export function canDisplay(content: PartnerContent, todayIsoDate: string): boolean {
  if (validatePartnerContent(content).length > 0) {
    return false;
  }
  if (content.authorization.status !== "confirmed") {
    return false;
  }
  return (
    todayIsoDate >= content.displayPeriod.start &&
    todayIsoDate <= content.displayPeriod.end
  );
}

/** 按城市筛选可展示内容。 */
export function listDisplayableForCity(
  contents: readonly PartnerContent[],
  city: City,
  todayIsoDate: string
): PartnerContent[] {
  return contents.filter(
    (content) => content.city === city && canDisplay(content, todayIsoDate)
  );
}

export type PartnerAuditEntry = {
  contentId: string;
  partnerName: string;
  category: PartnerCategory;
  city: City;
  authorizationStatus: AuthorizationStatus;
  licenseId: string | null;
  displayPeriod: string;
  displayed: boolean;
  sellable: boolean;
  linkedSkuIds: string[];
  charityDisclosed: boolean;
  checkedAt: string;
};

/**
 * 纯函数：生成审计条目，记录“为什么这条内容此刻展示/不展示”。
 */
export function buildAuditEntry(
  content: PartnerContent,
  todayIsoDate: string
): PartnerAuditEntry {
  return {
    contentId: content.id,
    partnerName: content.partnerName,
    category: content.category,
    city: content.city,
    authorizationStatus: content.authorization.status,
    licenseId: content.authorization.licenseId ?? null,
    displayPeriod: `${content.displayPeriod.start} ~ ${content.displayPeriod.end}`,
    displayed: canDisplay(content, todayIsoDate),
    sellable: content.flags.sellable && content.authorization.status === "confirmed",
    linkedSkuIds: [...content.linkedSkuIds],
    charityDisclosed: content.charityDisclosure !== undefined,
    checkedAt: todayIsoDate,
  };
}
