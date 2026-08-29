import { act, fireEvent, render } from "@testing-library/react-native";

import type { Memory, StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUpdatePages = jest.fn();
const mockPersistSelectedPhoto = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();
const mockClearMemoryEditDraft = jest.fn();

const mockPages: StoryPage[] = [{
  id: "page-1",
  position: 0,
  kind: "photo",
  headline: "Photo",
  body: "",
  layout: {
    aspectRatio: 0.75,
    elements: [{
      id: "photo-1",
      type: "image",
      uri: "file:///photo.jpg",
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      rotation: 0,
      zIndex: 1,
    }],
  },
}];

const mockMemory: Memory = {
  id: "memory-1",
  title: "Trip",
  city: "london",
  travelDate: "2026-08-17",
  photoUris: ["file:///photo.jpg"],
  pages: mockPages,
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T10:00:00.000Z",
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "memory-1" }),
  useRouter: () => ({ back: mockBack, dismissTo: mockReplace }),
}));

jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { email: "owner@example.com" } }),
}));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => ({ owner: "account:owner@example.com" }),
}));

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({
    getDraftById: jest.fn(),
    clearMemoryEditDraft: mockClearMemoryEditDraft,
    getMemoryById: () => mockMemory,
    getMemoryEditDraft: mockGetMemoryEditDraft,
    persistSelectedPhoto: mockPersistSelectedPhoto,
    saveMemoryEditDraft: mockSaveMemoryEditDraft,
    updatePages: mockUpdatePages,
  }),
}));

jest.mock("../src/features/canvas/book-canvas-editor", () => {
  const React = require("react") as typeof import("react");
  const { Button, View } = jest.requireActual("react-native");
  type MockHandle = {
    prepareSave: () => Promise<{ cursor: { pageId: string; index: number }; pages: StoryPage[] }>;
    releaseSaveLock: () => void;
  };
  const BookCanvasEditor = React.forwardRef<MockHandle, {
    onPagesChange: (nextPages: StoryPage[], reason: "transform") => void;
    onTransformPendingChange?: (pending: boolean) => void;
    pages: StoryPage[];
    persistSelectedPhoto?: (uri: string) => Promise<string>;
  }>(function MockBookCanvasEditor({ onPagesChange, onTransformPendingChange, pages, persistSelectedPhoto }, ref) {
    React.useImperativeHandle(ref, () => ({
      prepareSave: async () => ({ cursor: { pageId: pages[0]?.id ?? "", index: 0 }, pages }),
      releaseSaveLock: () => undefined,
    }), [pages]);
    return (
      <View>
        <Button title="begin rotation" onPress={() => onTransformPendingChange?.(true)} />
        <Button title="persist photo" onPress={() => void persistSelectedPhoto?.("file:///temporary.jpg")} />
        <Button
          title="finish rotation"
          onPress={() => {
            const rotated = mockPages.map((page) => ({
              ...page,
              layout: page.layout ? {
                ...page.layout,
                elements: page.layout.elements.map((element) => ({ ...element, rotation: 0.7 })),
              } : undefined,
            }));
            onPagesChange(rotated, "transform");
            onTransformPendingChange?.(false);
          }}
        />
      </View>
    );
  });
  return { BookCanvasEditor };
});

import EditMemoryScreen from "../src/app/memory/[id]/edit";

describe("memory canvas rotation saving", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMemoryEditDraft.mockResolvedValue(null);
    mockSaveMemoryEditDraft.mockResolvedValue(undefined);
    mockClearMemoryEditDraft.mockResolvedValue(undefined);
    mockUpdatePages.mockResolvedValue(undefined);
  });

  it("waits for the final rotation commit before saving the canvas", async () => {
    const screen = render(<EditMemoryScreen />);
    await screen.findByText("begin rotation");

    fireEvent.press(screen.getByText("begin rotation"));
    await act(async () => {
      fireEvent.press(screen.getByText("保存并退出画布"));
    });
    expect(mockUpdatePages).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("finish rotation"));
    await act(async () => {
      fireEvent.press(screen.getByText("保存并退出画布"));
    });

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][1][0].layout.elements[0].rotation).toBe(0.7);
  });

  it("binds editor photo persistence to the current memory", async () => {
    mockPersistSelectedPhoto.mockResolvedValue("file:///permanent.jpg");
    const screen = render(<EditMemoryScreen />);
    await screen.findByText("persist photo");

    fireEvent.press(screen.getByText("persist photo"));

    expect(mockPersistSelectedPhoto).toHaveBeenCalledWith("memory-1", "file:///temporary.jpg");
  });
});
