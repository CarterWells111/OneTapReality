import { act, fireEvent, render } from "@testing-library/react-native";

import { CityCollectionManager } from "../src/features/cities/city-collection-manager";
import type { Memory } from "../src/types/memory";

const memories: Memory[] = [
  { city: "shanghai", createdAt: "2026-07-20T10:00:00.000Z", id: "one", pages: [], photoUris: [], status: "saved", title: "One", travelDate: "2026-07-20", updatedAt: "2026-07-20T10:00:00.000Z" },
  { city: "shanghai", createdAt: "2026-07-21T10:00:00.000Z", id: "two", pages: [], photoUris: [], status: "saved", title: "Two", travelDate: "2026-07-21", updatedAt: "2026-07-21T10:00:00.000Z" },
];

describe("CityCollectionManager", () => {
  it("keeps a representative selection in the unsaved management draft and sends it with the full order", async () => {
    const onSave = jest.fn();
    const screen = await render(<CityCollectionManager featuredMemoryId="one" memories={memories} onCancel={() => {}} onSave={onSave} />);

    await act(async () => { fireEvent.press(screen.getByLabelText("Set Two as representative")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("Save collection changes")); });

    expect(onSave).toHaveBeenCalledWith(["one", "two"], "two");
  });

  it("leaves persistence to the caller and makes cancellation explicit", async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    const screen = await render(<CityCollectionManager featuredMemoryId="one" memories={memories} onCancel={onCancel} onSave={onSave} />);

    await act(async () => { fireEvent.press(screen.getByLabelText("Cancel collection changes")); });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("always provides Fabric with a transform array for an idle row", async () => {
    const screen = await render(<CityCollectionManager featuredMemoryId="one" memories={memories} onCancel={() => {}} onSave={() => {}} />);

    const row = screen.getByTestId("city-collection-row-one");

    expect(row.props.style.transform).toEqual([]);
  });
});
