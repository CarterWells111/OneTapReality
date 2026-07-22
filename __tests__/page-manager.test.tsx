import { fireEvent, render } from "@testing-library/react-native";

import { PageManager } from "../src/components/page-manager";
import type { StoryPage } from "../src/types/memory";

const pages: StoryPage[] = [
  { id: "cover", position: 0, kind: "cover", headline: "封面", body: "" },
  { id: "photo-1", position: 1, kind: "photo", headline: "第一张照片", body: "" },
];

describe("PageManager", () => {
  it("renders every page with its 1-based order", async () => {
    const view = await render(<PageManager pages={pages} onChange={() => {}} />);

    expect(view.getByText("1. 封面")).toBeTruthy();
    expect(view.getByText("2. 第一张照片")).toBeTruthy();
  });

  it("adds a page with a continuous position sequence", async () => {
    const onChange = jest.fn();
    const view = await render(
      <PageManager pages={pages} onChange={onChange} createPageId={() => "new-page"} />
    );

    await fireEvent.press(view.getByTestId("add-page"));

    const next = onChange.mock.calls[0][0] as StoryPage[];
    expect(next.map((item) => item.id)).toEqual(["cover", "photo-1", "new-page"]);
    expect(next.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("removes a page and renumbers the rest", async () => {
    const onChange = jest.fn();
    const view = await render(<PageManager pages={pages} onChange={onChange} />);

    await fireEvent.press(view.getByTestId("remove-cover"));

    const next = onChange.mock.calls[0][0] as StoryPage[];
    expect(next.map((item) => item.id)).toEqual(["photo-1"]);
    expect(next.map((item) => item.position)).toEqual([0]);
  });

  it("reorders pages when moving one down", async () => {
    const onChange = jest.fn();
    const view = await render(<PageManager pages={pages} onChange={onChange} />);

    await fireEvent.press(view.getByTestId("move-down-cover"));

    const next = onChange.mock.calls[0][0] as StoryPage[];
    expect(next.map((item) => item.id)).toEqual(["photo-1", "cover"]);
    expect(next.map((item) => item.position)).toEqual([0, 1]);
  });
});
