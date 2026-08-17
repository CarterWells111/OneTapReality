import type { ImageRequireSource } from "react-native";

export const displayFontFamily = "FontQu Smile";
export const headingFontFamily = "ChaoHuaTitleA";
export const bodyFontFamily = "ZhaohuaTypeWriter";

export const appFontSources: Record<string, ImageRequireSource> = {
  [displayFontFamily]: require("../../../assets/fonts/XiMaiXiHuan.ttf"),
  [headingFontFamily]: require("../../../assets/fonts/ChaoHuaTitleA.ttf"),
  [bodyFontFamily]: require("../../../assets/fonts/ChaoHuaTypewriter.ttf"),
};

export const canvasEditorFontSources: Record<string, ImageRequireSource> = {
  ...appFontSources,
  MaoKenZhuYuan: require("../../../assets/fonts/MaoKenZhuYuan.ttf"),
  LXGWNeoZhiSongPlus: require("../../../assets/fonts/LXGWNeoZhiSongPlus.ttf"),
};

export const canvasFontOptions: readonly { id: string; label: string; family: string }[] = [
  { id: bodyFontFamily, label: "朝华打字机", family: bodyFontFamily },
  { id: "XiMaiXiHuan", label: "喜脉喜欢", family: displayFontFamily },
  { id: "ChaoHuaTitleA", label: "朝华标题 A", family: "ChaoHuaTitleA" },
  { id: "MaoKenZhuYuan", label: "猫啃珠圆", family: "MaoKenZhuYuan" },
  { id: "LXGWNeoZhiSongPlus", label: "新致宋 Plus", family: "LXGWNeoZhiSongPlus" },
];
