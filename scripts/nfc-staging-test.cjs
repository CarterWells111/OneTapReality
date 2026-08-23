#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createInterface } = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { Pool } = require("pg");

const {
  CONFIRMATION,
  STAGING_API_ORIGIN,
  STAGING_GIFT_ORIGIN,
  STAGING_R2_BUCKET,
  assertGuardState,
  assertStagingConfiguration,
  cleanupScenarioMatrix,
  createInitialManifest,
  createStagingApiClient,
  deriveRoleEmails,
  formatInspectionSummary,
  installLocalLab,
  removeLocalArtifacts,
  rollbackFailedSeed,
  seedScenarioMatrix,
  verifyAllowlistRollback,
  writeManifestAtomic,
} = require("./nfc-staging-test-helpers.cjs");

const MANIFEST_PATH = join(process.cwd(), ".data", "nfc-staging", "active.json");
const LAB_PATH = join(process.cwd(), "src", "app", "nfc-lab-local.tsx");
const COMMANDS = ["seed", "inspect", "prepare-pr", "guard"];

function parseArgs(argv) {
  const command = argv[0];
  if (!command) throw new Error(`Choose one command: ${COMMANDS.join(", ")}`);
  if (!COMMANDS.includes(command)) throw new Error(`Unknown NFC staging command: ${command}`);
  if (argv.length !== 1) throw new Error(`Unknown arguments for ${command}`);
  return { command };
}

async function parseResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loginWithEmail({ apiOrigin, email, request = fetch, prompt, log = console.log }) {
  if (apiOrigin !== STAGING_API_ORIGIN) throw new Error("Email login is restricted to the fixed staging origin");
  const requested = await request(`${apiOrigin}/api/auth/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (requested.status !== 202) {
    const payload = await parseResponse(requested);
    throw new Error(`Unable to request staging verification code: ${payload?.error?.code ?? requested.status}`);
  }
  log("Verification code sent to the selected staging test account.");
  const code = String(await prompt("Six-digit verification code: ")).trim();
  if (!/^\d{6}$/u.test(code)) throw new Error("A six-digit verification code is required");
  const verified = await request(`${apiOrigin}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const session = await parseResponse(verified);
  if (verified.status !== 201 || typeof session?.accessToken !== "string") {
    throw new Error(`Unable to verify staging account: ${session?.error?.code ?? verified.status}`);
  }
  return session;
}

async function inspectScenarioMatrix({ client, manifest, viewerAccessToken, editorAccessToken }) {
  const [viewerInvites, editorInvites] = await Promise.all([
    client.listInvited(viewerAccessToken),
    client.listInvited(editorAccessToken),
  ]);
  const viewerIds = new Set(viewerInvites.map((item) => item.giftId));
  const editorIds = new Set(editorInvites.map((item) => item.giftId));
  const result = { batchId: manifest.batchId, scenarios: {} };
  for (const [name, scenario] of Object.entries(manifest.scenarios ?? {})) {
    const detail = await client.getCard(scenario.cardId);
    const owned = scenario.giftId ? await client.getOwnedGift(scenario.giftId) : null;
    result.scenarios[name] = {
      cardId: scenario.cardId,
      giftId: scenario.giftId ?? detail.card.giftId ?? null,
      cardState: detail.card.state,
      giftStatus: detail.card.giftStatus,
      albumVersion: owned?.album?.version ?? null,
      ...(name === "viewer" ? { activated: viewerIds.has(scenario.giftId) } : {}),
      ...(name === "editor" ? { activated: editorIds.has(scenario.giftId) } : {}),
    };
  }
  return result;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function purgeBatchRecords({ manifest, databaseUrl, createPool = (options) => new Pool(options) }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to purge the exact staging test batch");
  const scenarios = Object.values(manifest.scenarios ?? {});
  if (!scenarios.length || scenarios.some((scenario) => scenario.state !== "revoked" || !scenario.cardId || !scenario.giftId)) {
    throw new Error("Every staging scenario must be revoked and have exact card/gift ids before database cleanup");
  }
  const expectedCardIds = sorted(scenarios.map((scenario) => scenario.cardId));
  const expectedGiftIds = sorted(scenarios.map((scenario) => scenario.giftId));
  const pool = createPool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const inventory = await client.query(
      `select gc.id as card_id, gc.gift_id, gc.note, g.status
       from gift_cards gc
       inner join gifts g on g.id = gc.gift_id
       where gc.note like 'NFC-LAB:' || $1 || ':%'
       order by gc.id`,
      [manifest.batchId],
    );
    const actualCardIds = sorted(inventory.rows.map((row) => row.card_id));
    const actualGiftIds = sorted(inventory.rows.map((row) => row.gift_id));
    const notesMatch = inventory.rows.every((row) => row.note?.startsWith(`NFC-LAB:${manifest.batchId}:`) && row.status === "disabled");
    if (JSON.stringify(actualCardIds) !== JSON.stringify(expectedCardIds)
      || JSON.stringify(actualGiftIds) !== JSON.stringify(expectedGiftIds)
      || !notesMatch) {
      throw new Error("Refusing cleanup because the exact batch inventory differs from the active manifest");
    }
    await client.query("begin");
    inTransaction = true;
    await client.query("delete from gift_cards where id = any($1::text[])", [expectedCardIds]);
    await client.query("delete from gifts where id = any($1::text[])", [expectedGiftIds]);
    await client.query("commit");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) throw new Error("No active NFC staging manifest exists");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.version !== 1 || typeof manifest.batchId !== "string") throw new Error("The active NFC staging manifest is invalid");
  return manifest;
}

function resolveSeedManifest({ baseEmail, labExists, existingManifest }) {
  if (labExists) throw new Error("A local NFC Lab is already installed; clean it before seeding another batch");
  if (!existingManifest) return createInitialManifest(baseEmail);
  const expectedRoles = deriveRoleEmails(baseEmail);
  if (JSON.stringify(existingManifest.roleEmails) !== JSON.stringify(expectedRoles)) {
    throw new Error("The active NFC manifest belongs to a different base email");
  }
  if (existingManifest.apiOrigin !== STAGING_API_ORIGIN
    || existingManifest.giftOrigin !== STAGING_GIFT_ORIGIN
    || existingManifest.r2Bucket !== STAGING_R2_BUCKET) {
    throw new Error("The active NFC manifest does not describe the fixed staging environment");
  }
  if (!["seeding", "seed_failed"].includes(existingManifest.phase)) {
    throw new Error(`The active NFC batch is in phase ${existingManifest.phase}; run prepare-pr before creating another batch`);
  }
  return existingManifest;
}

function readTrackedText() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  const textExtensions = /\.(?:cjs|mjs|js|jsx|ts|tsx|json|md|yml|yaml|toml|txt)$/iu;
  return output.split("\0")
    .filter((path) => path && textExtensions.test(path) && ![
      "__tests__/nfc-staging-test.test.ts",
      "__tests__/nfc-staging-cli.test.ts",
    ].includes(path.replaceAll("\\", "/")))
    .map((path) => {
      try { return readFileSync(join(process.cwd(), path), "utf8"); } catch { return ""; }
    })
    .join("\n");
}

function runGuard() {
  assertGuardState({
    labExists: existsSync(LAB_PATH),
    manifestExists: existsSync(MANIFEST_PATH),
    trackedText: readTrackedText(),
    environment: process.env,
  });
}

function environmentConfig() {
  const config = {
    apiOrigin: process.env.NFC_TEST_API_ORIGIN ?? STAGING_API_ORIGIN,
    giftOrigin: process.env.NFC_TEST_GIFT_ORIGIN ?? STAGING_GIFT_ORIGIN,
    r2Bucket: process.env.NFC_TEST_R2_BUCKET ?? "",
    confirmation: process.env.NFC_TEST_CONFIRMATION ?? "",
  };
  assertStagingConfiguration(config);
  return config;
}

async function withPrompt(work) {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return await work((question) => terminal.question(question));
  } finally {
    terminal.close();
  }
}

async function createSessions(prompt, manifest) {
  const adminEmail = process.env.NFC_TEST_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) throw new Error("NFC_TEST_ADMIN_EMAIL is required and must already be a staging gift administrator");
  const admin = await loginWithEmail({ apiOrigin: STAGING_API_ORIGIN, email: adminEmail, prompt });
  const owner = await loginWithEmail({ apiOrigin: STAGING_API_ORIGIN, email: manifest.roleEmails.owner, prompt });
  return { admin, owner };
}

async function seedCommand(prompt) {
  environmentConfig();
  const baseEmail = process.env.NFC_TEST_BASE_EMAIL?.trim();
  if (!baseEmail) throw new Error("NFC_TEST_BASE_EMAIL is required");
  const manifest = resolveSeedManifest({
    baseEmail,
    labExists: existsSync(LAB_PATH),
    existingManifest: existsSync(MANIFEST_PATH) ? readManifest() : null,
  });
  writeManifestAtomic(MANIFEST_PATH, manifest);
  const { admin, owner } = await createSessions(prompt, manifest);
  const client = createStagingApiClient({
    apiOrigin: STAGING_API_ORIGIN,
    adminAccessToken: admin.accessToken,
    ownerAccessToken: owner.accessToken,
    maintenanceSecret: process.env.GIFT_CARD_CLEANUP_SECRET,
  });
  await seedScenarioMatrix({ client, manifest, persist: async (next) => writeManifestAtomic(MANIFEST_PATH, next) });
  installLocalLab({ manifest, labPath: LAB_PATH });
  console.log(formatInspectionSummary(manifest));
  console.log("Local route installed at /nfc-lab-local. No gift token was printed.");
}

async function inspectCommand(prompt) {
  environmentConfig();
  const manifest = readManifest();
  const { admin, owner } = await createSessions(prompt, manifest);
  const viewer = await loginWithEmail({ apiOrigin: STAGING_API_ORIGIN, email: manifest.roleEmails.viewer, prompt });
  const editor = await loginWithEmail({ apiOrigin: STAGING_API_ORIGIN, email: manifest.roleEmails.editor, prompt });
  const client = createStagingApiClient({ apiOrigin: STAGING_API_ORIGIN, adminAccessToken: admin.accessToken, ownerAccessToken: owner.accessToken });
  const summary = await inspectScenarioMatrix({ client, manifest, viewerAccessToken: viewer.accessToken, editorAccessToken: editor.accessToken });
  console.log(JSON.stringify(summary, null, 2));
}

async function preparePrCommand(prompt) {
  environmentConfig();
  const manifest = readManifest();
  const { admin, owner } = await createSessions(prompt, manifest);
  const client = createStagingApiClient({
    apiOrigin: STAGING_API_ORIGIN,
    adminAccessToken: admin.accessToken,
    ownerAccessToken: owner.accessToken,
    maintenanceSecret: process.env.GIFT_CARD_CLEANUP_SECRET,
  });
  const persist = async (next) => writeManifestAtomic(MANIFEST_PATH, next);
  if (["seeding", "seed_failed"].includes(manifest.phase)) await rollbackFailedSeed({ client, manifest, persist });
  else await cleanupScenarioMatrix({ client, manifest, persist });
  await purgeBatchRecords({ manifest, databaseUrl: process.env.DATABASE_URL });
  await prompt("Remove the three +nfc aliases from staging ALPHA_ALLOWED_EMAILS, then press Enter: ");
  await verifyAllowlistRollback({ apiOrigin: STAGING_API_ORIGIN, emails: Object.values(manifest.roleEmails) });
  removeLocalArtifacts({ labPath: LAB_PATH, manifestPath: MANIFEST_PATH });
  runGuard();
  console.log("NFC staging batch, local Lab, manifest, and temporary allowlist access are cleared.");
}

async function main() {
  const { command } = parseArgs(process.argv.slice(2));
  if (command === "guard") {
    runGuard();
    console.log("NFC PR guard passed.");
    return;
  }
  await withPrompt(async (prompt) => {
    if (command === "seed") await seedCommand(prompt);
    else if (command === "inspect") await inspectCommand(prompt);
    else await preparePrCommand(prompt);
  });
}

module.exports = {
  inspectScenarioMatrix,
  loginWithEmail,
  parseArgs,
  purgeBatchRecords,
  resolveSeedManifest,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`NFC STAGING TEST FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
