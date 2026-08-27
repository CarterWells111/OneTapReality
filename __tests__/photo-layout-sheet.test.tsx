import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

import { PhotoLayoutSheet } from "../src/features/canvas/photo-layout-sheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PhotoLayoutSheet", () => {
  it("disables confirmation when there are no photos", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet action="add" onCancel={() => undefined} onConfirm={onConfirm} onReplacePhotos={() => undefined} photoUris={[]} />,
    );

    const confirm = screen.getByLabelText("创建页面");
    expect(confirm.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders exactly five two-photo templates and confirms the selected template", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="add"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onReplacePhotos={() => undefined}
        photoUris={["file:///one.jpg", "file:///two.jpg"]}
      />,
    );

    expect(screen.getAllByLabelText(/双图模板$/)).toHaveLength(5);
    fireEvent.press(screen.getByLabelText("杂志侧栏双图模板"));
    fireEvent.press(screen.getByLabelText("创建页面"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("magazine-2");
  });

  it("shows the exact warning and confirms a four-photo freeform page", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="add"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onReplacePhotos={() => undefined}
        photoUris={["1", "2", "3", "4"]}
        selectedTemplateId="classic-3"
      />,
    );

    expect(screen.getByText("模板仅支持 3 张及以内照片，仍可自行排版")).toBeTruthy();
    expect(screen.queryAllByLabelText(/模板$/)).toHaveLength(0);
    fireEvent.press(screen.getByLabelText("创建自由排版页面"));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("uses the edit label and synchronizes a new selected template prop", () => {
    const onConfirm = jest.fn();
    const view = render(
      <PhotoLayoutSheet
        action="edit"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onReplacePhotos={() => undefined}
        photoUris={["1", "2"]}
        selectedTemplateId="classic-2"
      />,
    );

    view.rerender(
      <PhotoLayoutSheet
        action="edit"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onReplacePhotos={() => undefined}
        photoUris={["1", "2"]}
        selectedTemplateId="columns-2"
      />,
    );
    fireEvent.press(view.getByLabelText("应用照片布局"));

    expect(onConfirm).toHaveBeenCalledWith("columns-2");
  });

  it("delegates replacement and cancellation without confirming", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const onReplacePhotos = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onReplacePhotos={onReplacePhotos}
        photoUris={["file:///one.jpg"]}
      />,
    );

    fireEvent.press(screen.getByLabelText("重新选择照片"));
    fireEvent.press(screen.getByLabelText("取消照片布局"));

    expect(onReplacePhotos).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
