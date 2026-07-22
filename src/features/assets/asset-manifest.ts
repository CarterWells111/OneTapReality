export const assetCategories = ["sticker", "font", "frame", "palette"] as const;

export type AssetCategory = (typeof assetCategories)[number];

export const assetOrigins = ["first-party", "system", "third-party"] as const;

export type AssetOrigin = (typeof assetOrigins)[number];

export type DesignAsset = {
  /** 全局唯一 ID。 */
  id: string;
  category: AssetCategory;
  name: string;
  /** 本地预览路径；禁止远程 URL。 */
  preview: string;
  source: {
    origin: AssetOrigin;
    author?: string;
    note?: string;
  };
  license: {
    type: string;
    /** 商业授权是否已确认。 */
    commercialUseConfirmed: boolean;
    note?: string;
  };
  /** 是否可随实体商品售卖。 */
  sellable: boolean;
};

export type AssetManifest = {
  version: number;
  assets: DesignAsset[];
};

export type ManifestValidation = {
  ok: boolean;
  errors: string[];
};

function isRemotePath(path: string): boolean {
  return /^(https?|ftp):\/\//i.test(path);
}

/**
 * 校验设计资源清单：唯一 ID、必填字段、本地预览，
 * 以及“未确认商业授权的资源不能标为可售”。
 */
export function validateAssetManifest(manifest: AssetManifest): ManifestValidation {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    errors.push("manifest.version 必须是 >= 1 的整数");
  }

  for (const asset of manifest.assets) {
    const label = asset.id || "(缺少 id)";

    if (!asset.id) {
      errors.push("存在缺少 id 的资源");
    } else if (seenIds.has(asset.id)) {
      errors.push(`资源 ID 重复：${asset.id}`);
    } else {
      seenIds.add(asset.id);
    }

    if (!(assetCategories as readonly string[]).includes(asset.category)) {
      errors.push(`资源 ${label} 的分类无效：${String(asset.category)}`);
    }
    if (!asset.name) {
      errors.push(`资源 ${label} 缺少名称`);
    }
    if (!asset.preview) {
      errors.push(`资源 ${label} 缺少预览`);
    } else if (isRemotePath(asset.preview)) {
      errors.push(`资源 ${label} 的预览必须是本地路径，不允许远程 URL`);
    }
    if (!(assetOrigins as readonly string[]).includes(asset.source?.origin)) {
      errors.push(`资源 ${label} 的来源无效`);
    }
    if (!asset.license?.type) {
      errors.push(`资源 ${label} 缺少许可证类型`);
    }
    if (asset.sellable && !asset.license?.commercialUseConfirmed) {
      errors.push(`资源 ${label} 未确认商业授权，不能标为可售`);
    }
    if (asset.source?.origin === "third-party" && !asset.license?.commercialUseConfirmed) {
      errors.push(`资源 ${label} 为第三方素材且未确认授权，不允许收录`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 仅返回通过授权校验且标记可售的资源。 */
export function listSellableAssets(manifest: AssetManifest): DesignAsset[] {
  return manifest.assets.filter(
    (asset) => asset.sellable && asset.license.commercialUseConfirmed
  );
}

/** 按分类筛选资源。 */
export function listAssetsByCategory(
  manifest: AssetManifest,
  category: AssetCategory
): DesignAsset[] {
  return manifest.assets.filter((asset) => asset.category === category);
}
