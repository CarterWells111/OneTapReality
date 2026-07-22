import type { City } from "../../types/memory";

export const cityContent: Record<
  City,
  { name: string; subtitle: string; souvenir: string; color: string }
> = {
  hangzhou: {
    name: "杭州",
    subtitle: "把西湖边的慢时光收进册页",
    souvenir: "西湖莲影纪念钥匙",
    color: "#DDEBDD",
  },
  shanghai: {
    name: "上海",
    subtitle: "把城市灯光留在两个人的夜晚",
    souvenir: "外滩天际线纪念钥匙",
    color: "#F3E1D8",
  },
  shenzhen: {
    name: "深圳",
    subtitle: "把海风和新鲜感装进下一次出发",
    souvenir: "海湾科技线纪念钥匙",
    color: "#DDEBF4",
  },
};

