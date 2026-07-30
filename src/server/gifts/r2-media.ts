import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2MediaConfig = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type PrivateMediaStore = {
  createUploadUrl: (input: { objectKey: string; contentType: string }) => Promise<string>;
  createReadUrl: (objectKey: string) => Promise<string>;
  getObjectMetadata: (objectKey: string) => Promise<{ contentType: string; byteSize: number } | null>;
  objectExists: (objectKey: string) => Promise<boolean>;
  deleteObjects: (objectKeys: string[]) => Promise<void>;
};

const signedUrlLifetimeSeconds = 10 * 60;

export function createR2MediaStore(config: R2MediaConfig): PrivateMediaStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    createUploadUrl: ({ objectKey, contentType }) => getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, ContentType: contentType }),
      { expiresIn: signedUrlLifetimeSeconds },
    ),
    createReadUrl: (objectKey) => getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
      { expiresIn: signedUrlLifetimeSeconds },
    ),
    async objectExists(objectKey) {
      return (await this.getObjectMetadata(objectKey)) !== null;
    },
    async getObjectMetadata(objectKey) {
      try {
        const object = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
        if (typeof object.ContentType !== "string" || typeof object.ContentLength !== "number") return null;
        return { contentType: object.ContentType, byteSize: object.ContentLength };
      } catch { return null; }
    },
    async deleteObjects(objectKeys) {
      if (objectKeys.length === 0) return;
      await client.send(new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: objectKeys.map((Key) => ({ Key })), Quiet: true },
      }));
    },
  };
}

export function getR2MediaStoreFromEnvironment(): PrivateMediaStore | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  return accountId && bucket && accessKeyId && secretAccessKey
    ? createR2MediaStore({ accountId, bucket, accessKeyId, secretAccessKey })
    : null;
}
