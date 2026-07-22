import { colors } from "../src/components/ui";

describe("brand palette", () => {
  it("exposes the approved OneTapReality semantic colors", () => {
    expect(colors.background).toBe("#F7F2EA");
    expect(colors.accent).toBe("#56708A");
    expect(colors.warmAccent).toBe("#B56B52");
    expect(colors.accentSoft).toBe("#FFF2CF");
  });
});
