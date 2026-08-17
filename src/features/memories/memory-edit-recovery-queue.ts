import type { StoryPage } from "../../types/memory";
import { AutosaveQueue } from "./autosave-queue";

const ERROR_RETENTION_MS = 5 * 60 * 1000;

type RegistryEntry = {
  errorCleanupTimer: ReturnType<typeof setTimeout> | null;
  latestSnapshot: StoryPage[] | null;
  owners: number;
  queue: AutosaveQueue<StoryPage[]>;
};

export type MemoryEditRecoveryQueueLease = {
  clearLatestSnapshot: () => void;
  enqueue: (snapshot: StoryPage[]) => void;
  getLatestSnapshot: () => StoryPage[] | null;
  queue: AutosaveQueue<StoryPage[]>;
  release: () => void;
};

const registry = new Map<string, RegistryEntry>();

function cloneSnapshot(snapshot: StoryPage[]): StoryPage[] {
  return JSON.parse(JSON.stringify(snapshot)) as StoryPage[];
}

function deleteIfUnowned(key: string, entry: RegistryEntry) {
  if (entry.owners === 0 && registry.get(key) === entry) {
    registry.delete(key);
  }
}

function retainErroredEntryTemporarily(key: string, entry: RegistryEntry) {
  if (entry.owners !== 0 || registry.get(key) !== entry || entry.errorCleanupTimer) return;
  entry.errorCleanupTimer = setTimeout(() => {
    entry.errorCleanupTimer = null;
    deleteIfUnowned(key, entry);
  }, ERROR_RETENTION_MS);
  const timerWithUnref = entry.errorCleanupTimer as ReturnType<typeof setTimeout> & { unref?: () => void };
  timerWithUnref.unref?.();
}

export function acquireMemoryEditRecoveryQueue(
  key: string,
  writer: (snapshot: StoryPage[]) => Promise<void>,
): MemoryEditRecoveryQueueLease {
  let entry = registry.get(key);
  if (!entry) {
    entry = {
      errorCleanupTimer: null,
      latestSnapshot: null,
      owners: 0,
      queue: new AutosaveQueue(writer),
    };
    registry.set(key, entry);
  }
  if (entry.errorCleanupTimer) {
    clearTimeout(entry.errorCleanupTimer);
    entry.errorCleanupTimer = null;
  }
  entry.owners += 1;
  let released = false;

  return {
    clearLatestSnapshot: () => {
      if (registry.get(key) === entry) entry!.latestSnapshot = null;
    },
    enqueue: (snapshot) => {
      const safeSnapshot = cloneSnapshot(snapshot);
      entry!.latestSnapshot = safeSnapshot;
      entry!.queue.enqueue(cloneSnapshot(safeSnapshot));
    },
    getLatestSnapshot: () => (
      entry!.latestSnapshot ? cloneSnapshot(entry!.latestSnapshot) : null
    ),
    queue: entry.queue,
    release: () => {
      if (released) return;
      released = true;
      entry!.owners = Math.max(0, entry!.owners - 1);
      if (entry!.owners !== 0) return;
      void entry!.queue.waitForIdle()
        .then(() => deleteIfUnowned(key, entry!))
        .catch(() => retainErroredEntryTemporarily(key, entry!));
    },
  };
}
