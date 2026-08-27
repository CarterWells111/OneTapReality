import type { MemoryDraftInput, StoryPage } from "../../types/memory";
import { cityRegistry, type City } from "../../types/city";
import { createLegacyLayout } from "../../features/canvas/canvas-layout";
import { createPhotoLayout } from "../../features/canvas/auto-layout";
import { createPhotoTemplateLayout } from "../../features/canvas/photo-templates";

export interface DraftGenerator {
  generate(input: MemoryDraftInput): Promise<StoryPage[]>;
}

const existingCityPhrases: Partial<Record<City, string>> = {
  hangzhou: "在西湖边慢慢走过的这一天",
  shanghai: "在城市灯光里并肩前行的这一天",
  shenzhen: "在海风与新鲜感中出发的这一天",
};

const cityPhrases: Record<City, string> = Object.fromEntries(cityRegistry.map((city) => [
  city.id,
  existingCityPhrases[city.id] ?? `在${city.name}慢慢走过的这一天`,
])) as Record<City, string>;

/**
 * 根据用户上传照片数量动态生成旅行册页面。
 *
 * 结构：无页面计划时为封面(1) + 每张照片一页(N) + 尾页(1)；
 * 提供非空页面计划时为封面(1) + 按计划排列的照片页 + 尾页(1)。
 * 封面包含完整 layout，可在编辑器中修改颜色/背景图。
 */
export class DemoDraftGenerator implements DraftGenerator {
  async generate(input: MemoryDraftInput): Promise<StoryPage[]> {
    const pages: StoryPage[] = [];
    const photos = input.photoUris;
    const photoCount = photos.length;
    const coverColor = input.coverColor ?? "#EFE2CF";

    // 封面页 —— 带完整 layout
    pages.push({
      id: "cover",
      position: 0,
      kind: "cover",
      headline: input.title,
      body: `${input.travelDate} · ${cityPhrases[input.city]}`,
      coverColor,
      coverImage: input.coverImage,
    });

    const pagePlans = input.pagePlans;
    if (Array.isArray(pagePlans) && pagePlans.length > 0) {
      for (let i = 0; i < pagePlans.length; i += 1) {
        const plan = pagePlans[i];
        const photoPage: StoryPage = {
          id: `photo-${i + 1}`,
          position: pages.length,
          kind: "photo",
          headline: "把这一刻留住",
          body: `这一页收录了 ${plan.photoUris.length} 张照片。`,
          photoUri: plan.photoUris[0],
        };
        const imageLayout = (plan.photoTemplateId
          ? createPhotoTemplateLayout(plan.photoUris, plan.photoTemplateId)
          : null) ?? createPhotoLayout(plan.photoUris);
        const legacyTextElements = createLegacyLayout(photoPage).elements
          .filter((element) => element.type === "text")
          .map((element, index) => ({
            ...element,
            zIndex: imageLayout.elements.length + index + 1,
          }));
        pages.push({
          ...photoPage,
          layout: {
            ...imageLayout,
            elements: [...imageLayout.elements, ...legacyTextElements],
          },
        });
      }
    } else {
      // 每张照片独立一页（兼容未提供页面计划的旧调用）
      for (let i = 0; i < photoCount; i += 1) {
        pages.push({
          id: `photo-${i + 1}`,
          position: pages.length,
          kind: "photo",
          headline: "把这一刻留住",
          body: photoCount === 1
            ? "我们选了 1 张照片，记录这段只属于我们的旅程。"
            : `我们选了 ${photoCount} 张照片，记录这段只属于我们的旅程。`,
          photoUri: photos[i],
        });
      }
    }

    // 尾页
    pages.push({
      id: "closing",
      position: pages.length,
      kind: "closing",
      headline: "下一次，继续一起出发",
      body: "这本旅行册可以继续由我们亲手补完。",
    });

    return pages;
  }
}
