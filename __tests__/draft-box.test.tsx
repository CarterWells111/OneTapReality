import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import { DraftBox } from "../src/features/memories/draft-box";
import type { Memory } from "../src/types/memory";

// Midday UTC keeps the rendered day stable for both the UTC runner and local time zones.
const makeDraft = (id: string, title: string, createdAt: string, updatedAt: string): Memory => ({
  id,
  title,
  city: "hangzhou",
  travelDate: "2026-09-20",
  photoUris: [],
  pages: [],
  createdAt,
  updatedAt,
});

const drafts = [
  makeDraft("a", "杭州三日", "2026-10-01T12:00:00.000Z", "2026-10-04T12:00:00.000Z"),
  makeDraft("b", "上海周末", "2026-09-28T12:00:00.000Z", "2026-10-02T12:00:00.000Z"),
];

function renderBox(overrides?: Partial<React.ComponentProps<typeof DraftBox>>) {
  const props = {
    drafts,
    discardedCount: 3,
    onOpenDraft: jest.fn(),
    onDiscardDraft: jest.fn(),
    onOpenRecycleBin: jest.fn(),
    ...overrides,
  };
  return { ...render(<DraftBox {...props} />), props };
}

describe("draft box", () => {
  afterEach(() => jest.restoreAllMocks());

  it("starts collapsed so the home screen only carries one row", () => {
    const view = renderBox();

    expect(view.getByText("草稿箱 · 2/10")).toBeTruthy();
    expect(view.queryByText("杭州三日")).toBeNull();
  });

  it("reveals every draft with its created and edited dates once expanded", () => {
    const view = renderBox();

    fireEvent.press(view.getByLabelText("展开草稿箱"));

    expect(view.getByText("杭州三日")).toBeTruthy();
    expect(view.getByText("上海周末")).toBeTruthy();
    expect(view.getByText("创建于 10.01 · 编辑于 10.04")).toBeTruthy();
    expect(view.getByText("创建于 09.28 · 编辑于 10.02")).toBeTruthy();
  });

  it("opens a draft that is tapped while the box is expanded", () => {
    const view = renderBox();

    fireEvent.press(view.getByLabelText("展开草稿箱"));
    fireEvent.press(view.getByLabelText("继续编辑草稿 杭州三日"));

    expect(view.props.onOpenDraft).toHaveBeenCalledWith("a");
  });

  it("ends the expanded list with the recycle bin and its count", () => {
    const view = renderBox();

    fireEvent.press(view.getByLabelText("展开草稿箱"));
    expect(view.getByText("回收站 · 3 册")).toBeTruthy();

    fireEvent.press(view.getByLabelText("打开回收站"));
    expect(view.props.onOpenRecycleBin).toHaveBeenCalled();
  });

  // Deleting is destructive from the person's point of view even though the draft
  // only moves to the recycle bin, so nothing happens until they confirm.
  it("confirms before a swiped draft is moved to the recycle bin", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = renderBox();

    fireEvent.press(view.getByLabelText("展开草稿箱"));
    fireEvent.press(view.getByLabelText("删除草稿 杭州三日"));

    expect(view.props.onDiscardDraft).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);

    const buttons = alert.mock.calls[0][2] ?? [];
    const destructive = buttons.find((button) => button.style === "destructive");
    destructive?.onPress?.();

    expect(view.props.onDiscardDraft).toHaveBeenCalledWith("a");
  });

  it("tells the person how long a deleted draft can still be recovered", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = renderBox();

    fireEvent.press(view.getByLabelText("展开草稿箱"));
    fireEvent.press(view.getByLabelText("删除草稿 杭州三日"));

    expect(String(alert.mock.calls[0][1])).toContain("10 天");
  });

  it("stays out of the way when there is no draft and nothing in the recycle bin", () => {
    const view = renderBox({ drafts: [], discardedCount: 0 });

    expect(view.queryByText(/草稿箱/)).toBeNull();
  });

  it("still offers the recycle bin when the draft box itself is empty", () => {
    const view = renderBox({ drafts: [], discardedCount: 2 });

    expect(view.getByText("草稿箱 · 0/10")).toBeTruthy();
    fireEvent.press(view.getByLabelText("展开草稿箱"));
    expect(view.getByText("回收站 · 2 册")).toBeTruthy();
  });
});
