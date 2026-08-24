import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { clearMemories } from "../../storage/memory-repository";
import { deleteAccountPhotoDirectory } from "../memories/photo-persistence";
import type { AccountLocalLibraryOwner } from "./local-library-owner";
import { useLocalLibrary } from "./local-library-provider";

export function usePrivacyLocalLibrary() {
  const db = useSQLiteContext();
  const library = useLocalLibrary();
  const deleteAccountLibrary = React.useCallback(async (accountKey: AccountLocalLibraryOwner) => {
    await clearMemories(db, accountKey);
    await db.runAsync(
      "DELETE FROM local_library_account_choices WHERE account_owner = ?",
      accountKey,
    );
    await deleteAccountPhotoDirectory(accountKey);
  }, [db]);

  return {
    accountLibraryKey: library.accountOwner,
    currentLibraryIsGuest: library.owner === "guest",
    deleteAccountLibrary,
    isLibraryReady: library.isReady,
  };
}
