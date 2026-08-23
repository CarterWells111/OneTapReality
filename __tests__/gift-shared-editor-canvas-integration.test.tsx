import { render, screen } from "@testing-library/react-native";

jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({})),
  BackendApiError: class BackendApiError extends Error {},
}));

import { SharedAlbumEditor } from "../src/features/gifts/shared-album-editor";

describe("SharedAlbumEditor real Canvas chain", () => {
  it("renders the complete Canvas editor for a legacy shared album snapshot", () => {
    render(
      <SharedAlbumEditor
        accessToken="test-access-token"
        album={{
          role: "editor",
          title: "Legacy shared album",
          travelDate: null,
          version: 1,
          publishedAt: "2026-08-16T00:00:00Z",
          cover: null,
          pages: [{
            position: 0,
            page: {
              id: "legacy-page",
              position: 0,
              kind: "cover",
              headline: "真实共享封面",
              body: "旧快照也必须可编辑",
              coverColor: "#F3E5D0",
            },
          }],
          media: [{
            id: "legacy-photo",
            position: 0,
            contentType: "image/jpeg",
            byteSize: 12,
            readUrl: "https://signed.test/legacy.jpg",
          }],
        }}
        giftId="gift-legacy"
        onAccessLost={jest.fn()}
        onPublished={jest.fn()}
      />,
    );

    expect(screen.getByTestId("album-canvas")).toBeTruthy();
    expect(screen.getByTestId("saved-memory-metadata-header")).toBeTruthy();
    expect(screen.getByLabelText("打开页面管理")).toBeTruthy();
    expect(screen.getByText("暂存当前修改")).toBeTruthy();
    expect(screen.getByText("保存并发布更新")).toBeTruthy();
  });
});
