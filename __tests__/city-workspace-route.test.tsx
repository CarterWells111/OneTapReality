import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: "hangzhou" }),
  useRouter: () => mockRouter,
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ isReady: true, memories: [] }),
}));
jest.mock("../src/storage/city-collection-repository", () => ({
  resolveCityCollection: (...args: unknown[]) => mockResolveCityCollection(...args),
}));
import CityScreen from "../src/app/city/[city]";

describe("city archive route", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "Owner@Example.com" } });
    mockResolveCityCollection.mockResolvedValue({ city: "hangzhou", featuredMemory: null, memories: [] });
  });

  it("loads its local collection on entry and renders the local archive without NFC content", async () => {
    const screen = render(<CityScreen />);

    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "hangzhou", "owner@example.com"));
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("册旅行记忆")).toBeTruthy();
    expect(screen.getByText("开始记录这座城")).toBeTruthy();
    expect(screen.queryByText(/NFC/i)).toBeNull();
    fireEvent.press(screen.getByText("开始记录这座城"));
    expect(mockPush).toHaveBeenCalledWith({ params: { city: "hangzhou" }, pathname: "/memory/new" });
  });

  it("hides the previous account collection immediately when the account changes", async () => {
    const privateMemory = {
      id: "private-a", title: "Account A private album", city: "hangzhou", travelDate: "2026-08-01",
      status: "saved", coverColor: "#EFE2CF", photoUris: [], pages: [],
      createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    mockResolveCityCollection.mockResolvedValueOnce({
      city: "hangzhou",
      featuredMemory: privateMemory,
      memories: [privateMemory],
    });
    const screen = render(<CityScreen />);
    await waitFor(() => expect(screen.getByText("Account A private album")).toBeTruthy());

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "b@example.com" } });
    mockResolveCityCollection.mockReturnValueOnce(new Promise(() => undefined));
    screen.rerender(<CityScreen />);

    expect(screen.queryByText("Account A private album")).toBeNull();
  });
});
