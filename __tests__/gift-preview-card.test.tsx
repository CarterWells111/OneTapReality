import { render } from "@testing-library/react-native";

import { GiftPreviewCard } from "../src/components/gift-preview-card";

describe("GiftPreviewCard", () => {
  it("shows the gift cover, recipient, message, city, and template", async () => {
    const view = await render(<GiftPreviewCard coverUri="file://cover.jpg" cityName="杭州" templateName="一起出发" recipient="小林" note="一起去更多地方。" />);

    expect(view.getByTestId("gift-cover")).toBeTruthy();
    expect(view.getByText("送给：小林")).toBeTruthy();
    expect(view.getByText("一起去更多地方。")).toBeTruthy();
    expect(view.getByText("杭州 · 一起出发")).toBeTruthy();
  });

  it("uses readable fallbacks when optional gift details are missing", async () => {
    const view = await render(<GiftPreviewCard cityName="上海" templateName="纪念日" />);

    expect(view.getByText("封面待选")).toBeTruthy();
    expect(view.getByText("送给：待填写")).toBeTruthy();
    expect(view.getByText("写一句想对 TA 说的话")).toBeTruthy();
  });
});
