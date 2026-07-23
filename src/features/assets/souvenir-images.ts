/** 市花纪念挂坠图片注册表：静态 require 供 Metro bundler 打包。 */

const souvenirImages: Record<string, ReturnType<typeof require>> = {
  "souvenirs/beijing-yulan.png": require("../../../assets/souvenirs/beijing-yulan.png"),
  "souvenirs/fuzhou-moli.png": require("../../../assets/souvenirs/fuzhou-moli.png"),
  "souvenirs/hangzhou-hehua.png": require("../../../assets/souvenirs/hangzhou-hehua.png"),
  "souvenirs/kunming-shancha.png": require("../../../assets/souvenirs/kunming-shancha.png"),
  "souvenirs/luoyang-mudan.png": require("../../../assets/souvenirs/luoyang-mudan.png"),
  "souvenirs/nanjing-meihua.png": require("../../../assets/souvenirs/nanjing-meihua.png"),
  "souvenirs/shanghai-baiyulan.png": require("../../../assets/souvenirs/shanghai-baiyulan.png"),
  "souvenirs/suzhou-ziteng.png": require("../../../assets/souvenirs/suzhou-ziteng.png"),
  "souvenirs/tianjin-yueji.png": require("../../../assets/souvenirs/tianjin-yueji.png"),
  "souvenirs/wuhan-hehua.png": require("../../../assets/souvenirs/wuhan-hehua.png"),
};

export function getSouvenirImage(imagePath: string) {
  return souvenirImages[imagePath] ?? null;
}
