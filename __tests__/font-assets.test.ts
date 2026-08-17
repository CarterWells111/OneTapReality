import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  appFontSources,
  bodyFontFamily,
  canvasEditorFontSources,
  canvasFontOptions,
  displayFontFamily,
  headingFontFamily,
} from "../src/features/typography/fonts";

const retainedFontFiles = [
  "ChaoHuaTitleA.ttf",
  "ChaoHuaTypewriter.ttf",
  "LXGWNeoZhiSongPlus.ttf",
  "MaoKenZhuYuan.ttf",
  "XiMaiXiHuan.ttf",
];

describe("local Chinese font package", () => {
  it("keeps only the five approved fonts without changing the existing page families", () => {
    const fontFiles = readdirSync(join(process.cwd(), "assets", "fonts")).sort();

    expect(fontFiles).toEqual(retainedFontFiles);
    expect({ displayFontFamily, headingFontFamily, bodyFontFamily }).toEqual({
      displayFontFamily: "FontQu Smile",
      headingFontFamily: "ChaoHuaTitleA",
      bodyFontFamily: "ZhaohuaTypeWriter",
    });
    expect(Object.keys(appFontSources)).toEqual([
      "FontQu Smile",
      "ChaoHuaTitleA",
      "ZhaohuaTypeWriter",
    ]);
    expect(Object.keys(canvasEditorFontSources)).toEqual([
      "FontQu Smile",
      "ChaoHuaTitleA",
      "ZhaohuaTypeWriter",
      "MaoKenZhuYuan",
      "LXGWNeoZhiSongPlus",
    ]);
    expect(canvasFontOptions).toEqual([
      { id: "ZhaohuaTypeWriter", label: "朝华打字机", family: "ZhaohuaTypeWriter" },
      { id: "XiMaiXiHuan", label: "喜脉喜欢", family: "FontQu Smile" },
      { id: "ChaoHuaTitleA", label: "朝华标题 A", family: "ChaoHuaTitleA" },
      { id: "MaoKenZhuYuan", label: "猫啃珠圆", family: "MaoKenZhuYuan" },
      { id: "LXGWNeoZhiSongPlus", label: "新致宋 Plus", family: "LXGWNeoZhiSongPlus" },
    ]);
  });
});
