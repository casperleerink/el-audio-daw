import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@el-audio-daw/env/api";

const s3Client = new S3Client({
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}
