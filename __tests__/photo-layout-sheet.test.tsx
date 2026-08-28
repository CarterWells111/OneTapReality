import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { StyleSheet } from "react-native";

import { PhotoLayoutSheet } from "../src/features/canvas/photo-layout-sheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PhotoLayoutSheet", () => {
  it("adds one photo from the trailing plus tile and keeps the template family", () => {
    const onAddPhoto = jest.fn();
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onAddPhoto={onAddPhoto}
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onPhotosChange={() => undefined}
        photos={[{ id: "one", uri: "file:///one.jpg" }, { id: "two", uri: "file:///two.jpg" }]}
        selectedTemplateId="magazine-2"
      />,
    );

    fireEvent.press(screen.getByLabelText("添加一张照片"));

    expect(onAddPhoto).toHaveBeenCalledTimes(1);
  });

  it("disables the trailing plus tile at eight photos", () => {
    const onAddPhoto = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onAddPhoto={onAddPhoto}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onPhotosChange={() => undefined}
        photos={Array.from({ length: 8 }, (_, index) => ({ id: `${index}`, uri: `file:///${index}.jpg` }))}
      />,
    );

    const add = screen.getByLabelText("添加一张照片");
    expect(add.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(add);
    expect(onAddPhoto).not.toHaveBeenCalled();
  });

  it("opens the shared crop modal when a selected thumbnail is pressed", () => {
    const onPhotosChange = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onAddPhoto={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onPhotosChange={onPhotosChange}
        photos={[{ id: "one", uri: "file:///one.jpg", crop: { focusX: 0.1, focusY: 0.9, zoom: 3 } }]}
      />,
    );

    fireEvent.press(screen.getByLabelText("照片 1，点击裁剪"));
    fireEvent.press(screen.getByLabelText("重置裁剪"));
    fireEvent.press(screen.getByLabelText("完成裁剪"));

    expect(onPhotosChange).toHaveBeenCalledWith([
      { id: "one", uri: "file:///one.jpg", crop: { focusX: 0.5, focusY: 0.5, zoom: 1 } },
    ]);
  });

  it("offers accessible reorder and delete equivalents for drag gestures", () => {
    const onPhotosChange = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onAddPhoto={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onPhotosChange={onPhotosChange}
        photos={[{ id: "one", uri: "file:///one.jpg" }, { id: "two", uri: "file:///two.jpg" }]}
      />,
    );

    fireEvent(screen.getByLabelText("照片 2，点击裁剪"), "accessibilityAction", {
      nativeEvent: { actionName: "moveBackward" },
    });
    expect(onPhotosChange).toHaveBeenLastCalledWith([
      { id: "two", uri: "file:///two.jpg" },
      { id: "one", uri: "file:///one.jpg" },
    ]);

    fireEvent(screen.getByLabelText("照片 1，点击裁剪"), "accessibilityAction", {
      nativeEvent: { actionName: "delete" },
    });
    expect(onPhotosChange).toHaveBeenLastCalledWith([{ id: "two", uri: "file:///two.jpg" }]);
  });

  it("allows an edited page to apply an empty photo draft", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onAddPhoto={() => undefined}
        onCancel={() => undefined}
        onConfirm={onConfirm}
        onPhotosChange={() => undefined}
        photos={[]}
      />,
    );

    fireEvent.press(screen.getByLabelText("应用照片与模板"));

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("disables confirmation when there are no photos", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoLayoutSheet action="add" onCancel={() => undefined} onConfirm={onConfirm} onReplacePhotos={() => undefined} photoUris={[]} />,
    );

    const confirm = screen.getByLabelText("创建页面");
    expect(screen.getByText("已选择图片")).toBeTruthy();
    expect(screen.getByLabelText("添加一张照片")).toBeTruthy();
    expect(confirm.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows selected photos beside the trailing addition action", () => {
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onReplacePhotos={() => undefined}
        photoUris={["file:///one.jpg", "file:///two.jpg"]}
        selectedTemplateId="classic-2"
      />,
    );
    const selectionControls = screen.getByTestId("photo-selection-controls");

    expect(screen.getByText("已选择图片")).toBeTruthy();
    expect(screen.getByTestId("photo-layout-thumbnail-legacy-photo-1-content").props.source).toEqual([{ uri: "file:///one.jpg" }]);
    expect(screen.getByTestId("photo-layout-thumbnail-legacy-photo-2-content").props.source).toEqual([{ uri: "file:///two.jpg" }]);
    expect(StyleSheet.flatten(screen.getByTestId("photo-layout-thumbnail-legacy-photo-1").props.style)).toEqual(expect.objectContaining({
      height: 72,
      width: 72,
    }));
    expect(screen.getByLabelText("照片 1，点击裁剪")).toBeTruthy();
    expect(selectionControls.props.children.at(-1).props.accessibilityLabel).toBe("添加一张照片");
  });

  it("updates the large layout preview immediately when selecting a template", () => {
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onReplacePhotos={() => undefined}
        photoUris={["file:///one.jpg", "file:///two.jpg"]}
        selectedTemplateId="magazine-2"
      />,
    );
    const preview = screen.getByLabelText("布局效果预览");
    const firstPreviewPhoto = screen.getByLabelText("布局效果预览照片 1");

    expect(StyleSheet.flatten(preview.props.style)).toEqual(expect.objectContaining({ aspectRatio: 0.75 }));
    expect(screen.getByTestId("photo-layout-preview-image-1-content").props.source).toEqual([{ uri: "file:///one.jpg" }]);
    expect(screen.getByTestId("photo-layout-preview-image-2-content").props.source).toEqual([{ uri: "file:///two.jpg" }]);
    expect(StyleSheet.flatten(firstPreviewPhoto.props.style)).toEqual(expect.objectContaining({
      height: "82%", left: "8%", top: "9%", width: "52%",
    }));

    fireEvent.press(screen.getByLabelText("竖向切片双图模板"));

    expect(StyleSheet.flatten(screen.getByLabelText("布局效果预览照片 1").props.style)).toEqual(expect.objectContaining({
      height: "84%", left: "8%", top: "8%", width: "39%",
    }));
  });

  it("shows an automatic layout preview before a template is selected", () => {
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onReplacePhotos={() => undefined}
        photoUris={["file:///one.jpg", "file:///two.jpg"]}
      />,
    );

    expect(screen.getByLabelText("布局效果预览")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText("布局效果预览照片 1").props.style)).toEqual(expect.objectContaining({
      height: "40%", left: "8%", top: "8%", width: "84%",
    }));
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
    const preview = screen.getByLabelText("布局效果预览");
    expect(StyleSheet.flatten(preview.props.style)).toEqual(expect.objectContaining({ aspectRatio: 0.75 }));
    const positioned = screen.getAllByLabelText(/布局效果预览照片/);
    expect(positioned).toHaveLength(4);
    expect(StyleSheet.flatten(positioned[0].props.style)).toEqual(expect.objectContaining({
      height: "40%", left: "8%", top: "8%", width: "40%",
    }));
    expect(StyleSheet.flatten(positioned[3].props.style)).toEqual(expect.objectContaining({
      height: "40%", left: "51%", top: "52%", width: "40%",
    }));
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
    fireEvent.press(view.getByLabelText("应用照片与模板"));

    expect(onConfirm).toHaveBeenCalledWith("columns-2");
  });

  it("keeps the last explicitly selected template family across 3 to 4 to 3 photos", () => {
    const onConfirm = jest.fn();
    const props = {
      action: "edit" as const,
      onCancel: () => undefined,
      onConfirm,
      onPhotosChange: () => undefined,
      selectedTemplateId: "classic-3" as const,
    };
    const threePhotos = [1, 2, 3].map((index) => ({ id: `${index}`, uri: `${index}` }));
    const view = render(<PhotoLayoutSheet {...props} photos={threePhotos} />);

    fireEvent.press(view.getByLabelText("杂志侧栏三图模板"));
    view.rerender(<PhotoLayoutSheet {...props} photos={[...threePhotos, { id: "4", uri: "4" }]} />);
    view.rerender(<PhotoLayoutSheet {...props} photos={threePhotos} />);
    fireEvent.press(view.getByLabelText("应用照片与模板"));

    expect(onConfirm).toHaveBeenCalledWith("magazine-3");
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

    fireEvent.press(screen.getByLabelText("添加一张照片"));
    fireEvent.press(screen.getByLabelText("取消照片布局"));

    expect(onReplacePhotos).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exposes saving progress, blocks mutation, and still delegates cancellation while busy", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const onReplacePhotos = jest.fn();
    const screen = render(
      <PhotoLayoutSheet
        action="edit"
        busy
        onCancel={onCancel}
        onConfirm={onConfirm}
        onReplacePhotos={onReplacePhotos}
        photoUris={["file:///one.jpg"]}
      />,
    );

    expect(screen.getByText("正在保存照片…")).toBeTruthy();
    expect(screen.getByTestId("photo-layout-sheet").props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );
    for (const label of ["应用照片与模板", "添加一张照片"]) {
      const button = screen.getByLabelText(label);
      expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      fireEvent.press(button);
    }
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onReplacePhotos).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("取消照片布局"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
