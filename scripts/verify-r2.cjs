const { randomUUID } = require("node:crypto");

function getR2Config(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

async function verifyR2({ env = process.env, s3 = require("@aws-sdk/client-s3") } = {}) {
  const config = getR2Config(env);
  const client = new s3.S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const objectKey = `staging-smoke-${Date.now()}-${randomUUID()}`;
  try {
    await client.send(new s3.PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: "ok" }));
    const read = await client.send(new s3.GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    const body = typeof read.Body?.transformToString === "function"
      ? await read.Body.transformToString()
      : String(read.Body ?? "");
    if (body !== "ok") throw new Error("R2 read-back content mismatch");
    await client.send(new s3.DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    return { ok: true, objectKey };
  } catch (error) {
    try {
      await client.send(new s3.DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    } catch {
      // Best-effort cleanup must never mask the original verification failure.
    }
    throw error;
  }
}

module.exports = { verifyR2, getR2Config };

if (require.main === module) {
  verifyR2()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
