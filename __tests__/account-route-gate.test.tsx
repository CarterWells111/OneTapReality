import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReplace = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({
  usePathname: () => "/memory/secret/edit",
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));

import { AccountRouteGate } from "../src/features/auth/account-route-gate";

describe("AccountRouteGate", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("does not render local content while auth is restoring or signed out", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: false, user: null });
    const screen = render(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    expect(screen.queryByText("private album")).toBeNull();

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    screen.rerender(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login?returnTo=%2Fmemory%2Fsecret%2Fedit"));
    expect(screen.queryByText("private album")).toBeNull();
  });

  it("renders local content for a restored account session", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    const screen = render(<AccountRouteGate><Text>private album</Text></AccountRouteGate>);
    expect(screen.getByText("private album")).toBeTruthy();
  });
});
