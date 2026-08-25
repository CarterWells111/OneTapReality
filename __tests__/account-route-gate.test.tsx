import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReplace = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalLibrary = jest.fn();

jest.mock("expo-router", () => ({
  usePathname: () => "/memory/secret/edit",
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/local-library-provider", () => ({ useLocalLibrary: () => mockUseLocalLibrary() }));

import { AccountRouteGate } from "../src/features/auth/account-route-gate";

describe("AccountRouteGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalLibrary.mockReturnValue({ isReady: true });
  });

  it("waits for auth bootstrap but renders local content for a guest", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: false, user: null });
    const screen = render(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    expect(screen.queryByText("private album")).toBeNull();

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    screen.rerender(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    await waitFor(() => expect(screen.getByText("private album")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders local content for a restored account session", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    const screen = render(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    expect(screen.getByText("private album")).toBeTruthy();
  });

  it("blocks local routes until the logged-in user resolves the guest/account choice", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockUseLocalLibrary.mockReturnValue({ isReady: false, needsMigrationChoice: true });
    const screen = render(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    expect(screen.queryByText("private album")).toBeNull();
  });
});
