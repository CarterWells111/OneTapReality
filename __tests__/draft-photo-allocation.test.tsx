import { act, fireEvent, render } from "@testing-library/react-native";

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
    const screen = render(
      <DraftPhotoAllocation
        onChange={onChange}
        photoUris={thirteenPhotos}
        value={[{ photoUris: thirteenPhotos.slice(0, 12) }, { photoUris: thirteenPhotos.slice(12) }]}
      />,
    );

    fireEvent.press(screen.getByText("逐页配置", { exact: true }));
    const move = screen.getByLabelText("把照片 13 分配到第 1 页");
    expect(move.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("每页最多 12 张照片")).toBeTruthy();
    fireEvent.press(move);
    expect(onChange).not.toHaveBeenCalled();
  });
});
