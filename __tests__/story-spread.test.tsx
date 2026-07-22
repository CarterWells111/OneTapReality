import { render } from "@testing-library/react-native";

import { StorySpread } from "../src/components/story-spread";

describe("StorySpread", () => {
  it("renders a cover with its local photo", async () => {
    const view = await render(
      <StorySpread page={{ id: "cover", position: 0, kind: "cover", headline: "West Lake", body: "Our weekend", photoUri: "file://cover.jpg" }} />
    );

    expect(view.getByText("West Lake")).toBeTruthy();
    expect(view.getByTestId("story-photo")).toBeTruthy();
  });

  it("shows a practical placeholder for a photo page without a URI", async () => {
    const view = await render(
      <StorySpread page={{ id: "photo", position: 1, kind: "photo", headline: "Morning", body: "Coffee by the lake" }} />
    );

    expect(view.getByText("照片待补充")).toBeTruthy();
    expect(view.getByText("Morning")).toBeTruthy();
  });

  it("renders a closing page without requiring an image", async () => {
    const view = await render(
      <StorySpread page={{ id: "closing", position: 2, kind: "closing", headline: "See you next time", body: "The end" }} />
    );

    expect(view.getByText("See you next time")).toBeTruthy();
    expect(view.queryByTestId("story-photo")).toBeNull();
  });
});
