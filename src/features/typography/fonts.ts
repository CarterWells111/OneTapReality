import type { ImageRequireSource } from "react-native";

import type { FontDefinition } from "./font-loading-state";

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

const optionLabel = (id: string) => canvasFontOptions.find((font) => font.id === id)?.label ?? id;

export const localFontDefinitions: readonly FontDefinition[] = [
  { id: bodyFontFamily, family: bodyFontFamily, label: optionLabel(bodyFontFamily), source: appFontSources[bodyFontFamily], byteSize: 27_492_052 },
  { id: "XiMaiXiHuan", family: displayFontFamily, label: optionLabel("XiMaiXiHuan"), source: appFontSources[displayFontFamily], byteSize: 9_487_176 },
  { id: headingFontFamily, family: headingFontFamily, label: optionLabel(headingFontFamily), source: appFontSources[headingFontFamily], byteSize: 39_889_916 },
  { id: "MaoKenZhuYuan", family: "MaoKenZhuYuan", label: optionLabel("MaoKenZhuYuan"), source: canvasEditorFontSources.MaoKenZhuYuan, byteSize: 5_708_296 },
  { id: "LXGWNeoZhiSongPlus", family: "LXGWNeoZhiSongPlus", label: optionLabel("LXGWNeoZhiSongPlus"), source: canvasEditorFontSources.LXGWNeoZhiSongPlus, byteSize: 12_755_118 },
];
