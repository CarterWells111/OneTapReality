import * as React from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockLoadAsync = jest.fn();

jest.mock("expo-font", () => ({
  loadAsync: (...args: unknown[]) => mockLoadAsync(...args),
}));

import {
  FontLoadingProvider,
  useFontLoading,
} from "../src/features/typography/font-loading-provider";

function FontRequester() {
  const { requestFont, resolveFontFamily } = useFontLoading();
  return (
    <>
      <Text testID="resolved-family">{resolveFontFamily("MaoKenZhuYuan") ?? "system"}</Text>
      <Pressable
        accessibilityLabel="choose-font"
        onPress={() => requestFont("MaoKenZhuYuan", true)}>
        <Text>choose</Text>
      </Pressable>
    </>
  );
}

describe("FontLoadingProvider", () => {
  beforeEach(() => {
    mockLoadAsync.mockReset();
  });

  it("renders children immediately and keeps loading after the progress prompt is closed", async () => {
    let finishFirst!: () => void;
    mockLoadAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    mockLoadAsync.mockResolvedValue(undefined);

    const screen = render(
      <FontLoadingProvider>
        <Text>ready now</Text>
        <FontRequester />
      </FontLoadingProvider>,
    );

    expect(screen.getByText("ready now")).toBeTruthy();
    expect(screen.getByTestId("resolved-family").props.children).toBe("system");
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText("choose-font"));
    expect(screen.getByLabelText("字体加载进度")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("关闭字体加载提示"));
    expect(screen.queryByLabelText("字体加载进度")).toBeNull();

    await act(async () => { finishFirst(); });
    await waitFor(() => expect(mockLoadAsync.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(Object.keys(mockLoadAsync.mock.calls[1][0])).toEqual(["MaoKenZhuYuan"]);
    await waitFor(() => expect(screen.getByTestId("resolved-family").props.children).toBe("MaoKenZhuYuan"));
  });

  it("keeps the system fallback and offers retry when the requested font fails", async () => {
    let finishFirst!: () => void;
    mockLoadAsync
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockRejectedValueOnce(new Error("broken font"))
      .mockImplementation(() => new Promise<void>(() => undefined));

    const screen = render(
      <FontLoadingProvider>
        <FontRequester />
      </FontLoadingProvider>,
    );

    fireEvent.press(screen.getByLabelText("choose-font"));
    await act(async () => { finishFirst(); });
    await waitFor(() => expect(screen.getByLabelText("重试加载字体")).toBeTruthy());
    expect(screen.getByTestId("resolved-family").props.children).toBe("system");
  });
});
