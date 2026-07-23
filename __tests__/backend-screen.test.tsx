jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import BackendExperimentScreen from "../src/app/backend";
import { BackendApiClient } from "../src/services/backend/api-client";

const mockGetHealth = jest.spyOn(BackendApiClient.prototype, "getHealth");
const mockGetCapabilities = jest.spyOn(BackendApiClient.prototype, "getCapabilities");

describe("backend experiment screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetHealth.mockResolvedValue({ service: "adventurex-api", contractVersion: 1, database: "ok" });
    mockGetCapabilities.mockResolvedValue({
      contractVersion: 1,
      features: { deviceRegistration: true, memoryCrud: true, automaticSync: false, photoUpload: false },
    });
  });

  it("only probes the backend after an explicit button press", async () => {
    const view = await render(<BackendExperimentScreen />);
    expect(mockGetHealth).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByText("检查后端连接"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("后端连接正常")).toBeTruthy());
    expect(mockGetHealth).toHaveBeenCalledTimes(1);
    expect(mockGetCapabilities).toHaveBeenCalledTimes(1);
  });
});
