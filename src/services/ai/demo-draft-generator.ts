import type { MemoryDraftInput, StoryPage } from "../../types/memory";
import { cityRegistry, type City } from "../../types/city";

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

export class DemoDraftGenerator implements DraftGenerator {
  async generate(input: MemoryDraftInput): Promise<StoryPage[]> {
    return [
      {
        id: "cover",
        position: 0,
        kind: "cover",
        headline: input.title,
        body: `${input.travelDate} · ${cityPhrases[input.city]}`,
      },
      {
        id: "photo-1",
        position: 1,
        kind: "photo",
        headline: "把这一刻留住",
        body: `我们选了 ${input.photoUris.length} 张照片，记录这段只属于我们的旅程。`,
        photoUri: input.photoUris[0],
      },
      {
        id: "closing",
        position: 2,
        kind: "closing",
        headline: "下一次，继续一起出发",
        body: "这本旅行册可以继续由我们亲手补完。",
      },
    ];
  }
}

