import { render } from "@testing-library/react-native";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: [] }),
}));

import FullscreenCityMapScreen, { resolveFullscreenMapInsets } from "../src/app/city-map";

describe("FullscreenCityMapScreen", () => {
  it("uses an iPhone portrait fallback when runtime safe-area insets are unavailable", () => {
    expect(resolveFullscreenMapInsets(
      { bottom: 0, top: 0 },
      { height: 844, width: 390 },
    )).toEqual({ paddingBottom: 4, paddingTop: 54 });
    expect(resolveFullscreenMapInsets(
      { bottom: 34, top: 59 },
      { height: 844, width: 390 },
    )).toEqual({ paddingBottom: 34, paddingTop: 59 });
  });

  it("keeps the fullscreen header below the system status area and lets the workspace map fill the remaining viewport", async () => {
    const screen = await render(<FullscreenCityMapScreen />);
    const headerStyle = screen.getByTestId("fullscreen-city-map-header").props.style;
    const viewportStyle = screen.getByTestId("fullscreen-city-map-viewport").props.style;
    const workspaceStyle = screen.getByTestId("city-map-workspace").props.style;
    const closeStyle = screen.getByTestId("fullscreen-city-map-close").props.style;

    expect(headerStyle).toMatchObject({ paddingBottom: 8, paddingTop: 8 });
    expect(screen.getByTestId("fullscreen-city-map-close")).toBeTruthy();
    // close button style is a function (pressed state); validate first array element
    expect(Array.isArray(closeStyle) ? closeStyle[0] : closeStyle).toMatchObject({ height: 44, width: 44 });
    expect(viewportStyle).toMatchObject({ flex: 1, padding: 4 });
    expect(workspaceStyle).toMatchObject({ flex: 1, width: "100%" });
    expect(workspaceStyle.aspectRatio).toBeUndefined();
  });
});
