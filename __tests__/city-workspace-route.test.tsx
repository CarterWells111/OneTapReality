import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: "hangzhou" }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
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
    mockResolveCityCollection.mockResolvedValue({ city: "hangzhou", featuredMemory: null, memories: [] });
  });

  it("loads its local collection on entry and renders the local archive without NFC content", async () => {
    const screen = render(<CityScreen />);

    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "hangzhou"));
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("册旅行记忆")).toBeTruthy();
    expect(screen.getByText("开始记录这座城")).toBeTruthy();
    expect(screen.queryByText(/NFC/i)).toBeNull();
    fireEvent.press(screen.getByText("开始记录这座城"));
    expect(mockPush).toHaveBeenCalledWith({ params: { city: "hangzhou" }, pathname: "/memory/new" });
  });
});
