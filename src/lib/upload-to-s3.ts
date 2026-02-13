import { Context } from "hono";
import {
    S3Client,
    PutObjectCommand,
    ObjectCannedACL,
    DeleteObjectCommand,
  } from "@aws-sdk/client-s3";


import { Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

async function uploadToS3(
  file: File,
  c: Context,
  previousImageUrl?: string
): Promise<string> {
  // Cloudflare Workers environment variables (c.env)
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_BUCKET_NAME,
  } = c.env;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_BUCKET_NAME) {
    throw new Error(
      "Missing AWS configuration. Ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_BUCKET_NAME are set in environment variables."
    );
  }

  const s3 = new S3Client({
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
    region: AWS_REGION,
  });

  try {
    // Delete previous image if it was stored in S3
    if (
      previousImageUrl &&
      previousImageUrl.startsWith(`https://${AWS_BUCKET_NAME}.s3.`)
    ) {
      const previousKey = previousImageUrl.split(".com/")[1];
      await s3.send(
        new DeleteObjectCommand({
          Bucket: AWS_BUCKET_NAME,
          Key: previousKey,
        })
      );
    }

    // Convert File to Uint8Array for better compatibility with Cloudflare Workers
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    const s3Params = {
      Bucket: AWS_BUCKET_NAME,
      Key: `images/${Date.now()}-${file.name}`,
      Body: body,
      ContentType: file.type || "application/octet-stream",
      ACL: ObjectCannedACL.public_read,
    };

    await s3.send(new PutObjectCommand(s3Params));
    return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Params.Key}`;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error(`Failed to upload image: ${getErrorMessage(error)}`);
  }
}

export default uploadToS3;