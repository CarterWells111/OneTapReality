import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  const Stack = ({ children }: { children: React.ReactNode }) => <View testID="nested-stack">{children}</View>;
  const Screen = ({ name, options }: { name: string; options?: { title?: string } }) => (
    <View testID={`nested-screen-${name}`} title={options?.title} />
  );
  Screen.displayName = "MockStackScreen";
  Stack.Screen = Screen;
  return { Stack, Slot: () => <View testID="slot" /> };
});

jest.mock("../src/features/auth/account-route-gate", () => {
  const { View } = require("react-native");
  return {
    AccountRouteGate: ({ children }: { children: React.ReactNode }) => (
      <View testID="account-route-gate">{children}</View>
    ),
  };
});

import MemoryRoutesLayout from "../src/app/memory/_layout";
import RecycleBinRoutesLayout from "../src/app/recycle-bin/_layout";

describe("nested account route layouts", () => {
  it("registers all memory screens inside the protected memory stack", () => {
    const screen = render(<MemoryRoutesLayout />);

    expect(screen.getByTestId("account-route-gate")).toBeTruthy();
    expect(screen.getByTestId("nested-screen-new")).toBeTruthy();
    expect(screen.getByTestId("nested-screen-review/[id]")).toBeTruthy();
    expect(screen.getByTestId("nested-screen-[id]")).toBeTruthy();
    expect(screen.getByTestId("nested-screen-[id]/edit")).toBeTruthy();
  });

  it("registers recycle bin index inside its protected stack", () => {
    const screen = render(<RecycleBinRoutesLayout />);

    expect(screen.getByTestId("account-route-gate")).toBeTruthy();
    expect(screen.getByTestId("nested-screen-index").props.title).toBe("回收站");
  });
});
