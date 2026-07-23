import { render } from "@testing-library/react-native";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: [] }),
}));

import FullscreenCityMapScreen from "../src/app/city-map";

describe("FullscreenCityMapScreen", () => {
  it("uses a compact overlay header and lets the workspace map fill the remaining safe-area viewport", async () => {
    const screen = await render(<FullscreenCityMapScreen />);
    const headerStyle = screen.getByTestId("fullscreen-city-map-header").props.style;
    const viewportStyle = screen.getByTestId("fullscreen-city-map-viewport").props.style;
    const workspaceStyle = screen.getByTestId("city-map-workspace").props.style;
    const closeStyle = screen.getByTestId("fullscreen-city-map-close").props.style;

    expect(headerStyle.paddingVertical).toBeLessThanOrEqual(8);
    expect(screen.getByTestId("fullscreen-city-map-screen").props.edges).toMatchObject({ top: "additive" });
    expect(screen.getByTestId("fullscreen-city-map-close")).toBeTruthy();
    expect(closeStyle).toMatchObject({ height: 44, width: 44 });
    expect(viewportStyle).toMatchObject({ flex: 1, padding: 4 });
    expect(workspaceStyle).toMatchObject({ flex: 1, width: "100%" });
    expect(workspaceStyle.aspectRatio).toBeUndefined();
  });
});
