import { act, fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

import {
  BookCanvasEditor,
  type BookEditorChangeReason,
} from "../src/features/canvas/book-canvas-editor";
import { canvasPages } from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const requestPermissionMock = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchImageLibraryMock = ImagePicker.launchImageLibraryAsync as jest.Mock;

const pages: StoryPage[] = [
  { id: "page-1", position: 0, kind: "cover", headline: "First page", body: "First body" },
  { id: "page-2", position: 1, kind: "closing", headline: "Last page", body: "Last body" },
];

function EditorHarness({ onChange = () => undefined, persistSelectedPhoto }: {
  onChange?: (nextPages: StoryPage[], reason: BookEditorChangeReason) => void;
  persistSelectedPhoto?: (uri: string) => Promise<string>;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return <BookCanvasEditor pages={currentPages} persistSelectedPhoto={persistSelectedPhoto} onPagesChange={(nextPages, reason) => {
    setCurrentPages(nextPages);
    onChange(nextPages, reason);
  }} />;
}

const editorLabel = "编辑选中文字";
const stickerCategory = "贴纸 2";
const stickerChoice = "添加贴纸 2-01";
const backgroundTray = "背景";
const backgroundChoice = "选择背景 01";

describe("BookCanvasEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue({ granted: true });
    launchImageLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///temporary.jpg" }],
    });
  });

  it("opens the text editor via the edit button after double press", () => {
    const screen = render(<EditorHarness />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    const nowSpy = jest.spyOn(Date, "now");

    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    try {
      fireEvent.press(headline);
      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      // Double-tap selects the element
      fireEvent.press(headline);
      // The '编辑' button should now be visible in the toolbar
      expect(screen.queryByText("编辑")).toBeTruthy();
      // Text editor only opens after clicking the '编辑' button (Feature #3b)
      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("clears a selected editor on a blank-page press without persisting changes, requires edit button to re-edit", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      fireEvent.press(headline);
      now += 100;
      fireEvent.press(headline);
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();

      fireEvent.press(screen.getByTestId("album-canvas"));

      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      expect(onChange).not.toHaveBeenCalled();

      // Re-select and re-edit
      now += 500;
      fireEvent.press(headline);
      now += 100;
      fireEvent.press(headline);
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("adds a sticker and selects it for layer editing", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText(stickerCategory));
    fireEvent.press(screen.getByLabelText(stickerChoice));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sticker", stickerId: "sticker2-01" }),
    ]));
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), "structure");
  });

  it("sets the current page background from the asset tray", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText(backgroundTray));
    fireEvent.press(screen.getByLabelText(backgroundChoice));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.backgroundId).toBe("background-01");
  });

  it("opens page management from the toolbar", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));

    expect(screen.getByLabelText("完成页面管理")).toBeTruthy();
    expect(screen.getByTestId("page-cell-0")).toBeTruthy();
    expect(screen.getByTestId("page-cell-1")).toBeTruthy();
  });

  it("adds a selected photo only after it is copied to permanent storage", async () => {
    const onChange = jest.fn();
    const persistSelectedPhoto = jest.fn().mockResolvedValue("file:///Documents/account/memory/photo.jpg");
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    await act(async () => {
      fireEvent.press(screen.getByText("📷 添加照片"));
    });

    expect(persistSelectedPhoto).toHaveBeenCalledWith("file:///temporary.jpg");
    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(latestPages[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image", uri: "file:///Documents/account/memory/photo.jpg" }),
    ]));
  });

  it("shows an alert and leaves the canvas unchanged when a selected photo cannot be copied", async () => {
    const onChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={jest.fn().mockRejectedValue(new Error("no space"))} />);

    await act(async () => {
      fireEvent.press(screen.getByText("📷 添加照片"));
    });

    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("iCloud"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("persists a cover before applying it and keeps the existing cover on failure", async () => {
    const onChange = jest.fn();
    const persistSelectedPhoto = jest.fn()
      .mockResolvedValueOnce("file:///Documents/account/memory/cover.jpg")
      .mockRejectedValueOnce(new Error("permission changed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    fireEvent.press(screen.getByText("封面"));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("上传封面背景图"));
    });
    const appliedPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(appliedPages[0].coverImage).toBe("file:///Documents/account/memory/cover.jpg");
    expect(appliedPages[0].layout?.coverImage).toBe("file:///Documents/account/memory/cover.jpg");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("上传封面背景图"));
    });
    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("存储空间"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
