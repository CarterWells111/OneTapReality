import type { ImageRequireSource } from "react-native";

export const displayFontFamily = "FontQu Smile";
export const bodyFontFamily = "ZhaohuaTypeWriter";

export const appFontSources: Record<string, ImageRequireSource> = {
  [displayFontFamily]: require("../../../assets/fonts/XiMaiXiHuan.ttf"),
  [bodyFontFamily]: require("../../../assets/fonts/ChaoHuaTypewriter.ttf"),
};

export const canvasEditorFontSources: Record<string, ImageRequireSource> = {
  ...appFontSources,
  XiMaiXiHuan: require("../../../assets/fonts/XiMaiXiHuan.ttf"),
  PFFanHuTu: require("../../../assets/fonts/PFFanHuTu.ttf"),
  CraftMincho: require("../../../assets/fonts/CraftMincho.otf"),
  YouYouYiSong: require("../../../assets/fonts/YouYouYiSong.ttf"),
  PingFangXingChen: require("../../../assets/fonts/PingFangXingChen.ttf"),
  PingFangLangYa: require("../../../assets/fonts/PingFangLangYa.ttf"),
  PingFangFeiYang: require("../../../assets/fonts/PingFangFeiYang.ttf"),
  ChaoHuaTitleA: require("../../../assets/fonts/ChaoHuaTitleA.ttf"),
  ChaoHuaTitleB: require("../../../assets/fonts/ChaoHuaTitleB.ttf"),
  MaoKenZhuYuan: require("../../../assets/fonts/MaoKenZhuYuan.ttf"),
  FusionPixel10Mono: require("../../../assets/fonts/FusionPixel10Mono.otf"),
  PoZhenTypewriter: require("../../../assets/fonts/PoZhenTypewriter.ttf"),
  LXGWNeoZhiSong: require("../../../assets/fonts/LXGWNeoZhiSong.ttf"),
  LXGWNeoZhiSongPlus: require("../../../assets/fonts/LXGWNeoZhiSongPlus.ttf"),
  LXGWZhiSongCL: require("../../../assets/fonts/LXGWZhiSongCL.ttf"),
  LXGWZhiSongMN: require("../../../assets/fonts/LXGWZhiSongMN.ttf"),
  FeiBoZhengDian: require("../../../assets/fonts/FeiBoZhengDian.ttf"),
};

export const canvasFontOptions: readonly { id: string; label: string; family: string }[] = [
  { id: bodyFontFamily, label: "朝华打字机", family: bodyFontFamily },
  { id: "XiMaiXiHuan", label: "喜脉喜欢", family: displayFontFamily },
  { id: "PFFanHuTu", label: "频凡胡涂", family: "PFFanHuTu" },
  { id: "CraftMincho", label: "クラフト明朝", family: "CraftMincho" },
  { id: "YouYouYiSong", label: "又又意宋", family: "YouYouYiSong" },
  { id: "PingFangXingChen", label: "平方星辰", family: "PingFangXingChen" },
  { id: "PingFangLangYa", label: "琅琊体", family: "PingFangLangYa" },
  { id: "PingFangFeiYang", label: "飞扬体", family: "PingFangFeiYang" },
  { id: "ChaoHuaTitleA", label: "朝华标题 A", family: "ChaoHuaTitleA" },
  { id: "ChaoHuaTitleB", label: "朝华标题 B", family: "ChaoHuaTitleB" },
  { id: "MaoKenZhuYuan", label: "猫啃珠圆", family: "MaoKenZhuYuan" },
  { id: "FusionPixel10Mono", label: "缝合像素", family: "FusionPixel10Mono" },
  { id: "PoZhenTypewriter", label: "迫真油印", family: "PoZhenTypewriter" },
  { id: "LXGWNeoZhiSong", label: "霞鹜新致宋", family: "LXGWNeoZhiSong" },
  { id: "LXGWNeoZhiSongPlus", label: "新致宋 Plus", family: "LXGWNeoZhiSongPlus" },
  { id: "LXGWZhiSongCL", label: "霞鹜致宋 CL", family: "LXGWZhiSongCL" },
  { id: "LXGWZhiSongMN", label: "霞鹜致宋 MN", family: "LXGWZhiSongMN" },
  { id: "FeiBoZhengDian", label: "飞波正点", family: "FeiBoZhengDian" },
];
