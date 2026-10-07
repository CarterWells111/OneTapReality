/// <reference types="node" />

import { act, render, waitFor } from "@testing-library/react-native";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";

import { LocalLibraryProvider } from "../src/features/auth/local-library-provider";
import { MemoriesProvider, useMemories } from "../src/features/memories/memories-provider";
import { hydrateMemoryPhotoReferences, persistPhotoUri } from "../src/features/memories/photo-persistence";
import { saveMemoryEditDraft as saveEditDraftInDb } from "../src/storage/memory-edit-draft-repository";
import { createDraft, getDraft, getMemory, migrateDbIfNeeded, saveMemory } from "../src/storage/memory-repository";
import type { Memory, MemoryDraftInput, StoryPage } from "../src/types/memory";

const documents = "file:///current/Documents/";
const pickerPhoto = "file:///tmp/ImagePicker/photo.jpg";
const pickerCover = "file:///tmp/ImagePicker/cover.jpg";
const owner = "account:owner@example.test" as const;
let mockDb: SQLiteDatabase;
let mockNative: DatabaseSync;
let mockAuth: { isAuthReady: boolean; user: { id: string; email: string } | null; sessionGeneration: number };
const mockSessionGeneration = () => mockAuth.sessionGeneration;
const mockFiles = new Set<string>();
const mockDirectories = new Set<string>();
const mockLookupCounts = new Map<string, number>();
let mockFailCopyFrom: string | undefined;
let mockInvisibleCopies: boolean;
let mockVanishBeforeHydration: boolean;
let mockFailPageInsert: boolean;
let mockFinishCopy: (() => void) | undefined;
let mockCopyDelay: Promise<void> | undefined;
const mockRunAsync = jest.fn();

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...mockAuth, getSessionGeneration: mockSessionGeneration }),
}));
jest.mock("../src/features/auth/guest-library-migration", () => ({
  getLocalLibrarySelection: jest.fn(async () => "account"),
  hasGuestLibrary: jest.fn(async () => false),
}));
jest.mock("expo-media-library/legacy", () => ({ getAssetInfoAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///current/Documents/",
  cacheDirectory: "file:///cache/",
  makeDirectoryAsync: jest.fn(async (uri: string) => { mockDirectories.add(uri); }),
  getInfoAsync: jest.fn(async (uri: string) => {
    const count = (mockLookupCounts.get(uri) ?? 0) + 1;
    mockLookupCounts.set(uri, count);
    const vanished = mockVanishBeforeHydration && uri.startsWith("file:///current/Documents/") && count >= 3;
    return { exists: !vanished && (mockFiles.has(uri) || mockDirectories.has(uri)), isDirectory: mockDirectories.has(uri) };
  }),
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    if (mockCopyDelay) await mockCopyDelay;
    if (from === mockFailCopyFrom || !mockFiles.has(from)) throw new Error("copy unavailable");
    if (!mockInvisibleCopies) mockFiles.add(to);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
    if (mockDirectories.has(uri)) {
      mockDirectories.delete(uri);
      for (const file of mockFiles) if (file.startsWith(uri)) mockFiles.delete(file);
    }
  }),
}));

let captured: ReturnType<typeof useMemories>;
function Capture() { captured = useMemories(); return null; }
function Providers() {
  return <LocalLibraryProvider><MemoriesProvider><Capture /></MemoriesProvider></LocalLibraryProvider>;
}
async function mount() {
  const screen = render(<Providers />);
  await waitFor(() => expect(captured.isReady).toBe(true));
  return screen;
}
function input(overrides: Partial<MemoryDraftInput> = {}): MemoryDraftInput {
  return { title: "Trip", city: "hangzhou", travelDate: "2026-10-01", photoUris: [pickerPhoto], ...overrides };
}
function album(overrides: Partial<Memory> = {}): Memory {
  return {
    ...input(), id: "album-1", status: "draft", pages: [],
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...overrides,
  };
}
function coverPage(coverImage: string): StoryPage {
  return { id: "album-1:cover", position: 0, kind: "cover", headline: "Cover", body: "", coverImage };
}
function canonical(file: string, account = "owner%40example.test", id = "album-1") {
  return `documents://photos/accounts/${account}/${id}/${file}`;
}
function runtime(file: string, account = "owner%40example.test", id = "album-1") {
  return `${documents}photos/accounts/${account}/${id}/${file}`;
}
function countAlbums() {
  return (mockNative.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count;
}

describe("P1 photo persistence on latest main with real providers and SQLite", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockDirectories.clear();
    mockLookupCounts.clear();
    mockFiles.add(pickerPhoto);
    mockFiles.add(pickerCover);
    mockFailCopyFrom = undefined;
    mockInvisibleCopies = false;
    mockVanishBeforeHydration = false;
    mockFailPageInsert = false;
    mockFinishCopy = undefined;
    mockCopyDelay = undefined;
    mockAuth = { isAuthReady: true, user: { id: "synthetic-user", email: " Owner@Example.TEST " }, sessionGeneration: 0 };
    mockNative = new DatabaseSync(":memory:");
    mockRunAsync.mockImplementation(async (sql: string, ...parameters: SQLInputValue[]) => {
      if (mockFailPageInsert && sql.startsWith("INSERT INTO story_pages")) throw new Error("injected page insert failure");
      return mockNative.prepare(sql).run(...parameters);
    });
    mockDb = {
      execAsync: async (sql: string) => { mockNative.exec(sql); },
      getAllAsync: async (sql: string, ...parameters: SQLInputValue[]) => mockNative.prepare(sql).all(...parameters),
      getFirstAsync: async (sql: string, ...parameters: SQLInputValue[]) => mockNative.prepare(sql).get(...parameters) ?? null,
      runAsync: mockRunAsync,
      withTransactionAsync: async (operation: () => Promise<void>) => {
        mockNative.exec("BEGIN");
        try { await operation(); mockNative.exec("COMMIT"); }
        catch (error) { mockNative.exec("ROLLBACK"); throw error; }
      },
    } as unknown as SQLiteDatabase;
    await migrateDbIfNeeded(mockDb);
    mockRunAsync.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => { mockNative.close(); jest.restoreAllMocks(); });

  it("retains main's strict persistPhotoUri export", async () => {
    mockFailCopyFrom = pickerPhoto;
    await expect(persistPhotoUri(pickerPhoto, owner, "album-1")).rejects.toThrow("copy unavailable");
  });

  it.each(["createDraft", "createMemory"] as const)("%s rejects a picker copy failure without inserting an album", async (operation) => {
    await mount();
    mockFailCopyFrom = pickerPhoto;
    await act(async () => { await expect(captured[operation](input())).rejects.toThrow(); });
    expect(countAlbums()).toBe(0);
    expect(captured.memories).toEqual([]);
    expect(captured.drafts).toEqual([]);
  });

  it("rolls back already staged photos when a later cover copy fails", async () => {
    await mount();
    mockFailCopyFrom = pickerCover;
    await act(async () => { await expect(captured.createDraft(input({ coverImage: pickerCover }))).rejects.toMatchObject({ stage: "photo-import", isCover: true }); });
    expect(countAlbums()).toBe(0);
    expect([...mockFiles].filter((uri) => uri.startsWith(documents))).toEqual([]);
  });

  it("rejects a copy whose destination verification fails", async () => {
    await mount();
    mockInvisibleCopies = true;
    await act(async () => { await expect(captured.createDraft(input())).rejects.toMatchObject({ stage: "photo-import" }); });
    expect(countAlbums()).toBe(0);
  });

  it("retains #101's photo-reference error and rollback if the copied destination disappears", async () => {
    await mount();
    mockVanishBeforeHydration = true;
    await act(async () => { await expect(captured.createDraft(input())).rejects.toMatchObject({ stage: "photo-reference" }); });
    expect(countAlbums()).toBe(0);
    expect([...mockFiles].filter((uri) => uri.startsWith(documents))).toEqual([]);
  });

  it("rolls back both SQLite inserts and staged photos on a page insertion error", async () => {
    await mount();
    mockFailPageInsert = true;
    await act(async () => { await expect(captured.createDraft(input())).rejects.toMatchObject({ stage: "storage" }); });
    expect(countAlbums()).toBe(0);
    expect([...mockFiles].filter((uri) => uri.startsWith(documents))).toEqual([]);
  });

  it.each(["guest", owner] as const)("supports %s creation and stores canonical references", async (libraryOwner) => {
    if (libraryOwner === "guest") mockAuth.user = null;
    await mount();
    let created: Memory | undefined;
    await act(async () => { created = await captured.createDraft(input()); });
    const stored = await getDraft(mockDb, created!.id, libraryOwner);
    const segment = libraryOwner === "guest" ? "guest" : "owner%40example.test";
    expect(stored!.photoUris[0]).toMatch(new RegExp(`^documents://photos/accounts/${segment}/${created!.id}/`));
    expect(created!.photoUris[0]).toContain(`${documents}photos/accounts/${segment}/${created!.id}/`);
    expect(countAlbums()).toBe(1);
  });

  it("rejects an old in-flight creation after account switching and rolls back its photos", async () => {
    const screen = await mount();
    mockCopyDelay = new Promise<void>((resolve) => { mockFinishCopy = resolve; });
    const pending = captured.createDraft(input());
    const rejection = expect(pending).rejects.toThrow("已经切换");
    await waitFor(() => expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1));
    mockAuth = { isAuthReady: true, user: { id: "next-synthetic-user", email: "next@example.test" }, sessionGeneration: 1 };
    screen.rerender(<Providers />);
    await waitFor(() => expect(captured.isReady).toBe(true));
    await act(async () => { mockFinishCopy!(); await rejection; });
    expect(countAlbums()).toBe(0);
    expect([...mockFiles].filter((uri) => uri.startsWith(documents))).toEqual([]);
  });

  it("keeps all newly created cover references canonical in the initial SQLite write", async () => {
    await mount();
    await act(async () => { await captured.createMemory(input({ coverImage: pickerCover })); });
    const coverInsert = mockRunAsync.mock.calls.find(([sql, , , , kind]) => sql.startsWith("INSERT INTO story_pages") && kind === "cover");
    expect(coverInsert).toBeDefined();
    const layout = JSON.parse(coverInsert![8] as string);
    expect(layout.coverImage).toMatch(/^documents:\/\/photos\/accounts\/owner%40example.test\//);
    expect(layout.coverImage).not.toBe(pickerCover);
  });

  it("hydrates page-only covers into canonical storage and current runtime paths", async () => {
    const hydrated = await hydrateMemoryPhotoReferences(album({ photoUris: [], pages: [coverPage(pickerCover)] }), owner);
    expect(hydrated.storageMemory.pages[0].coverImage).toMatch(/^documents:\/\/photos\/accounts\/owner%40example.test\/album-1\//);
    expect(hydrated.runtimeMemory.pages[0].coverImage).toMatch(/^file:\/\/\/current\/Documents\/photos\/accounts\/owner%40example.test\/album-1\//);
    expect(hydrated.changed).toBe(true);
  });

  it("does not write a page-only cover whose new copy fails", async () => {
    const draft = album({ photoUris: [], pages: [coverPage("")] });
    await createDraft(mockDb, draft, owner);
    await mount();
    mockFailCopyFrom = pickerCover;
    await act(async () => { await expect(captured.updateDraftPages(draft, [coverPage(pickerCover)])).rejects.toThrow("copy unavailable"); });
    expect((await getDraft(mockDb, draft.id, owner))!.pages[0].layout!.coverImage).toBeUndefined();
  });

  it("keeps an unreadable page-only cover as a runtime token and retains its storage reference", async () => {
    const storedCover = canonical("gone.jpg");
    const hydrated = await hydrateMemoryPhotoReferences(album({ photoUris: [], pages: [coverPage(storedCover)] }), owner);
    expect(hydrated.runtimeMemory.pages[0].coverImage).toMatch(/^missing-local-photo:\/\//);
    expect(hydrated.storageMemory.pages[0].coverImage).toBe(storedCover);
    expect(hydrated.unresolved).toEqual([expect.objectContaining({ storedReference: storedCover })]);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("allows formal save of an old draft with an unavailable stored photo without losing its reference", async () => {
    const storedPhoto = canonical("gone.jpg");
    await createDraft(mockDb, album({ photoUris: [storedPhoto] }), owner);
    await mount();
    expect(captured.drafts[0].photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    await act(async () => { await expect(captured.saveDraft("album-1")).resolves.toBeUndefined(); });
    expect((await getMemory(mockDb, "album-1", owner))!.photoUris).toEqual([storedPhoto]);
    expect(captured.memories[0].photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("lets a known missing photo survive a legitimate text edit without attempting to copy the storage token", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    await act(async () => { await expect(captured.updatePages(current, [{ ...current.pages[0], headline: "After" }])).resolves.toBeUndefined(); });
    const stored = (await getMemory(mockDb, "album-1", owner))!;
    expect(stored.photoUris).toEqual([storedPhoto]);
    expect(stored.pages[0]).toMatchObject({ headline: "After", photoUri: storedPhoto });
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized missing token without replacing the saved album", async () => {
    await saveMemory(mockDb, album({ status: "saved", photoUris: [], pages: [coverPage("")] }), owner);
    await mount();
    const current = captured.memories[0];
    await expect(captured.updatePages(current, [{ ...current.pages[0], photoUri: "missing-local-photo://unrecognized" }])).rejects.toThrow("Unknown missing");
    expect((await getMemory(mockDb, "album-1", owner))!.pages[0].photoUri).toBeUndefined();
  });

  it("preserves known missing photos while still rejecting a newly added photo's copy failure", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    mockFailCopyFrom = pickerCover;
    const modified: StoryPage = {
      ...current.pages[0],
      layout: { aspectRatio: 0.75, elements: [{ id: "new-photo", type: "image", uri: pickerCover, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 }] },
    };
    await act(async () => { await expect(captured.updatePages(current, [modified])).rejects.toThrow("copy unavailable"); });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({ from: pickerCover }));
    expect((await getMemory(mockDb, "album-1", owner))!.photoUris).toEqual([storedPhoto]);
    expect((await getMemory(mockDb, "album-1", owner))!.pages[0].layout!.elements.some((element) => element.id === "new-photo")).toBe(false);
  });

  it("retains known missing references when saving an edit recovery draft", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, [{ ...current.pages[0], headline: "Recovered" }])).resolves.toBeUndefined(); });
    const row = mockNative.prepare("SELECT pages_json FROM memory_edit_drafts WHERE memory_id = ? AND owner_account_key = ?").get("album-1", owner) as { pages_json: string };
    expect(row.pages_json).toContain(storedPhoto);
    expect(row.pages_json).not.toContain("missing-local-photo://");
    expect((await getMemory(mockDb, "album-1", owner))!.pages[0].headline).toBe("Before");
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("keeps editor missing tokens through consecutive recovery saves and formal save", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    const firstPages = [{ ...current.pages[0], headline: "First edit" }];
    const finalPages = [{ ...current.pages[0], headline: "Final edit" }];
    await act(async () => { await captured.saveMemoryEditDraft(current, firstPages); });
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, finalPages)).resolves.toBeUndefined(); });
    await act(async () => { await expect(captured.updatePages(current, finalPages)).resolves.toBeUndefined(); });
    const stored = (await getMemory(mockDb, current.id, owner))!;
    expect(stored.photoUris).toEqual([storedPhoto]);
    expect(stored.pages[0]).toMatchObject({ headline: "Final edit", photoUri: storedPhoto });
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it.each(["getMemoryEditDraft", "getMemoryEditRecovery"] as const)("keeps album tokens valid after %s returns recovery page tokens", async (reader) => {
    const storedPhoto = canonical("gone.jpg");
    const storedRecoveryPhoto = canonical("recovery-gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    const saved = album({ status: "saved", photoUris: [storedPhoto], pages: [page] });
    await saveMemory(mockDb, saved, owner);
    await saveEditDraftInDb(mockDb, saved, [{ ...page, headline: "Recovered", photoUri: storedRecoveryPhoto }], owner);
    await mount();
    const current = captured.memories[0];
    let recoveredPages: StoryPage[] | undefined;
    await act(async () => {
      if (reader === "getMemoryEditDraft") recoveredPages = (await captured.getMemoryEditDraft(current))!;
      else recoveredPages = (await captured.getMemoryEditRecovery(current))!.pages;
    });
    expect(recoveredPages![0].photoUri).toMatch(/^missing-local-photo:\/\//);
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, recoveredPages!)).resolves.toBeUndefined(); });
    await act(async () => { await expect(captured.updatePages(current, recoveredPages!)).resolves.toBeUndefined(); });
    const stored = (await getMemory(mockDb, current.id, owner))!;
    expect(stored.photoUris).toEqual([storedPhoto]);
    expect(stored.pages[0]).toMatchObject({ headline: "Recovered", photoUri: storedRecoveryPhoto });
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("keeps published album and recovery tokens stable across unrelated list refreshes", async () => {
    const storedPhoto = canonical("gone.jpg");
    const storedRecoveryPhoto = canonical("recovery-gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    const saved = album({ status: "saved", photoUris: [storedPhoto], pages: [page] });
    await saveMemory(mockDb, saved, owner);
    await saveEditDraftInDb(mockDb, saved, [{ ...page, photoUri: storedRecoveryPhoto }], owner);
    await mount();
    const current = captured.memories[0];
    let recovered: StoryPage[] | undefined;
    await act(async () => { recovered = (await captured.getMemoryEditRecovery(current))!.pages; });
    for (let index = 0; index < 3; index += 1) {
      await act(async () => { await captured.createDraft(input()); });
      expect(captured.memories[0].photoUris).toEqual(current.photoUris);
      let refreshedRecovery: StoryPage[] | undefined;
      await act(async () => { refreshedRecovery = (await captured.getMemoryEditRecovery(captured.memories[0]))!.pages; });
      expect(refreshedRecovery).toEqual(recovered);
    }
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, recovered!)).resolves.toBeUndefined(); });
    await act(async () => { await expect(captured.updatePages(current, recovered!)).resolves.toBeUndefined(); });
    expect((await getMemory(mockDb, current.id, owner))!.pages[0].photoUri).toBe(storedRecoveryPhoto);
  });

  it("rejects a missing token issued for another album", async () => {
    for (const id of ["album-1", "album-2"]) {
      const photo = canonical("gone.jpg", "owner%40example.test", id);
      const page: StoryPage = { id: `${id}:photo`, position: 0, kind: "photo", headline: "Before", body: "", photoUri: photo };
      await saveMemory(mockDb, album({ id, status: "saved", photoUris: [photo], pages: [page] }), owner);
    }
    await mount();
    const first = captured.memories.find((memory) => memory.id === "album-1")!;
    const second = captured.memories.find((memory) => memory.id === "album-2")!;
    await expect(captured.saveMemoryEditDraft(second, [{ ...second.pages[0], photoUri: first.pages[0].photoUri }])).rejects.toThrow("Unknown missing");
    expect((await getMemory(mockDb, second.id, owner))!.pages[0].photoUri).toBe(canonical("gone.jpg", "owner%40example.test", second.id));
  });

  it("rejects an earlier account's missing token after switching libraries", async () => {
    const nextOwner = "account:next@example.test" as const;
    for (const [libraryOwner, id, account] of [[owner, "album-1", "owner%40example.test"], [nextOwner, "album-2", "next%40example.test"]] as const) {
      const photo = canonical("gone.jpg", account, id);
      const page: StoryPage = { id: `${id}:photo`, position: 0, kind: "photo", headline: "Before", body: "", photoUri: photo };
      await saveMemory(mockDb, album({ id, status: "saved", photoUris: [photo], pages: [page] }), libraryOwner);
    }
    const screen = await mount();
    const oldToken = captured.memories[0].pages[0].photoUri;
    mockAuth = { isAuthReady: true, user: { id: "next-synthetic-user", email: "next@example.test" }, sessionGeneration: 1 };
    screen.rerender(<Providers />);
    await waitFor(() => expect(captured.isReady).toBe(true));
    const current = captured.memories[0];
    await expect(captured.saveMemoryEditDraft(current, [{ ...current.pages[0], photoUri: oldToken }])).rejects.toThrow("Unknown missing");
    expect((await getMemory(mockDb, current.id, nextOwner))!.pages[0].photoUri).toBe(canonical("gone.jpg", "next%40example.test", current.id));
  });

  it.each(["same album reference", "recovery-only reference"] as const)("keeps a formally saved recovery token usable after clearing recovery: %s", async (referenceKind) => {
    const storedPhoto = canonical("gone.jpg");
    const recoveryPhoto = referenceKind === "same album reference" ? storedPhoto : canonical("recovery-gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    const saved = album({ status: "saved", photoUris: [storedPhoto], pages: [page] });
    await saveMemory(mockDb, saved, owner);
    await saveEditDraftInDb(mockDb, saved, [{ ...page, photoUri: recoveryPhoto }], owner);
    await mount();
    const current = captured.memories[0];
    let recoveredPages: StoryPage[] | undefined;
    await act(async () => { recoveredPages = (await captured.getMemoryEditRecovery(current))!.pages; });
    await act(async () => { await captured.saveMemoryEditDraft(current, recoveredPages!); });
    await act(async () => { await captured.updatePages(current, recoveredPages!); });
    await act(async () => { await captured.clearMemoryEditDraft(current.id); });
    const refreshed = captured.memories[0];
    const continuedPages = [{ ...recoveredPages![0], headline: "Continued edit" }];
    await act(async () => { await expect(captured.saveMemoryEditDraft(refreshed, continuedPages)).resolves.toBeUndefined(); });
    await act(async () => { await expect(captured.updatePages(refreshed, continuedPages)).resolves.toBeUndefined(); });
    expect((await getMemory(mockDb, current.id, owner))!.pages[0]).toMatchObject({ headline: "Continued edit", photoUri: recoveryPhoto });
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("retires recovery-only missing tokens when the recovery draft is cleared", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    const saved = album({ status: "saved", photoUris: [storedPhoto], pages: [page] });
    await saveMemory(mockDb, saved, owner);
    await saveEditDraftInDb(mockDb, saved, [{ ...page, photoUri: canonical("recovery-gone.jpg") }], owner);
    await mount();
    const current = captured.memories[0];
    let recoveryToken: string | undefined;
    await act(async () => { recoveryToken = (await captured.getMemoryEditRecovery(current))!.pages[0].photoUri; });
    await act(async () => { await captured.clearMemoryEditDraft(current.id); });
    await expect(captured.saveMemoryEditDraft(current, [{ ...current.pages[0], photoUri: recoveryToken }])).rejects.toThrow("Unknown missing");
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, current.pages)).resolves.toBeUndefined(); });
  });

  it("leaves editor tokens usable after a formal snapshot transaction rolls back", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    mockFailPageInsert = true;
    await act(async () => { await expect(captured.updatePages(current, [{ ...current.pages[0], photoUri: undefined }])).rejects.toThrow("injected page insert failure"); });
    mockFailPageInsert = false;
    expect((await getMemory(mockDb, current.id, owner))!.pages[0].photoUri).toBe(storedPhoto);
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, [{ ...current.pages[0], headline: "Retry" }])).resolves.toBeUndefined(); });
    await act(async () => { await expect(captured.updatePages(current, [{ ...current.pages[0], headline: "Retry" }])).resolves.toBeUndefined(); });
    expect((await getMemory(mockDb, current.id, owner))!.pages[0]).toMatchObject({ headline: "Retry", photoUri: storedPhoto });
  });

  it("retires replaced recovery tokens instead of accumulating earlier snapshots", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    const saved = album({ status: "saved", photoUris: [storedPhoto], pages: [page] });
    await saveMemory(mockDb, saved, owner);
    await saveEditDraftInDb(mockDb, saved, [{ ...page, photoUri: canonical("earlier-recovery.jpg") }], owner);
    await mount();
    const current = captured.memories[0];
    let earlierPages: StoryPage[] | undefined;
    await act(async () => { earlierPages = (await captured.getMemoryEditRecovery(current))!.pages; });
    await saveEditDraftInDb(mockDb, saved, [{ ...page, photoUri: canonical("latest-recovery.jpg") }], owner);
    let latestPages: StoryPage[] | undefined;
    await act(async () => { latestPages = (await captured.getMemoryEditRecovery(current))!.pages; });
    await expect(captured.saveMemoryEditDraft(current, earlierPages!)).rejects.toThrow("Unknown missing");
    await act(async () => { await expect(captured.saveMemoryEditDraft(current, latestPages!)).resolves.toBeUndefined(); });
    const row = mockNative.prepare("SELECT pages_json FROM memory_edit_drafts WHERE memory_id = ? AND owner_account_key = ?").get(current.id, owner) as { pages_json: string };
    expect(row.pages_json).toContain(canonical("latest-recovery.jpg"));
    expect(row.pages_json).not.toContain(canonical("earlier-recovery.jpg"));
  });

  it("preserves foreign app-owned references as missing without copying another account's file during edits", async () => {
    const foreignPhoto = runtime("foreign.jpg", "next%40example.test");
    mockFiles.add(foreignPhoto);
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: foreignPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [foreignPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    expect(current.photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    const edited = [{ ...current.pages[0], headline: "Text edit" }];
    await act(async () => { await captured.saveMemoryEditDraft(current, edited); });
    await act(async () => { await captured.updatePages(current, edited); });
    expect((await getMemory(mockDb, current.id, owner))!.photoUris).toEqual([foreignPhoto]);
    expect(captured.memories[0].pages[0].photoUri).toMatch(/^missing-local-photo:\/\//);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("reuses distinct tokens for duplicate missing occurrences across refreshes", async () => {
    const storedPhoto = canonical("gone.jpg");
    const page: StoryPage = { id: "album-1:photo", position: 0, kind: "photo", headline: "Before", body: "", photoUri: storedPhoto };
    await saveMemory(mockDb, album({ status: "saved", photoUris: [storedPhoto, storedPhoto], pages: [page] }), owner);
    await mount();
    const current = captured.memories[0];
    expect(new Set([...current.photoUris, current.pages[0].photoUri]).size).toBe(3);
    await act(async () => { await captured.createDraft(input()); });
    expect(captured.memories[0].photoUris).toEqual(current.photoUris);
    expect(captured.memories[0].pages[0].photoUri).toBe(current.pages[0].photoUri);
    await act(async () => { await expect(captured.updatePages(current, [{ ...current.pages[0], photoUri: current.photoUris[1] }])).resolves.toBeUndefined(); });
    expect((await getMemory(mockDb, current.id, owner))!.photoUris).toEqual([storedPhoto, storedPhoto]);
  });

  it("regenerates a missing-photo draft while retaining the exact stored reference", async () => {
    const storedPhoto = canonical("gone.jpg");
    await createDraft(mockDb, album({ photoUris: [storedPhoto] }), owner);
    await mount();
    let retried: Memory | undefined;
    await act(async () => { retried = await captured.retryDraft("album-1"); });
    expect(retried!.photoUris[0]).toMatch(/^missing-local-photo:\/\//);
    expect((await getDraft(mockDb, "album-1", owner))!.photoUris).toEqual([storedPhoto]);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("can regenerate a stored canonical draft without importing documents references as picker files", async () => {
    const storedPhoto = canonical("existing.jpg");
    mockFiles.add(runtime("existing.jpg"));
    await createDraft(mockDb, album({ photoUris: [storedPhoto] }), owner);
    await mount();
    await act(async () => { await expect(captured.retryDraft("album-1")).resolves.toMatchObject({ photoUris: [runtime("existing.jpg")] }); });
    expect((await getDraft(mockDb, "album-1", owner))!.photoUris).toEqual([storedPhoto]);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });
});
