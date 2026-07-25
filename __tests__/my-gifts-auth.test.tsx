import { render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockListOwnedGifts = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/services/backend/api-client", () => ({ BackendApiClient: jest.fn(() => ({ listOwnedGifts: mockListOwnedGifts })) }));

import MyGiftsScreen from "../src/app/gifts/index";

describe("my gifts account gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListOwnedGifts.mockResolvedValue([]);
  });

  it("sends signed-out visitors to the global login screen", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    expect(screen.getByText("登录")).toBeTruthy();
  });

  it("uses the unified session to load owner gifts", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } }, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    await waitFor(() => expect(mockListOwnedGifts).toHaveBeenCalledWith("account-token"));
  });
});
