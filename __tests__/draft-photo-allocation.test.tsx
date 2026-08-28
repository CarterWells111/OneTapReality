import { act, fireEvent, render } from "@testing-library/react-native";
import { FlatList, StyleSheet } from "react-native";

import { DraftPhotoAllocation } from "../src/features/memories/draft-photo-allocation";
import { createBalancedPhotoPagePlans } from "../src/features/memories/photo-page-planner";

const photos = ["file://one.jpg", "file://two.jpg", "file://three.jpg", "file://four.jpg"];
const thirteenPhotos = Array.from({ length: 13 }, (_, index) => `file://photo-${index + 1}.jpg`);

describe("DraftPhotoAllocation", () => {
  it("reduces two pages to one free-layout page and respects increment boundaries", () => {
    const onChange = jest.fn();
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={photos}
        value={createBalancedPhotoPagePlans(photos)}
      />,
    );

    expect(screen.getByText("2 个内容页")).toBeTruthy();
    expect(screen.getByLabelText("减少内容页数")).toBeTruthy();
    expect(screen.getByLabelText("增加内容页数")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("增加内容页数"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((plan: { photoUris: string[] }) => plan.photoUris.length)).toEqual([2, 1, 1]);

    fireEvent.press(screen.getByLabelText("减少内容页数"));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toEqual([{ photoUris: photos }]);
  });

  it("selects a family without emitting until applying it to all compatible pages", () => {
    const onChange = jest.fn();
    const plans = createBalancedPhotoPagePlans(photos);
    const screen = render(<DraftPhotoAllocation onChange={onChange} photoUris={photos} value={plans} />);

    fireEvent.press(screen.getByText("杂志侧栏", { exact: true }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    expect(onChange).toHaveBeenCalledWith([
      { photoUris: photos.slice(0, 2), photoTemplateId: "magazine-2" },
      { photoUris: photos.slice(2), photoTemplateId: "magazine-2" },
    ]);
  });

  it("reports skipped free-layout pages when applying a family", () => {
    const onChange = jest.fn();
    const ninePhotos = photos.concat(["file://five.jpg", "file://six.jpg", "file://seven.jpg", "file://eight.jpg", "file://nine.jpg"]);
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={ninePhotos}
        value={[
          { photoUris: ninePhotos.slice(0, 4) },
          { photoUris: ninePhotos.slice(4, 8) },
          { photoUris: ninePhotos.slice(8), photoTemplateId: "classic-1" },
        ]}
      />,
    );

    fireEvent.press(screen.getByText("杂志侧栏", { exact: true }));
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    expect(screen.getByText("第 1、2 页保持自由排版")).toBeTruthy();

    screen.rerender(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={ninePhotos}
        value={createBalancedPhotoPagePlans(ninePhotos, "magazine")}
      />,
    );
    fireEvent.press(screen.getByText("经典留白", { exact: true }));
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    expect(screen.queryByText("第 1、2 页保持自由排版")).toBeNull();
  });

  it("moves photos in per-page mode and updates only the active page template", () => {
    const onChange = jest.fn();
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={photos}
        value={[
          { photoUris: photos.slice(0, 2), photoTemplateId: "classic-2" },
          { photoUris: photos.slice(2), photoTemplateId: "classic-2" },
        ]}
      />,
    );

    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    const firstPage = screen.getByLabelText("编辑第 1 页，2 张照片");
    expect(firstPage.props.accessibilityRole).toBe("button");
    expect(firstPage.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByLabelText("编辑第 2 页，2 张照片"));
    fireEvent.press(screen.getByLabelText("把照片 1 分配到第 2 页"));
    expect(onChange).toHaveBeenCalledWith([
      { photoUris: [photos[1]], photoTemplateId: undefined },
      { photoUris: [photos[2], photos[3], photos[0]], photoTemplateId: undefined },
    ]);

    onChange.mockClear();
    fireEvent.press(screen.getByLabelText("编辑第 2 页，2 张照片"));
    fireEvent.press(screen.getByLabelText("杂志侧栏双图模板"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].photoTemplateId).toBe("classic-2");
    expect(onChange.mock.calls[0][0][1].photoTemplateId).toBe("magazine-2");
  });

  it("disables moving the last photo so pages cannot become empty", () => {
    const onChange = jest.fn();
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={[photos[0], photos[1]]}
        value={[{ photoUris: [photos[0]] }, { photoUris: [photos[1]] }]}
      />,
    );
    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    fireEvent.press(screen.getByLabelText("编辑第 2 页，1 张照片"));
    expect(screen.getByLabelText("把照片 1 分配到第 2 页").props.accessibilityState).toMatchObject({ disabled: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves allocations and templates when switching modes", () => {
    const onChange = jest.fn();
    const plans = createBalancedPhotoPagePlans(photos, "magazine");
    const screen = render(<DraftPhotoAllocation onChange={onChange} photoUris={photos} value={plans} />);
    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    fireEvent.press(screen.getByText("一起配置", { exact: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("2 个内容页")).toBeTruthy();
  });

  it("keeps thirteen photos on at least two pages in together mode", () => {
    const onChange = jest.fn();
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={thirteenPhotos}
        value={[{ photoUris: thirteenPhotos.slice(0, 12) }, { photoUris: thirteenPhotos.slice(12) }]}
      />,
    );

    const decrement = screen.getByLabelText("减少内容页数");
    expect(decrement.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(decrement);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables moving a photo into a page that already has twelve photos", () => {
    const onChange = jest.fn();
    const fourteenPhotos = thirteenPhotos.concat("file://photo-14.jpg");
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={fourteenPhotos}
        value={[{ photoUris: fourteenPhotos.slice(0, 12) }, { photoUris: fourteenPhotos.slice(12) }]}
      />,
    );

    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    const photoList = screen.UNSAFE_getByType(FlatList);
    const move = photoList.props.renderItem({ item: fourteenPhotos[12], index: 12 });
    expect(move.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("每页最多 12 张照片")).toBeTruthy();
    act(() => move.props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows controlled page previews with real images, template labels, and a balanced suggestion", () => {
    const onChange = jest.fn();
    const sixPhotos = photos.concat(["file://five.jpg", "file://six.jpg"]);
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={sixPhotos}
        value={[
          { photoUris: sixPhotos.slice(0, 2), photoTemplateId: "classic-2" },
          { photoUris: sixPhotos.slice(2), photoTemplateId: undefined },
        ]}
      />,
    );

    expect(screen.getByText("共 6 张照片")).toBeTruthy();
    expect(screen.getByText("建议均衡分配：第 1 页 2 张，第 2 页 4 张")).toBeTruthy();
    const previewList = screen.UNSAFE_getByType(FlatList);
    expect(previewList.props.getItemLayout(undefined, 10)).toEqual({ length: 122, offset: 1220, index: 10 });
    expect(screen.getByLabelText("第 1 页预览，2 张照片，经典留白模板")).toBeTruthy();
    expect(screen.getByLabelText("第 2 页预览，4 张照片，自由排版")).toBeTruthy();
    expect(screen.getByTestId("draft-photo-preview-1-image-1").type).toBe("Image");
    expect(screen.getByTestId("draft-photo-preview-2-image-1").type).toBe("Image");
  });

  it("renders collage page previews with canvas radians", () => {
    const screen = render(
      <DraftPhotoAllocation
        onChange={jest.fn()}
        photoUris={photos.slice(0, 2)}
        value={[{ photoUris: photos.slice(0, 2), photoTemplateId: "collage-2" }]}
      />,
    );
    const firstImageStyle = StyleSheet.flatten(screen.getByTestId("draft-photo-preview-1-image-1").props.style);

    expect(firstImageStyle.transform).toEqual([{ rotate: `${-Math.PI / 60}rad` }]);
  });

  it("shows per-page progress and advances or returns without changing controlled plans", () => {
    const onChange = jest.fn();
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={photos}
        value={[
          { photoUris: photos.slice(0, 2), photoTemplateId: "classic-2" },
          { photoUris: photos.slice(2), photoTemplateId: "classic-2" },
        ]}
      />,
    );

    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    expect(screen.getByText("第 1 页，共 2 页")).toBeTruthy();
    expect(screen.getByText("剩余 2 张照片")).toBeTruthy();
    expect(screen.getByTestId("draft-photo-thumbnail-1").type).toBe("Image");
    expect(screen.getByLabelText("返回上一页").props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(screen.getByText("保存当前页，继续", { exact: true }));
    expect(screen.getByText("第 2 页，共 2 页")).toBeTruthy();
    expect(screen.getByText("剩余 0 张照片")).toBeTruthy();
    expect(screen.getByText("完成逐页配置", { exact: true })).toBeTruthy();

    fireEvent.press(screen.getByText("返回上一页", { exact: true }));
    expect(screen.getByText("第 1 页，共 2 页")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("保存当前页，继续", { exact: true }));
    fireEvent.press(screen.getByText("完成逐页配置", { exact: true }));
    expect(screen.getByText("一起配置", { exact: true })).toBeTruthy();
  });

  it("keeps per-page controls linear for large selections and targets only the active page", () => {
    const onChange = jest.fn();
    const manyPhotos = Array.from({ length: 120 }, (_, index) => `file://large-${index + 1}.jpg`);
    const manyPlans = Array.from({ length: 40 }, (_, pageIndex) => ({
      photoUris: manyPhotos.slice(pageIndex * 3, pageIndex * 3 + 3),
      photoTemplateId: "classic-3" as const,
    }));
    const screen = render(<DraftPhotoAllocation onChange={onChange} photoUris={manyPhotos} value={manyPlans} />);

    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    const photoList = screen.UNSAFE_getByType(FlatList);
    expect(photoList.props.data).toHaveLength(120);
    expect(photoList.props.initialNumToRender).toBe(12);
    expect(photoList.props.getItemLayout(undefined, 10)).toEqual({ length: 88, offset: 880, index: 10 });
    const firstItem = photoList.props.renderItem({ item: manyPhotos[0], index: 0 });
    expect(firstItem.props.accessibilityLabel).toBe("照片 1，当前第 1 页");

    fireEvent.press(screen.getByLabelText("编辑第 40 页，3 张照片"));
    const switchedList = screen.UNSAFE_getByType(FlatList);
    const switchedItem = switchedList.props.renderItem({ item: manyPhotos[0], index: 0 });
    expect(switchedItem.props.accessibilityLabel).toBe("把照片 1 分配到第 40 页");

    act(() => switchedItem.props.onPress());
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ photoUris: expect.arrayContaining([manyPhotos[0]]) }),
    ]));
  });
});
