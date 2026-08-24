import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalLibrary = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/local-library-provider", () => ({ useLocalLibrary: () => mockUseLocalLibrary() }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: [], isReady: true, discardMemory: jest.fn() }),
}));
jest.mock("../src/features/export/share-action-sheet", () => ({ showShareActionSheet: jest.fn() }));

import MemoriesHomeScreen from "../src/app/(tabs)";

describe("home account entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalLibrary.mockReturnValue({
      continueWithGuest: jest.fn(),
      isMigrating: false,
      migrateToAccount: jest.fn(),
      needsMigrationChoice: false,
      owner: "guest",
    });
  });

  it("shows login registration to a signed-out user and preserves the home return path", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    const screen = render(<MemoriesHomeScreen />);

    fireEvent.press(screen.getByText("登录 / 注册"));
    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=/" as never);
    expect(screen.getByText("创建纪念册")).toBeTruthy();
    expect(screen.getByText("从第一段旅程开始")).toBeTruthy();
  });

  it("requires a clear guest/account choice after login without silently moving albums", async () => {
    const continueWithGuest = jest.fn();
    const migrateToAccount = jest.fn();
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockUseLocalLibrary.mockReturnValue({
      continueWithGuest,
      isMigrating: false,
      migrateToAccount,
      needsMigrationChoice: true,
      owner: "guest",
    });
    const screen = render(<MemoriesHomeScreen />);

    expect(screen.getByText("选择本机旅行册")).toBeTruthy();
    fireEvent.press(screen.getByText("继续使用访客旅行册"));
    fireEvent.press(screen.getByText("迁移到当前账户"));
    await waitFor(() => expect(continueWithGuest).toHaveBeenCalledTimes(1));
    expect(migrateToAccount).toHaveBeenCalledTimes(1);
  });

  it("shows the signed-in email and routes account management to My", () => {
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      user: { id: "user-1", email: "owner@example.com", isAdmin: true },
    });
    const screen = render(<MemoriesHomeScreen />);

    expect(screen.getByText("owner@example.com")).toBeTruthy();
    fireEvent.press(screen.getByText("账户"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/profile" as never);
  });

  it("sends signed-out gift visitors through login before opening their gifts", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    const screen = render(<MemoriesHomeScreen />);

    fireEvent.press(screen.getByText("我的纪念品"));
    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=/gifts" as never);
  });

  it("does not treat authentication hydration as a signed-out account", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: false, user: null });
    const screen = render(<MemoriesHomeScreen />);

    fireEvent.press(screen.getByText("我的纪念品"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText("登录 / 注册")).toBeNull();
  });
});
