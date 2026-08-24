import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { clearMemories } from "../../storage/memory-repository";
import { deleteAccountPhotoDirectoryStrict } from "../memories/photo-persistence";
import type { AccountLocalLibraryOwner } from "./local-library-owner";
import { useLocalLibrary } from "./local-library-provider";
import { beginExclusiveLocalLibraryOperation } from "./local-library-write-lease";

export function usePrivacyLocalLibrary() {
  const db = useSQLiteContext();
  const library = useLocalLibrary();
  const deleteAccountLibrary = React.useCallback(async (accountKey: AccountLocalLibraryOwner) => {
    const lease = await beginExclusiveLocalLibraryOperation(
      db,
      "正在删除当前账号的本机旅行册，请稍后再试",
    );
    try {
      await clearMemories(db, accountKey);
      await db.runAsync(
        "DELETE FROM local_library_account_choices WHERE account_owner = ?",
        accountKey,
      );
      await deleteAccountPhotoDirectoryStrict(accountKey);
    } finally {
      lease.release();
    }
  }, [db]);

  return {
    accountLibraryKey: library.accountOwner,
    currentLibraryIsGuest: library.owner === "guest",
    deleteAccountLibrary,
    isLibraryReady: library.isReady,
  };
}
