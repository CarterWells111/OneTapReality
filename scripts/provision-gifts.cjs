/*
 * Operations-only command. Example:
 *   DATABASE_URL=... GIFT_TOKEN_PEPPER=... node scripts/provision-gifts.cjs 100 > nfc-write-list.csv
 * It prints the NFC URL exactly once; the database stores only its peppered hash.
 */
const crypto = require("node:crypto");
const { Client } = require("pg");

const count = Number(process.argv[2] ?? 1);
const origin = (process.env.GIFT_URL_ORIGIN ?? "https://onetapreality.com").replace(/\/+$/u, "");
const DATABASE_URL = process.env.DATABASE_URL;
const GIFT_TOKEN_PEPPER = process.env.GIFT_TOKEN_PEPPER;
if (!DATABASE_URL || !GIFT_TOKEN_PEPPER || !Number.isInteger(count) || count < 1 || count > 10_000) {
  throw new Error("Usage: DATABASE_URL and GIFT_TOKEN_PEPPER are required; count must be 1–10000.");
}

function token() { return crypto.randomBytes(32).toString("base64url"); }
function tokenHash(value) { return crypto.createHash("sha256").update(`${GIFT_TOKEN_PEPPER}:${value}`).digest("hex"); }

(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log("gift_id,nfc_url");
    for (let index = 0; index < count; index += 1) {
      const value = token();
      const id = crypto.randomUUID();
      await client.query(
        "insert into gifts (id, token_hash, status, created_at, claimed_at, disabled_at) values ($1, $2, 'unclaimed', $3, null, null)",
        [id, tokenHash(value), new Date().toISOString()],
      );
      console.log(`${id},${origin}/gift/${value}`);
    }
  } finally { await client.end(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
