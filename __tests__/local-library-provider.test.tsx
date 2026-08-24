import { act, render, waitFor } from "@testing-library/react-native";

const mockDatabase = { name: "local" };
const mockUseAuth = jest.fn();
const mockHasGuestLibrary = jest.fn();
const mockGetSelection = jest.fn();
const mockChooseGuest = jest.fn();
const mockChooseAccount = jest.fn();
const mockMigrateGuest = jest.fn();
let mockAuthGeneration = 0;

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/guest-library-migration", () => ({
  chooseAccountLibrary: (...args: unknown[]) => mockChooseAccount(...args),
  chooseGuestLibrary: (...args: unknown[]) => mockChooseGuest(...args),
  getLocalLibrarySelection: (...args: unknown[]) => mockGetSelection(...args),
  hasGuestLibrary: (...args: unknown[]) => mockHasGuestLibrary(...args),
  migrateGuestLibraryToAccount: (...args: unknown[]) => mockMigrateGuest(...args),
}));

import { LocalLibraryProvider, useLocalLibrary } from "../src/features/auth/local-library-provider";

let library: ReturnType<typeof useLocalLibrary> | undefined;
function Capture() { library = useLocalLibrary(); return null; }

describe("LocalLibraryProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    library = undefined;
    mockChooseGuest.mockResolvedValue(undefined);
    mockChooseAccount.mockResolvedValue(undefined);
    mockMigrateGuest.mockResolvedValue(undefined);
    mockGetSelection.mockResolvedValue(null);
    mockHasGuestLibrary.mockResolvedValue(false);
    mockAuthGeneration = 0;
  });

  it("uses guest while signed out and account owner when login has no guest data", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    const screen = render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library).toMatchObject({ isReady: true, owner: "guest", needsMigrationChoice: false }));

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: " Owner@Example.COM " } });
    screen.rerender(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library).toMatchObject({ isReady: true, owner: "account:owner@example.com", needsMigrationChoice: false }));
  });

  it("keeps guest selected until the first logged-in user explicitly chooses", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockHasGuestLibrary.mockResolvedValue(true);
    render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library).toMatchObject({ isReady: false, owner: "guest", needsMigrationChoice: true }));
    expect(mockMigrateGuest).not.toHaveBeenCalled();

    const blockedWrite = jest.fn(async () => undefined);
    await expect(library!.runWrite(blockedWrite)).rejects.toThrow("本机旅行册仍在准备中");
    expect(blockedWrite).not.toHaveBeenCalled();

    await act(async () => { await library!.continueWithGuest(); });
    expect(mockChooseGuest).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com");
    expect(library).toMatchObject({ owner: "guest", needsMigrationChoice: false });
  });

  it("switches to the account only after an explicit atomic guest migration", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockHasGuestLibrary.mockResolvedValue(true);
    render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library?.needsMigrationChoice).toBe(true));

    await act(async () => { await library!.migrateToAccount(); });
    expect(mockMigrateGuest).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com");
    expect(library).toMatchObject({ owner: "account:owner@example.com", needsMigrationChoice: false });
  });

  it("allows a persisted guest selection to switch to the account library later", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockGetSelection.mockResolvedValue("guest");
    mockHasGuestLibrary.mockResolvedValue(true);
    render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library).toMatchObject({ isReady: true, owner: "guest", needsMigrationChoice: false }));

    await act(async () => { await library!.switchToAccount(); });

    expect(mockChooseAccount).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com");
    expect(library).toMatchObject({ isReady: true, owner: "account:owner@example.com" });
  });

  it("allows migration after the user previously chose to keep using guest", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "owner@example.com" } });
    mockHasGuestLibrary.mockResolvedValue(true);
    render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library?.needsMigrationChoice).toBe(true));

    await act(async () => { await library!.continueWithGuest(); });
    await act(async () => { await library!.migrateToAccount(); });

    expect(mockMigrateGuest).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com");
    expect(library).toMatchObject({ isReady: true, owner: "account:owner@example.com" });
  });

  it("ignores delayed selection loads after a rapid account switch", async () => {
    let resolveA: ((selection: "guest") => void) | undefined;
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "a@example.com" } });
    mockGetSelection.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce("account");
    const screen = render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { email: "b@example.com" } });
    screen.rerender(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library?.owner).toBe("account:b@example.com"));

    await act(async () => { resolveA?.("guest"); });
    expect(library?.owner).toBe("account:b@example.com");
  });

  it("rejects an account A write callback as soon as authentication starts switching to B", async () => {
    mockUseAuth.mockReturnValue({
      getSessionGeneration: () => mockAuthGeneration,
      isAuthReady: true,
      user: { email: "a@example.com" },
    });
    const operation = jest.fn(async () => "written");
    const screen = render(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);
    await waitFor(() => expect(library).toMatchObject({ isReady: true, owner: "account:a@example.com" }));
    const staleWrite = library!.runWrite;

    mockAuthGeneration += 1;
    mockUseAuth.mockReturnValue({
      getSessionGeneration: () => mockAuthGeneration,
      isAuthReady: true,
      user: { email: "b@example.com" },
    });
    screen.rerender(<LocalLibraryProvider><Capture /></LocalLibraryProvider>);

    expect(library).toMatchObject({ isReady: false, owner: "guest" });
    await waitFor(() => expect(library).toMatchObject({ isReady: true, owner: "account:b@example.com" }));
    await expect(staleWrite(operation)).rejects.toThrow("本机旅行册已经切换");
    expect(operation).not.toHaveBeenCalled();
  });
});
