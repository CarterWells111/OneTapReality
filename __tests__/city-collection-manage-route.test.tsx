import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { back: mockBack, replace: mockReplace };
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();
const mockSaveCityCollection = jest.fn();
const mockUseAuth = jest.fn();
let mockCity = "shanghai";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: mockCity }),
  useRouter: () => mockRouter,
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => {
    const auth = mockUseAuth();
    return { isReady: auth.isAuthReady, owner: auth.user ? `account:${auth.user.email.toLowerCase()}` : "guest" };
  },
}));
jest.mock("../src/storage/city-collection-repository", () => ({
  resolveCityCollection: (...args: unknown[]) => mockResolveCityCollection(...args),
  saveCityCollection: (...args: unknown[]) => mockSaveCityCollection(...args),
}));

import ManageCityCollectionScreen from "../src/app/city/[city]/manage";

const memories = [
  { city: "shanghai", createdAt: "2026-07-20T10:00:00.000Z", id: "one", pages: [], photoUris: [], status: "saved", title: "One", travelDate: "2026-07-20", updatedAt: "2026-07-20T10:00:00.000Z" },
  { city: "shanghai", createdAt: "2026-07-21T10:00:00.000Z", id: "two", pages: [], photoUris: [], status: "saved", title: "Two", travelDate: "2026-07-21", updatedAt: "2026-07-21T10:00:00.000Z" },
];

describe("city collection management route", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCity = "shanghai";
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "Owner@Example.com" } });
    mockSaveCityCollection.mockReset().mockResolvedValue(undefined);
    mockResolveCityCollection.mockReset().mockResolvedValue({ city: "shanghai", featuredMemory: memories[0], memories });
  });

  it("atomically persists the selected representative with the full order and returns", async () => {
    const screen = render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "shanghai", "account:owner@example.com"));

    await act(async () => { fireEvent.press(screen.getByLabelText("将Two设为精选旅行册")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("保存城市旅行册更改")); });

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockSaveCityCollection).toHaveBeenCalledWith(mockDatabase, "shanghai", ["one", "two"], "two", expect.any(String), "account:owner@example.com");
  });

  it("cancels without writing any database changes", async () => {
    const screen = render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalled());

    await act(async () => { fireEvent.press(screen.getByLabelText("取消城市旅行册更改")); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSaveCityCollection).not.toHaveBeenCalled();
  });

  it("removes the previous account collection and save controls during an account switch", async () => {
    const screen = render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(screen.getByText("One")).toBeTruthy());

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "b@example.com" } });
    mockResolveCityCollection.mockReturnValueOnce(new Promise(() => undefined));
    screen.rerender(<ManageCityCollectionScreen />);

    expect(screen.queryByText("One")).toBeNull();
    expect(screen.queryByLabelText("保存城市旅行册更改")).toBeNull();
  });

  it("removes the previous city collection and save controls during a route change", async () => {
    const screen = render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(screen.getByText("One")).toBeTruthy());

    mockCity = "hangzhou";
    mockResolveCityCollection.mockReturnValueOnce(new Promise(() => undefined));
    screen.rerender(<ManageCityCollectionScreen />);

    expect(screen.queryByText("One")).toBeNull();
    expect(screen.queryByLabelText("保存城市旅行册更改")).toBeNull();
  });

  it("maps storage failures to a stable Chinese action without raw exception text", async () => {
    mockResolveCityCollection.mockRejectedValueOnce(new Error("SQLite disk image malformed"));
    const screen = render(<ManageCityCollectionScreen />);

    await waitFor(() => expect(screen.getByText("暂时无法读取这座城市的旅行册，请稍后重试。")).toBeTruthy());
    expect(screen.queryByText(/SQLite|malformed/u)).toBeNull();
  });

  it("does not render a raw save exception", async () => {
    mockSaveCityCollection.mockRejectedValueOnce(new Error("raw write failure"));
    const screen = render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(screen.getByText("One")).toBeTruthy());

    await act(async () => { fireEvent.press(screen.getByLabelText("保存城市旅行册更改")); });

    await waitFor(() => expect(screen.getByText("暂时无法保存城市旅行册，请检查本机空间后重试。")).toBeTruthy());
    expect(screen.queryByText(/raw write failure/u)).toBeNull();
  });
});
