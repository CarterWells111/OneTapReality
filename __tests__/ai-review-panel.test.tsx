import { fireEvent, render } from "@testing-library/react-native";

import { demoReviewGroups } from "../src/features/ai-review/fixtures";
import type { ReviewGroup } from "../src/features/ai-review/model";
import { ReviewPanel } from "../src/features/ai-review/review-panel";

describe("ReviewPanel", () => {
  it("shows groups, candidate counts, and evidence", async () => {
    const view = await render(
      <ReviewPanel groups={demoReviewGroups} onChange={() => {}} />
    );

    expect(view.getByText("册页结构建议（2 条）")).toBeTruthy();
    expect(view.getByText("文案建议（1 条）")).toBeTruthy();
    expect(view.getByText("依据：你选择了 4 张照片")).toBeTruthy();
    expect(
      view.getByText(/共 3 条建议 · 待确认 3 · 已接受 0 · 已拒绝 0/)
    ).toBeTruthy();
  });

  it("accepts a single candidate through onChange", async () => {
    const onChange = jest.fn();
    const view = await render(
      <ReviewPanel groups={demoReviewGroups} onChange={onChange} />
    );

    await fireEvent.press(view.getByTestId("accept-candidate-city-phrase"));

    const next = onChange.mock.calls[0][0] as ReviewGroup[];
    expect(next[1].candidates[0].status).toBe("accepted");
  });

  it("batch-rejects a group through onChange", async () => {
    const onChange = jest.fn();
    const view = await render(
      <ReviewPanel groups={demoReviewGroups} onChange={onChange} />
    );

    await fireEvent.press(view.getByTestId("reject-all-group-structure"));

    const next = onChange.mock.calls[0][0] as ReviewGroup[];
    expect(
      next[0].candidates.every((candidate) => candidate.status === "rejected")
    ).toBe(true);
  });
});
