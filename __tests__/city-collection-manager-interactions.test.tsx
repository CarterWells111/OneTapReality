import { act, fireEvent, render } from "@testing-library/react-native";

const mockPans: Array<{ begin?: () => void; finalize?: (event: { translationY: number }) => void; update?: (event: { translationY: number }) => void }> = [];

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return {
    Gesture: {
      Pan: () => {
        const gesture: Record<string, unknown> = {};
        gesture.activateAfterLongPress = () => gesture;
        gesture.onBegin = (callback: () => void) => { gesture.begin = callback; return gesture; };
        gesture.onUpdate = (callback: (event: { translationY: number }) => void) => { gesture.update = callback; return gesture; };
        gesture.onFinalize = (callback: (event: { translationY: number }) => void) => { gesture.finalize = callback; return gesture; };
        mockPans.push(gesture);
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import { CityCollectionManager } from "../src/features/cities/city-collection-manager";
import type { Memory } from "../src/types/memory";

const memories: Memory[] = [
  { city: "shanghai", createdAt: "2026-07-20T10:00:00.000Z", id: "one", pages: [], photoUris: [], status: "saved", title: "One", travelDate: "2026-07-20", updatedAt: "2026-07-20T10:00:00.000Z" },
  { city: "shanghai", createdAt: "2026-07-21T10:00:00.000Z", id: "two", pages: [], photoUris: [], status: "saved", title: "Two", travelDate: "2026-07-21", updatedAt: "2026-07-21T10:00:00.000Z" },
];

describe("CityCollectionManager drag interaction", () => {
  beforeEach(() => { mockPans.splice(0, mockPans.length); });

  it("commits a long-press drag as a deterministic reordered save draft", async () => {
    const onSave = jest.fn();
    const screen = await render(<CityCollectionManager featuredMemoryId="one" memories={memories} onCancel={() => {}} onSave={onSave} />);

    await act(async () => {
      mockPans[0].begin?.();
      mockPans[0].update?.({ translationY: 100 });
      mockPans[0].finalize?.({ translationY: 100 });
    });
    await act(async () => { fireEvent.press(screen.getByLabelText("保存城市旅行册更改")); });

    expect(onSave).toHaveBeenCalledWith(["two", "one"], "one");
  });
});
