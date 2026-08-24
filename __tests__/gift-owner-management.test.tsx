import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetOwnedGiftManagement = jest.fn();
const mockAddOwnedGiftMember = jest.fn();
const mockUpdateOwnedGiftMemberRole = jest.fn();
const mockRemoveOwnedGiftMember = jest.fn();
const mockListOwnedGiftManagementRequests = jest.fn();
const mockDecideOwnedGiftManagementRequest = jest.fn();
const mockStartOwnedGiftPublish = jest.fn();
const mockFinishOwnedGiftPublish = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockMemories = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockGetInfoAsync = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => mockRouter,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/memories/memories-provider", () => ({ useMemories: () => ({ memories: mockMemories() }) }));
jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({
    addOwnedGiftMember: mockAddOwnedGiftMember,
    getOwnedGiftManagement: mockGetOwnedGiftManagement,
    removeOwnedGiftMember: mockRemoveOwnedGiftMember,
    listOwnedGiftManagementRequests: mockListOwnedGiftManagementRequests,
    decideOwnedGiftManagementRequest: mockDecideOwnedGiftManagementRequest,
    startOwnedGiftPublish: mockStartOwnedGiftPublish,
    finishOwnedGiftPublish: mockFinishOwnedGiftPublish,
    updateOwnedGiftMemberRole: mockUpdateOwnedGiftMemberRole,
  })),
}));

import GiftManagementScreen from "../src/app/gifts/[id]";

const owner = { email: "owner@example.com", role: "owner" as const, createdAt: "2026-08-16T00:00:00.000Z" };
const viewer = { email: "viewer@example.com", role: "viewer" as const, createdAt: "2026-08-16T00:00:00.000Z" };
const editor = { email: "editor@example.com", role: "editor" as const, createdAt: "2026-08-16T00:00:00.000Z" };

type Management = {
  gift: { id: string; status: string; claimedAt: string | null; disabledAt: string | null };
  members: { email: string; role: "owner" | "viewer" | "editor"; createdAt: string }[];
  album: { id: string; title: string; travelDate: string | null; sourceMemoryId: string; publishedAt: string; version: number; mediaCount: number } | null;
};

function management(members: Management["members"] = [owner, viewer, editor]): Management {
  return { gift: { id: "gift-1", status: "bound", claimedAt: null, disabledAt: null }, members, album: null };
}

describe("gift owner member management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ id: "gift-1" });
    mockUseAuth.mockReturnValue({ session: { accessToken: "account-token", user: { id: "owner-1", email: owner.email, isAdmin: false } } });
    mockMemories.mockReturnValue([]);
    mockGetOwnedGiftManagement.mockResolvedValue(management());
    mockAddOwnedGiftMember.mockResolvedValue({ members: [owner, editor] });
    mockUpdateOwnedGiftMemberRole.mockResolvedValue({ members: [owner, { ...viewer, role: "editor" }] });
    mockRemoveOwnedGiftMember.mockResolvedValue({ members: [owner] });
    mockListOwnedGiftManagementRequests.mockResolvedValue([]);
    mockDecideOwnedGiftManagementRequest.mockResolvedValue({ status: "approved" });
    mockStartOwnedGiftPublish.mockResolvedValue({ publicationId: "publication-1", uploads: [], coverUpload: null, expiresAt: "2026-08-16T01:00:00.000Z" });
    mockFinishOwnedGiftPublish.mockResolvedValue({ albumId: "album-1" });
  });

  it("publishes an existing local album only for the first shared version", async () => {
    const memory = { id: "memory-1", title: "Trip", city: "London", travelDate: "2026-08-21", photoUris: [], pages: [], createdAt: "2026-08-16T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z" };
    mockMemories.mockReturnValue([memory]);
    render(<GiftManagementScreen />);
    await screen.findByText(owner.email);
    expect(screen.queryByText("新建本地旅行册")).toBeNull();
    fireEvent.press(screen.getByText(memory.title));
    fireEvent.press(screen.getByText("发布共享相册"));

    await waitFor(() => expect(mockStartOwnedGiftPublish).toHaveBeenCalled());
    expect(mockStartOwnedGiftPublish.mock.calls[0][2]).toEqual(expect.objectContaining({
      baseVersion: 0,
      sourceMemoryId: memory.id,
      title: memory.title,
      travelDate: memory.travelDate,
    }));
  });

  it("directs owners without a local album back to the home creation flow", async () => {
    render(<GiftManagementScreen />);
    await screen.findByText(owner.email);
    expect(screen.getByText("请先返回主页创建本地旅行册，再回来完成首次发布。")).toBeTruthy();
    expect(screen.queryByText("新建本地旅行册")).toBeNull();
    expect(screen.getByText("发布共享相册")).toBeDisabled();
  });

  it("blocks a new publication with missing local photos before requests or uploads", async () => {
    const memory = { id: "memory-1", title: "Trip", city: "London", travelDate: "2026-08-16", photoUris: [], pages: [{ id: "page-1", kind: "photo", headline: "", body: "", position: 0, photoUri: "missing-local-photo://gone" }], createdAt: "2026-08-16T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z" };
    mockMemories.mockReturnValue([memory]);
    render(<GiftManagementScreen />);
    await screen.findByText(owner.email);
    fireEvent.press(screen.getByText("Trip"));
    expect(screen.getByLabelText("第 1 页照片，本地照片缺失")).toBeTruthy();
    fireEvent.press(screen.getByText("发布共享相册"));

    await screen.findByText("相册中有缺失的本地照片。请重新选择照片后再继续。");
    expect(mockStartOwnedGiftPublish).not.toHaveBeenCalled();
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  it("blocks a new publication when a top-level local photo is missing", async () => {
    const memory = { id: "memory-1", title: "Trip", city: "London", travelDate: "2026-08-16", photoUris: ["missing-local-photo://photo-list"], pages: [], createdAt: "2026-08-16T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z" };
    mockMemories.mockReturnValue([memory]);
    render(<GiftManagementScreen />);
    await screen.findByText(owner.email);
    fireEvent.press(screen.getByText("Trip"));
    fireEvent.press(screen.getByText("发布共享相册"));

    await screen.findByText("相册中有缺失的本地照片。请重新选择照片后再继续。");
    expect(mockStartOwnedGiftPublish).not.toHaveBeenCalled();
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  it("shows the dated existing shared album without replacement controls", async () => {
    const memory = { id: "memory-1", title: "Different local trip", city: "London", travelDate: "2026-08-16", photoUris: [], pages: [], createdAt: "2026-08-16T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z" };
    mockUseLocalSearchParams.mockReturnValue({ id: "gift-1", memoryId: memory.id });
    mockMemories.mockReturnValue([memory]);
    mockGetOwnedGiftManagement.mockResolvedValue({ ...management(), album: { id: "album-1", title: "Cloud trip", travelDate: "2026-08-21", sourceMemoryId: memory.id, publishedAt: "2026-08-16T00:00:00.000Z", version: 3, mediaCount: 0 } });
    render(<GiftManagementScreen />);
    await screen.findByText("Cloud trip");
    expect(screen.getByText("版本 3")).toBeTruthy();
    expect(screen.getByText("旅行日期 · 2026-08-21")).toBeTruthy();
    expect(screen.queryByText("Different local trip")).toBeNull();
    expect(screen.queryByText("更新共享相册")).toBeNull();
    expect(screen.queryByText("新建本地旅行册")).toBeNull();
    expect(screen.queryByText("选择相册封面")).toBeNull();
    expect(screen.queryByText("发布共享相册")).toBeNull();
    fireEvent.press(screen.getByText("查看当前共享相册"));
    expect(mockRouter.push).toHaveBeenCalledWith("/gifts/shared/gift-1?access=owner");
  });

  it("shows the legacy travel date fallback instead of the publication timestamp", async () => {
    mockGetOwnedGiftManagement.mockResolvedValue({ ...management(), album: { id: "album-1", title: "Legacy cloud trip", travelDate: null, sourceMemoryId: "memory-1", publishedAt: "2026-08-16T00:00:00.000Z", version: 3, mediaCount: 0 } });
    render(<GiftManagementScreen />);

    await screen.findByText("Legacy cloud trip");
    expect(screen.getByText("旅行日期 · 未设置旅行日期")).toBeTruthy();
    expect(screen.queryByText("旅行日期 · 2026-08-16")).toBeNull();
  });

  it("shows pending request details and reloads management after approval", async () => {
    mockListOwnedGiftManagementRequests.mockResolvedValueOnce([
      { id: "pending-1", action: "change_member_role", targetEmail: viewer.email, targetRole: "editor", status: "pending", createdAt: "2026-08-16T01:02:00.000Z", decidedAt: null },
      { id: "done-1", action: "delete_album", targetEmail: null, targetRole: null, status: "rejected", createdAt: "2026-08-16T00:00:00.000Z", decidedAt: "2026-08-16T00:01:00.000Z" },
    ]).mockResolvedValueOnce([]);
    render(<GiftManagementScreen />);
    await screen.findByText("修改成员权限");
    expect(screen.getByLabelText(`批准修改成员权限 ${viewer.email} 读写`)).toBeTruthy();
    expect(screen.getByLabelText(`拒绝修改成员权限 ${viewer.email} 读写`)).toBeTruthy();
    expect(screen.getByText(`目标：${viewer.email}`)).toBeTruthy();
    expect(screen.getByText("新权限：读写")).toBeTruthy();
    expect(screen.queryByText("删除整册")).toBeNull();
    fireEvent.press(screen.getByLabelText(`批准修改成员权限 ${viewer.email} 读写`));
    await waitFor(() => expect(mockDecideOwnedGiftManagementRequest).toHaveBeenCalledWith("account-token", "gift-1", "pending-1", "approved"));
    await waitFor(() => expect(mockGetOwnedGiftManagement).toHaveBeenCalledTimes(2));
    expect(mockListOwnedGiftManagementRequests).toHaveBeenCalledTimes(2);
  });

  it("retries an initial owner management failure and restores requests", async () => {
    mockGetOwnedGiftManagement.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(management());
    mockListOwnedGiftManagementRequests.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "pending-retry", action: "delete_album", targetEmail: null, targetRole: null, status: "pending", createdAt: "2026-08-16T01:02:00.000Z", decidedAt: null }]);
    render(<GiftManagementScreen />);
    await screen.findByText("无法读取礼品管理信息；请确认登录账户和网络后重试。");
    fireEvent.press(screen.getByText("重试"));
    await screen.findByText("删除整册");
    expect(screen.getByText(owner.email)).toBeTruthy();
  });

  it("ignores an older retry that finishes after the newer retry", async () => {
    let resolveOlder!: (value: ReturnType<typeof management>) => void;
    let resolveNewer!: (value: ReturnType<typeof management>) => void;
    const older = new Promise<ReturnType<typeof management>>((resolve) => { resolveOlder = resolve; });
    const newer = new Promise<ReturnType<typeof management>>((resolve) => { resolveNewer = resolve; });
    mockGetOwnedGiftManagement.mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(older).mockReturnValueOnce(newer);
    mockListOwnedGiftManagementRequests.mockResolvedValue([]);
    render(<GiftManagementScreen />);
    await screen.findByText("无法读取礼品管理信息；请确认登录账户和网络后重试。");
    act(() => {
      fireEvent.press(screen.getByText("重试"));
      fireEvent.press(screen.getByText("重试"));
    });
    await act(async () => { resolveNewer({ ...management(), album: { id: "album-new", title: "New album", travelDate: "2026-08-16", sourceMemoryId: "memory-new", publishedAt: "2026-08-16T00:00:00.000Z", version: 2, mediaCount: 0 } }); await Promise.resolve(); });
    await screen.findByText("New album");
    await act(async () => { resolveOlder({ ...management(), album: { id: "album-old", title: "Old album", travelDate: "2026-08-16", sourceMemoryId: "memory-old", publishedAt: "2026-08-16T00:00:00.000Z", version: 1, mediaCount: 0 } }); await Promise.resolve(); });
    expect(screen.queryByText("Old album")).toBeNull();
    expect(screen.getByText("New album")).toBeTruthy();
  });

  it("sends the rejection decision for a pending request", async () => {
    mockListOwnedGiftManagementRequests.mockResolvedValueOnce([{ id: "pending-2", action: "remove_member", targetEmail: viewer.email, targetRole: null, status: "pending", createdAt: "2026-08-16T01:02:00.000Z", decidedAt: null }]).mockResolvedValueOnce([]);
    render(<GiftManagementScreen />);
    await screen.findByLabelText(`拒绝移除成员 ${viewer.email}`);
    fireEvent.press(screen.getByLabelText(`拒绝移除成员 ${viewer.email}`));
    await waitFor(() => expect(mockDecideOwnedGiftManagementRequest).toHaveBeenCalledWith("account-token", "gift-1", "pending-2", "rejected"));
  });

  it("labels every role accurately and never renders an owner role control", async () => {
    render(<GiftManagementScreen />);

    await screen.findByText(owner.email);
    expect(screen.getByText("拥有者")).toBeTruthy();
    expect(screen.getByText("只读成员")).toBeTruthy();
    expect(screen.getByText("读写成员")).toBeTruthy();
    expect(screen.queryByLabelText(`更改 ${owner.email} 的权限`)).toBeNull();
    expect(screen.getByLabelText(`更改 ${viewer.email} 的权限`)).toBeTruthy();
    expect(screen.getByLabelText(`更改 ${editor.email} 的权限`)).toBeTruthy();
    expect(screen.getByText("只读和读写成员都需要先用 NFC 礼品完成首次激活。")).toBeTruthy();
  });

  it("invites with the explicitly selected viewer or editor role", async () => {
    mockGetOwnedGiftManagement.mockResolvedValue(management([owner]));
    render(<GiftManagementScreen />);
    await screen.findByText(owner.email);

    fireEvent.changeText(screen.getByLabelText("邀请邮箱"), "new@example.com");
    fireEvent.press(screen.getByLabelText("邀请权限：读写"));
    fireEvent.press(screen.getByText("添加成员"));

    await waitFor(() => expect(mockAddOwnedGiftMember).toHaveBeenCalledWith("account-token", "gift-1", "new@example.com", "editor"));
  });

  it("lets the owner switch a non-owner role only once while busy", async () => {
    let resolveUpdate!: (value: { members: typeof owner[] }) => void;
    mockGetOwnedGiftManagement.mockResolvedValue(management([owner, viewer]));
    mockUpdateOwnedGiftMemberRole.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    render(<GiftManagementScreen />);
    await screen.findByText(viewer.email);

    const control = screen.getByLabelText(`更改 ${viewer.email} 的权限`);
    fireEvent.press(control);
    fireEvent.press(control);
    expect(mockUpdateOwnedGiftMemberRole).toHaveBeenCalledTimes(1);
    expect(mockUpdateOwnedGiftMemberRole).toHaveBeenCalledWith("account-token", "gift-1", viewer.email, "editor");

    await act(async () => { resolveUpdate({ members: [owner] }); });
  });

  it("reports a role update failure", async () => {
    mockGetOwnedGiftManagement.mockResolvedValue(management([owner, viewer]));
    mockUpdateOwnedGiftMemberRole.mockRejectedValue(new Error("权限更新失败"));
    render(<GiftManagementScreen />);
    await screen.findByText(viewer.email);

    fireEvent.press(screen.getByLabelText(`更改 ${viewer.email} 的权限`));
    await screen.findByText("无法更新成员权限，请刷新后重试。");
    expect(screen.queryByText("权限更新失败")).toBeNull();
  });

  it("does not render owner controls while authorization is loading", () => {
    mockGetOwnedGiftManagement.mockReturnValue(new Promise(() => undefined));
    render(<GiftManagementScreen />);

    expect(screen.queryByText("发布共享相册")).toBeNull();
    expect(screen.queryByText("添加成员")).toBeNull();
    expect(screen.queryByText("永久停用礼品")).toBeNull();
  });

  it("shows only an error and return entry when an editor cannot load owner management", async () => {
    mockUseAuth.mockReturnValue({ session: { accessToken: "editor-token", user: { id: "editor-1", email: editor.email, isAdmin: false } } });
    mockGetOwnedGiftManagement.mockRejectedValue(new Error("forbidden"));
    render(<GiftManagementScreen />);

    await screen.findByText("无法读取礼品管理信息；请确认登录账户和网络后重试。");
    expect(screen.getByText("返回我的礼品")).toBeTruthy();
    expect(screen.queryByText("发布共享相册")).toBeNull();
    expect(screen.queryByText("添加成员")).toBeNull();
    expect(screen.queryByText("改为只读")).toBeNull();
    expect(screen.queryByText("改为读写")).toBeNull();
    expect(screen.queryByText("移除")).toBeNull();
    expect(screen.queryByText("永久停用礼品")).toBeNull();
  });

  it("does not authorize when a successful response lacks the current owner", async () => {
    mockGetOwnedGiftManagement.mockResolvedValue(management([owner, editor]));
    mockUseAuth.mockReturnValue({ session: { accessToken: "other-token", user: { id: "other-1", email: "other@example.com", isAdmin: false } } });
    render(<GiftManagementScreen />);

    await screen.findByText("返回我的礼品");
    expect(screen.queryByText("永久停用礼品")).toBeNull();
  });

  it("prevents duplicate member removal while the first operation is pending", async () => {
    let resolveRemove!: (value: { members: typeof owner[] }) => void;
    mockGetOwnedGiftManagement.mockResolvedValue(management([owner, viewer]));
    mockRemoveOwnedGiftMember.mockReturnValue(new Promise((resolve) => { resolveRemove = resolve; }));
    render(<GiftManagementScreen />);
    await screen.findByText(viewer.email);

    const removeButton = screen.getByText("移除");
    fireEvent.press(removeButton);
    fireEvent.press(removeButton);
    expect(mockRemoveOwnedGiftMember).toHaveBeenCalledTimes(1);

    await act(async () => { resolveRemove({ members: [owner] }); });
  });

  it("does not let an old member operation update the new gift context", async () => {
    let resolveUpdate!: (value: { members: typeof owner[] }) => void;
    mockGetOwnedGiftManagement.mockResolvedValueOnce(management([owner, viewer])).mockReturnValueOnce(new Promise(() => undefined));
    mockUpdateOwnedGiftMemberRole.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    const view = render(<GiftManagementScreen />);
    await screen.findByText(viewer.email);
    fireEvent.press(screen.getByLabelText(`更改 ${viewer.email} 的权限`));

    mockUseLocalSearchParams.mockReturnValue({ id: "gift-2" });
    view.rerender(<GiftManagementScreen />);
    await act(async () => { resolveUpdate({ members: [owner] }); });

    expect(screen.queryByText(`已将 ${viewer.email} 调整为读写成员。`)).toBeNull();
    expect(screen.queryByText("永久停用礼品")).toBeNull();
  });

  it("immediately hides authorized controls when the gift and session context changes", async () => {
    const secondRequest = new Promise(() => undefined);
    mockGetOwnedGiftManagement.mockResolvedValueOnce(management()).mockReturnValueOnce(secondRequest);
    const view = render(<GiftManagementScreen />);
    await screen.findByText("永久停用礼品");

    mockUseLocalSearchParams.mockReturnValue({ id: "gift-2" });
    mockUseAuth.mockReturnValue({ session: { accessToken: "other-token", user: { id: "owner-2", email: "other-owner@example.com", isAdmin: false } } });
    view.rerender(<GiftManagementScreen />);

    expect(screen.queryByText("发布共享相册")).toBeNull();
    expect(screen.queryByText("添加成员")).toBeNull();
    expect(screen.queryByText("永久停用礼品")).toBeNull();
  });

  it("ignores an old owner response that resolves after the new context fails", async () => {
    let resolveOld!: (value: ReturnType<typeof management>) => void;
    mockGetOwnedGiftManagement
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockRejectedValueOnce(new Error("forbidden"));
    const view = render(<GiftManagementScreen />);
    await waitFor(() => expect(mockGetOwnedGiftManagement).toHaveBeenCalledWith("account-token", "gift-1"));

    mockUseLocalSearchParams.mockReturnValue({ id: "gift-2" });
    mockUseAuth.mockReturnValue({ session: { accessToken: "editor-token", user: { id: "editor-1", email: editor.email, isAdmin: false } } });
    view.rerender(<GiftManagementScreen />);
    await screen.findByText("返回我的礼品");

    await act(async () => { resolveOld(management()); });
    expect(screen.queryByText("永久停用礼品")).toBeNull();
    expect(screen.getByText("返回我的礼品")).toBeTruthy();
  });
});
