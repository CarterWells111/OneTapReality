import { appFontSources, bodyFontFamily, canvasFontOptions, displayFontFamily, headingFontFamily } from "../src/features/typography/fonts";

describe("typography fonts", () => {
  it("uses the global display, heading, and body fonts", () => {
    expect(displayFontFamily).toBe("FontQu Smile");
    expect(headingFontFamily).toBe("ChaoHuaTitleA");
    expect(bodyFontFamily).toBe("ZhaohuaTypeWriter");
    expect(appFontSources[displayFontFamily]).toBeTruthy();
    expect(appFontSources[headingFontFamily]).toBeTruthy();
    expect(appFontSources[bodyFontFamily]).toBeTruthy();
  });

  it("keeps ChaoHua typewriter available as the first canvas text option", () => {
    expect(canvasFontOptions[0]).toMatchObject({
      family: bodyFontFamily,
      id: bodyFontFamily,
      label: "朝华打字机",
    });
  });
});
