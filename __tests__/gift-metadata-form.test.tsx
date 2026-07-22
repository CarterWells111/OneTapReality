import { act, fireEvent, render } from "@testing-library/react-native";

import { GiftMetadataForm } from "../src/features/gifting/gift-metadata-form";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("GiftMetadataForm", () => {
  it("reports accessible required-field errors", async () => {
    const view = await render(<GiftMetadataForm onSubmit={jest.fn()} />);

    await act(async () => {
      fireEvent.press(view.getByText("保存礼物信息"));
    });

    expect(view.getByRole("alert")).toBeTruthy();
  });

  it("submits serializable recipient, occasion, date, and note metadata", async () => {
    const onSubmit = jest.fn();
    const view = await render(<GiftMetadataForm onSubmit={onSubmit} />);

    await act(async () => { fireEvent.changeText(view.getByLabelText("收礼人"), "小林"); });
    await act(async () => { fireEvent.changeText(view.getByLabelText("纪念场景"), "两周年"); });
    await act(async () => { fireEvent.changeText(view.getByLabelText("纪念日期"), "2026-07-22"); });
    await act(async () => { fireEvent.changeText(view.getByLabelText("留言"), "一起去更多地方。"); });
    await act(async () => { fireEvent.press(view.getByText("保存礼物信息")); });

    expect(onSubmit).toHaveBeenCalledWith({ recipient: "小林", occasion: "两周年", date: "2026-07-22", note: "一起去更多地方。" });
  });
});
