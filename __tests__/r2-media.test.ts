jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn((input) => input),
  GetObjectCommand: jest.fn((input) => input),
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
});
