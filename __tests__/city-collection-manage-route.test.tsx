import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockDatabase = { name: "local" };
const mockResolveCityCollection = jest.fn();
const mockPersistCityCollectionOrder = jest.fn();
const mockSetFeaturedCityMemory = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { require("react").useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ city: "shanghai" }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/storage/city-collection-repository", () => ({
  persistCityCollectionOrder: (...args: unknown[]) => mockPersistCityCollectionOrder(...args),
  resolveCityCollection: (...args: unknown[]) => mockResolveCityCollection(...args),
  setFeaturedCityMemory: (...args: unknown[]) => mockSetFeaturedCityMemory(...args),
}));

import ManageCityCollectionScreen from "../src/app/city/[city]/manage";

const memories = [
  { city: "shanghai", createdAt: "2026-07-20T10:00:00.000Z", id: "one", pages: [], photoUris: [], status: "saved", title: "One", travelDate: "2026-07-20", updatedAt: "2026-07-20T10:00:00.000Z" },
  { city: "shanghai", createdAt: "2026-07-21T10:00:00.000Z", id: "two", pages: [], photoUris: [], status: "saved", title: "Two", travelDate: "2026-07-21", updatedAt: "2026-07-21T10:00:00.000Z" },
];

describe("city collection management route", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPersistCityCollectionOrder.mockReset().mockResolvedValue(undefined);
    mockSetFeaturedCityMemory.mockReset().mockResolvedValue(undefined);
    mockResolveCityCollection.mockReset().mockResolvedValue({ city: "shanghai", featuredMemory: memories[0], memories });
  });

  it("persists the selected representative after the full order with one timestamp and returns", async () => {
    const screen = await render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalledWith(mockDatabase, "shanghai"));

    await act(async () => { fireEvent.press(screen.getByLabelText("Set Two as representative")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Save collection changes")); });

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPersistCityCollectionOrder).toHaveBeenCalledWith(mockDatabase, "shanghai", ["one", "two"], expect.any(String));
    expect(mockSetFeaturedCityMemory).toHaveBeenCalledWith(mockDatabase, "shanghai", "two", expect.any(String));
    expect(mockPersistCityCollectionOrder.mock.calls[0][3]).toBe(mockSetFeaturedCityMemory.mock.calls[0][3]);
  });

  it("cancels without writing any database changes", async () => {
    const screen = await render(<ManageCityCollectionScreen />);
    await waitFor(() => expect(mockResolveCityCollection).toHaveBeenCalled());

    await act(async () => { fireEvent.press(screen.getByLabelText("Cancel collection changes")); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPersistCityCollectionOrder).not.toHaveBeenCalled();
    expect(mockSetFeaturedCityMemory).not.toHaveBeenCalled();
  });
});
