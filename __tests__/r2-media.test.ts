jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn((input) => input),
  GetObjectCommand: jest.fn((input) => input),
  HeadObjectCommand: jest.fn((input) => input),
  DeleteObjectsCommand: jest.fn((input) => input),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn(async (_client, command) => `https://signed.example/${command.Key}`) }));

import { createR2MediaStore } from "../src/server/gifts/r2-media";

describe("private R2 media store", () => {
  it("creates short-lived signed upload and read URLs without revealing credentials", async () => {
    const store = createR2MediaStore({ accountId: "account", bucket: "gift-private", accessKeyId: "key", secretAccessKey: "secret" });
    await expect(store.createUploadUrl({ objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg" })).resolves.toBe("https://signed.example/gifts/gift-1/photo.jpg");
    await expect(store.createReadUrl("gifts/gift-1/photo.jpg")).resolves.toBe("https://signed.example/gifts/gift-1/photo.jpg");
  });

  it("reads immutable object metadata before a publication can be committed", async () => {
    const { S3Client } = jest.requireMock("@aws-sdk/client-s3") as { S3Client: jest.Mock };
    S3Client.mockImplementation(() => ({ send: jest.fn(async () => ({ ContentType: "image/jpeg", ContentLength: 42 })) }));
    const store = createR2MediaStore({ accountId: "account", bucket: "gift-private", accessKeyId: "key", secretAccessKey: "secret" });

    await expect(store.getObjectMetadata("gifts/gift-1/photo.jpg")).resolves.toEqual({ contentType: "image/jpeg", byteSize: 42 });
  });

  it("returns null only for an object that R2 reports as missing", async () => {
    const { S3Client } = jest.requireMock("@aws-sdk/client-s3") as { S3Client: jest.Mock };
    S3Client.mockImplementation(() => ({ send: jest.fn(async () => { throw Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } }); }) }));
    const store = createR2MediaStore({ accountId: "account", bucket: "gift-private", accessKeyId: "key", secretAccessKey: "secret" });
    await expect(store.getObjectMetadata("missing.jpg")).resolves.toBeNull();

    S3Client.mockImplementation(() => ({ send: jest.fn(async () => { throw Object.assign(new Error("upstream"), { $metadata: { httpStatusCode: 503 } }); }) }));
    const unavailable = createR2MediaStore({ accountId: "account", bucket: "gift-private", accessKeyId: "key", secretAccessKey: "secret" });
    await expect(unavailable.getObjectMetadata("photo.jpg")).rejects.toThrow("upstream");
  });

  it("rejects a nominally successful batch response containing object errors", async () => {
    const { S3Client } = jest.requireMock("@aws-sdk/client-s3") as { S3Client: jest.Mock };
    S3Client.mockImplementation(() => ({ send: jest.fn(async () => ({ Errors: [{ Code: "InternalError", Key: "secret-object-key" }] })) }));
    const store = createR2MediaStore({ accountId: "account", bucket: "gift-private", accessKeyId: "key", secretAccessKey: "secret" });

    await expect(store.deleteObjects(["secret-object-key"])).rejects.toThrow("R2 deletion failed for 1 object");
  });
});
