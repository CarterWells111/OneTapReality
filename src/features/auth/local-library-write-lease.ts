import type { SQLiteDatabase } from "expo-sqlite";

import type { LocalLibraryOwner } from "./local-library-owner";

type WriteState = {
  activeWrites: number;
  exclusiveMessage: string | null;
  drainWaiters: Set<() => void>;
};

export type LocalLibraryWriteLease = {
  assertActive: () => void;
  release: () => void;
};

export type GuestLibraryMigrationLease = {
  release: () => void;
};

const states = new WeakMap<object, WriteState>();

function stateFor(db: SQLiteDatabase): WriteState {
  let state = states.get(db);
  if (!state) {
    state = { activeWrites: 0, exclusiveMessage: null, drainWaiters: new Set() };
    states.set(db, state);
  }
  return state;
}

function notifyDrained(state: WriteState) {
  if (state.activeWrites !== 0) return;
  for (const resolve of state.drainWaiters) resolve();
  state.drainWaiters.clear();
}

/** Acquires before the first await so a migration cannot overtake a UI write. */
export function acquireLocalLibraryWriteLease(
  db: SQLiteDatabase,
  _owner: LocalLibraryOwner,
  validate: () => void,
): LocalLibraryWriteLease {
  validate();
  const state = stateFor(db);
  if (state.exclusiveMessage) throw new Error(state.exclusiveMessage);
  state.activeWrites += 1;
  let released = false;

  return {
    assertActive: () => {
      if (released) throw new Error("本机旅行册写入已结束");
      validate();
    },
    release: () => {
      if (released) return;
      released = true;
      state.activeWrites = Math.max(0, state.activeWrites - 1);
      notifyDrained(state);
    },
  };
}

/** Marks migration pending synchronously, then drains writes that started first. */
export async function beginExclusiveLocalLibraryOperation(
  db: SQLiteDatabase,
  blockingMessage = "本机旅行册正在进行安全操作，请稍后再试",
): Promise<GuestLibraryMigrationLease> {
  const state = stateFor(db);
  if (state.exclusiveMessage) throw new Error(state.exclusiveMessage);
  state.exclusiveMessage = blockingMessage;
  if (state.activeWrites > 0) {
    await new Promise<void>((resolve) => state.drainWaiters.add(resolve));
  }
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      state.exclusiveMessage = null;
    },
  };
}

export function beginGuestLibraryMigration(
  db: SQLiteDatabase,
): Promise<GuestLibraryMigrationLease> {
  return beginExclusiveLocalLibraryOperation(db, "本机旅行册正在迁移，请稍后再试");
}
