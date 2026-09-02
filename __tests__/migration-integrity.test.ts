const {
  compareMigrationSummaries,
  orphanChecks,
  tablePrimaryKeys,
} = require("../scripts/verify-migration.cjs");

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
    const { users: removedUserTable, ...targetTables } = structuredClone(complete).tables;
    expect(removedUserTable).toBeDefined();
    const target = { ...structuredClone(complete), tables: targetTables };

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

  it("tracks every current production table with its actual primary key", () => {
    expect(tablePrimaryKeys).toEqual({
      account_deletion_challenges: "id",
      account_deletion_jobs: "id",
      account_deletion_media_objects: "id",
      app_maintenance_state: "id",
      app_schema_meta: "key",
      auth_email_codes: "id",
      auth_rate_limits: "scope_hash",
      auth_sessions: "id",
      devices: "id",
      gift_card_events: "id",
      gift_cards: "id",
      gift_content_reports: "id",
      gift_management_requests: "id",
      gift_media_cleanup_jobs: "id",
      gift_member_activations: "member_id",
      gift_members: "id",
      gift_publish_sessions: "id",
      gift_relationship_tombstones: "id",
      gifts: "id",
      memories: "id",
      memory_pages: "id",
      shared_album_media: "id",
      shared_album_pages: "id",
      shared_albums: "id",
      user_blocks: "id",
      users: "id",
    });
  });
});
