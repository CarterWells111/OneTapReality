import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { colors } from "../src/components/ui";
import { PhotoTemplatePicker } from "../src/features/canvas/photo-template-picker";

const familyLabels = ["经典留白", "杂志侧栏", "横向叙事", "手账错落", "竖向切片"];
const countLabels = ["单图", "双图", "三图"];

describe("PhotoTemplatePicker", () => {
  it.each([1, 2, 3] as const)("renders the five registry families in order for %s photo(s)", (photoCount) => {
    const screen = render(<PhotoTemplatePicker photoCount={photoCount} onSelect={() => undefined} />);

    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getAllByRole("button").map((button) => button.props.accessibilityLabel)).toEqual(
      familyLabels.map((familyLabel) => `${familyLabel}${countLabels[photoCount - 1]}模板`),
    );
  });

  it("filters templates to the requested photo count", () => {
    const screen = render(<PhotoTemplatePicker photoCount={2} onSelect={() => undefined} />);

    expect(screen.queryByLabelText("杂志侧栏三图模板")).toBeNull();
    expect(screen.queryByLabelText("经典留白单图模板")).toBeNull();
  });

  it("reports the exact selected template and exposes the selected state", () => {
    const onSelect = jest.fn();
    const screen = render(
      <PhotoTemplatePicker photoCount={2} selectedTemplateId="classic-2" onSelect={onSelect} />,
    );
    const selected = screen.getByLabelText("经典留白双图模板");
    const unselected = screen.getByLabelText("杂志侧栏双图模板");

    expect(selected.props.accessibilityRole).toBe("button");
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(unselected.props.accessibilityState).toEqual({ selected: false });

    fireEvent.press(unselected);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("magazine-2");

    screen.rerender(
      <PhotoTemplatePicker photoCount={2} selectedTemplateId="magazine-2" onSelect={onSelect} />,
    );
    expect(screen.getByLabelText("杂志侧栏双图模板").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId("photo-template-check-magazine-2")).toBeTruthy();
  });

  it("renders no template buttons for unsupported photo counts", () => {
    const screen = render(<PhotoTemplatePicker photoCount={4} onSelect={() => undefined} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("uses a 3:4 preview and registry-derived percentage geometry with rotation", () => {
    const screen = render(<PhotoTemplatePicker photoCount={2} onSelect={() => undefined} />);
    const previewStyle = StyleSheet.flatten(screen.getByTestId("photo-template-preview-magazine-2").props.style);
    const slotStyle = StyleSheet.flatten(screen.getByTestId("photo-template-slot-magazine-2-2").props.style);

    expect(previewStyle).toMatchObject({ aspectRatio: 0.75 });
    expect(slotStyle).toMatchObject({
      left: "64%",
      top: "18%",
      width: "28%",
      height: "57%",
      transform: [{ rotate: "0deg" }],
    });
  });

  it("keeps every template option at least 44 points and shows a selected border", () => {
    const screen = render(
      <PhotoTemplatePicker photoCount={1} selectedTemplateId="collage-1" onSelect={() => undefined} />,
    );
    const selected = screen.getByLabelText("手账错落单图模板");
    const style = StyleSheet.flatten(selected.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.borderColor).toBe(colors.accent);
    expect(style.borderWidth).toBeGreaterThan(1);
    expect(screen.getByTestId("photo-template-check-collage-1")).toBeTruthy();
  });
});
