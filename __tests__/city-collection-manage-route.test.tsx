import { act, fireEvent, renderAsync, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();
const mockSaveCityCollection = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: "shanghai" }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
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
    mockSaveCityCollection.mockReset().mockResolvedValue(undefined);
    mockResolveCityCollection.mockReset().mockResolvedValue({ city: "shanghai", featuredMemory: memories[0], memories });
  });

  it("atomically persists the selected representative with the full order and returns", async () => {
    const screen = await renderAsync(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "shanghai"));

    await act(async () => { fireEvent.press(screen.getByLabelText("Set Two as representative")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Save collection changes")); });

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockSaveCityCollection).toHaveBeenCalledWith(mockDatabase, "shanghai", ["one", "two"], "two", expect.any(String));
  });

  it("cancels without writing any database changes", async () => {
    const screen = await renderAsync(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalled());

    await act(async () => { fireEvent.press(screen.getByLabelText("Cancel collection changes")); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSaveCityCollection).not.toHaveBeenCalled();
  });
});
