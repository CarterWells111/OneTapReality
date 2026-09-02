const { compareMigrationSummaries, orphanChecks } = require("../scripts/verify-migration.cjs");

const complete = {
  tables: {
    devices: { count: 2, nullPrimaryKeys: 0 },
    users: { count: 1, nullPrimaryKeys: 0 },
  },
  orphanCounts: {
    memoryPages: 0,
    giftMembers: 0,
    sharedAlbumMedia: 0,
  },
};

describe("migration integrity summary", () => {
  it("accepts equal source and target summaries without orphans", () => {
    expect(compareMigrationSummaries(complete, structuredClone(complete))).toEqual([]);
  });

  it("reports count, primary-key, and foreign-key differences by logical name only", () => {
    const target = structuredClone(complete);
    target.tables.devices.count = 1;
    target.tables.users.nullPrimaryKeys = 1;
    target.orphanCounts.giftMembers = 2;

    expect(compareMigrationSummaries(complete, target)).toEqual([
      "devices count differs: source=2 target=1",
      "users target has 1 null primary keys",
      "giftMembers target has 2 orphan rows",
    ]);
  });

  it("reports a missing target table instead of throwing a property access error", () => {
    const target = structuredClone(complete);
    delete target.tables.users;

    expect(compareMigrationSummaries(complete, target)).toEqual([
      "users is missing from target summary",
    ]);
  });

  it("covers every non-null foreign-key relationship that protects user data", () => {
    expect(Object.keys(orphanChecks)).toEqual([
      "memoriesDevice",
      "memoryPages",
      "giftCards",
      "giftCardEvents",
      "giftMembers",
      "sharedAlbums",
      "sharedAlbumPages",
      "sharedAlbumMedia",
      "giftMemberActivationsMember",
      "giftMemberActivationsUser",
      "authSessions",
      "giftPublishSessions",
      "giftManagementRequestsGift",
      "giftManagementRequestsMember",
      "giftMediaCleanupJobs",
    ]);
  });
});
