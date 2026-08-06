type VerifyR2Options = {
  env?: Record<string, string | undefined>;
  s3?: {
    S3Client: new (options: unknown) => { send: (command: unknown) => Promise<unknown> };
    PutObjectCommand: new (input: unknown) => unknown;
    GetObjectCommand: new (input: unknown) => unknown;
    DeleteObjectCommand: new (input: unknown) => unknown;
  };
};

const { verifyR2 } = require("../scripts/verify-r2.cjs") as {
  verifyR2: (options?: VerifyR2Options) => Promise<{ ok: boolean; objectKey: string }>;
};

function createFakeS3(body = "ok") {
  const send = jest.fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ Body: { transformToString: async () => body } })
    .mockResolvedValueOnce({});
  const FakeCommand = jest.fn();
  const S3Client = jest.fn(() => ({ send }));
  return {
    s3: { S3Client, PutObjectCommand: FakeCommand, GetObjectCommand: FakeCommand, DeleteObjectCommand: FakeCommand },
    send,
    FakeCommand,
    S3Client,
  };
}

const validEnv = {
  R2_ACCOUNT_ID: "staging-account",
  R2_BUCKET: "onetapreality-staging",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
};

describe("verifyR2", () => {
  it("uploads, reads back, and deletes a smoke object", async () => {
    const fake = createFakeS3();
    const summary = await verifyR2({ env: validEnv, s3: fake.s3 });

    expect(summary.ok).toBe(true);
    expect(summary.objectKey).toMatch(/^staging-smoke-/u);
    expect(fake.S3Client).toHaveBeenCalledWith(expect.objectContaining({
      region: "auto",
      endpoint: "https://staging-account.r2.cloudflarestorage.com",
    }));
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it("rejects when any R2 environment variable is missing", async () => {
    const fake = createFakeS3();
    await expect(verifyR2({ env: { R2_BUCKET: "onetapreality-staging" }, s3: fake.s3 }))
      .rejects.toThrow("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("deletes the smoke object when read-back fails", async () => {
    const fake = createFakeS3("unexpected");
    await expect(verifyR2({ env: validEnv, s3: fake.s3 })).rejects.toThrow("R2 read-back content mismatch");
    expect(fake.send).toHaveBeenCalledTimes(3);
  });
});
