const { Client } = require("pg");

const tablePrimaryKeys = {
  devices: "id",
  users: "id",
  auth_email_codes: "id",
  auth_sessions: "id",
  auth_rate_limits: "scope_hash",
  memories: "id",
  memory_pages: "id",
  gifts: "id",
  gift_cards: "id",
  gift_card_events: "id",
  gift_members: "id",
  shared_albums: "id",
  gift_member_activations: "member_id",
  gift_email_codes: "id",
  gift_sessions: "id",
  shared_album_pages: "id",
  shared_album_media: "id",
  gift_publish_sessions: "id",
  gift_management_requests: "id",
  gift_media_cleanup_jobs: "id",
  app_maintenance_state: "id",
  app_schema_meta: "key",
};

const orphanChecks = {
  memoryPages: "select count(*)::int as count from memory_pages child left join memories parent on parent.id = child.memory_id where parent.id is null",
  giftMembers: "select count(*)::int as count from gift_members child left join gifts parent on parent.id = child.gift_id where parent.id is null",
  sharedAlbumMedia: "select count(*)::int as count from shared_album_media child left join shared_albums parent on parent.id = child.shared_album_id where parent.id is null",
};

function compareMigrationSummaries(source, target) {
  const errors = [];

  for (const table of Object.keys(source.tables)) {
    if (source.tables[table].count !== target.tables[table].count) {
      errors.push(`${table} count differs: source=${source.tables[table].count} target=${target.tables[table].count}`);
    }
    if (target.tables[table].nullPrimaryKeys !== 0) {
      errors.push(`${table} target has ${target.tables[table].nullPrimaryKeys} null primary keys`);
    }
  }

  for (const [name, count] of Object.entries(target.orphanCounts)) {
    if (count !== 0) errors.push(`${name} target has ${count} orphan rows`);
  }

  return errors;
}

async function collectMigrationSummary(client) {
  const tables = {};
  for (const [table, primaryKey] of Object.entries(tablePrimaryKeys)) {
    const result = await client.query(`select count(*)::int as count, count(*) filter (where ${primaryKey} is null)::int as null_primary_keys from ${table}`);
    tables[table] = {
      count: result.rows[0].count,
      nullPrimaryKeys: result.rows[0].null_primary_keys,
    };
  }

  const orphanCounts = {};
  for (const [name, query] of Object.entries(orphanChecks)) {
    const result = await client.query(query);
    orphanCounts[name] = result.rows[0].count;
  }

  return { tables, orphanCounts };
}

async function verifyMigration({ sourceClient, targetClient }) {
  const [source, target] = await Promise.all([
    collectMigrationSummary(sourceClient),
    collectMigrationSummary(targetClient),
  ]);
  const errors = compareMigrationSummaries(source, target);
  if (errors.length) throw new Error(errors.join("\n"));
  return target;
}

module.exports = { collectMigrationSummary, compareMigrationSummaries, orphanChecks, tablePrimaryKeys, verifyMigration };

if (require.main === module) {
  const sourceConnectionString = process.env.MIGRATION_SOURCE_DATABASE_URL;
  const targetConnectionString = process.env.MIGRATION_TARGET_DATABASE_URL;
  if (!sourceConnectionString || !targetConnectionString) {
    console.error("MIGRATION_SOURCE_DATABASE_URL and MIGRATION_TARGET_DATABASE_URL are required");
    process.exitCode = 1;
  } else {
    const sourceClient = new Client({ connectionString: sourceConnectionString });
    const targetClient = new Client({ connectionString: targetConnectionString });
    Promise.all([sourceClient.connect(), targetClient.connect()])
      .then(() => verifyMigration({ sourceClient, targetClient }))
      .then((summary) => console.log(JSON.stringify(summary)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      })
      .finally(async () => {
        await Promise.all([sourceClient.end(), targetClient.end()]);
      });
  }
}
