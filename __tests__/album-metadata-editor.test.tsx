import { fireEvent, render, screen, within } from "@testing-library/react-native";
import * as React from "react";
import { Modal, Platform } from "react-native";

import { AlbumMetadataEditor } from "../src/features/memories/album-metadata-editor";
import { MIN_TRAVEL_DATE } from "../src/features/memories/travel-date";

type PickerProps = {
  display?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (event: { type: "set" | "dismissed" }, date?: Date) => void;
  value: Date;
};

let latestPickerProps: PickerProps | null = null;

jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react") as typeof import("react");
  const { Pressable, Text } = require("react-native");
  return function MockDateTimePicker(props: PickerProps) {
    latestPickerProps = props;
    return (
      <Pressable
        accessibilityLabel="测试旅行日期选择器"
        onPress={() => props.onChange({ type: "set" }, new Date(2026, 7, 21))}
      >
        <Text>测试旅行日期选择器</Text>
      </Pressable>
    );
  };
});

const originalPlatform = Platform.OS;

function setPlatform(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
}

describe("AlbumMetadataEditor", () => {
  beforeEach(() => {
    latestPickerProps = null;
    setPlatform("ios");
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform });
  });

  it("renders controlled metadata with an optional context label and an unset date", () => {
    const onChange = jest.fn();
    const view = render(
      <AlbumMetadataEditor
        contextLabel="杭州"
        disabled={false}
        onChange={onChange}
        title="杭州周末"
        travelDate="2026-07-22"
      />,
    );

    expect(view.getByLabelText("双击修改旅行册名称").props.accessibilityValue.text).toBe("杭州周末");
    expect(view.getByLabelText("选择旅行日期").props.accessibilityValue.text).toBe("杭州 · 2026-07-22");

    view.rerender(
      <AlbumMetadataEditor
        disabled={false}
        onChange={onChange}
        title="无日期旅行册"
        travelDate={null}
      />,
    );

    expect(view.getByLabelText("选择旅行日期").props.accessibilityValue.text).toBe("未设置旅行日期");
    expect(view.getByText("未设置旅行日期")).toBeTruthy();
  });

  it("enters title editing through activate and reports controlled title changes", () => {
    const onChange = jest.fn();
    render(
      <AlbumMetadataEditor disabled={false} onChange={onChange} title="杭州周末" travelDate={null} />,
    );

    fireEvent(screen.getByLabelText("双击修改旅行册名称"), "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    });
    const input = screen.getByLabelText("纪念册标题");
    fireEvent.changeText(input, "杭州夏夜");

    expect(input.props.autoFocus).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ title: "杭州夏夜" });
  });

  it("enters title editing after two presses within 350ms", () => {
    const now = jest.spyOn(Date, "now");
    try {
      render(
        <AlbumMetadataEditor disabled={false} onChange={jest.fn()} title="杭州周末" travelDate={null} />,
      );
      const title = screen.getByLabelText("双击修改旅行册名称");
      now.mockReturnValueOnce(1_000);
      fireEvent.press(title);
      expect(screen.queryByLabelText("纪念册标题")).toBeNull();
      now.mockReturnValueOnce(1_350);
      fireEvent.press(title);

      expect(screen.getByLabelText("纪念册标题")).toBeTruthy();
    } finally {
      now.mockRestore();
    }
  });

  it("uses shared date boundaries and ISO helpers when selecting a date", () => {
    const onChange = jest.fn();
    render(
      <AlbumMetadataEditor
        disabled={false}
        onChange={onChange}
        title="杭州周末"
        travelDate="2026-07-22"
      />,
    );

    fireEvent.press(screen.getByLabelText("选择旅行日期"));
    expect(latestPickerProps?.minimumDate).toBe(MIN_TRAVEL_DATE);
    expect(latestPickerProps?.maximumDate?.toDateString()).toBe(new Date().toDateString());
    expect(latestPickerProps?.value).toEqual(new Date(2026, 6, 22));
    fireEvent.press(screen.getByLabelText("测试旅行日期选择器"));

    expect(onChange).toHaveBeenCalledWith({ travelDate: "2026-08-21" });
  });

  it("does not enter title or date editing while disabled", () => {
    render(
      <AlbumMetadataEditor disabled onChange={jest.fn()} title="杭州周末" travelDate="2026-07-22" />,
    );

    const title = screen.getByLabelText("双击修改旅行册名称");
    expect(title.props.accessibilityState.disabled).toBe(true);
    fireEvent(title, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    fireEvent.press(title);
    fireEvent.press(title);
    fireEvent.press(screen.getByLabelText("选择旅行日期"));

    expect(screen.queryByLabelText("纪念册标题")).toBeNull();
    expect(screen.queryByLabelText("测试旅行日期选择器")).toBeNull();
  });

  it("presents the iOS spinner in a top-level modal and closes it", () => {
    const view = render(
      <AlbumMetadataEditor disabled={false} onChange={jest.fn()} title="杭州周末" travelDate={null} />,
    );
    fireEvent.press(view.getByLabelText("选择旅行日期"));

    const modal = view.UNSAFE_getByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(latestPickerProps?.display).toBe("spinner");
    fireEvent.press(within(modal).getByText("完成"));

    expect(view.UNSAFE_queryByType(Modal)).toBeNull();
  });

  it("closes the Android native picker after a selection", () => {
    setPlatform("android");
    render(
      <AlbumMetadataEditor
        disabled={false}
        onChange={jest.fn()}
        title="杭州周末"
        travelDate="2026-07-22"
      />,
    );
    fireEvent.press(screen.getByLabelText("选择旅行日期"));
    fireEvent.press(screen.getByLabelText("测试旅行日期选择器"));

    expect(screen.queryByLabelText("测试旅行日期选择器")).toBeNull();
  });
});
