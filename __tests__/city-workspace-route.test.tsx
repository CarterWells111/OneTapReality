import { fireEvent, renderAsync, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: "hangzhou" }),
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ isReady: true, memories: [] }),
}));
jest.mock("../src/storage/city-collection-repository", () => ({
  resolveCityCollection: (...args: unknown[]) => mockResolveCityCollection(...args),
}));
import CityScreen from "../src/app/city/[city]";

describe("city workspace route", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockResolveCityCollection.mockResolvedValue({ city: "hangzhou", featuredMemory: null, memories: [] });
  });

  it("loads its local collection on entry, omits NFC content, and routes city markers by replacement", async () => {
    const screen = await renderAsync(<CityScreen />);

    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "hangzhou"));
    expect(screen.getByText("0 saved memories")).toBeTruthy();
    expect(screen.queryByText(/NFC/i)).toBeNull();
    fireEvent.press(screen.getByLabelText("上海，已保存 0 册旅行记忆"));
    expect(mockReplace).toHaveBeenCalledWith({ params: { city: "shanghai" }, pathname: "/city/[city]" });
  });
});
