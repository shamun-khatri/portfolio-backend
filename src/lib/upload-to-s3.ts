import { Context } from "hono";
import {
    S3Client,
    PutObjectCommand,
    ObjectCannedACL,
    DeleteObjectCommand,
  } from "@aws-sdk/client-s3";


async function uploadToS3(
    file: File,
    c: Context,
    previousImageUrl?: string
  ): Promise<string> {
    const s3 = new S3Client({
      credentials: {
        accessKeyId: c.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
      },
      region: c.env.AWS_REGION,
    });
  
    const s3Params = {
      Bucket: c.env.AWS_BUCKET_NAME,
      Key: `images/${Date.now()}-${file.name}`,
      Body: file,
      ContentType: file.type,
      ACL: ObjectCannedACL.public_read,
    };
  
    try {
      // Delete previous image if it was stored in S3
      if (
        previousImageUrl &&
        previousImageUrl.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
      ) {
        const previousKey = previousImageUrl.split(".com/")[1];
        await s3.send(
          new DeleteObjectCommand({
            Bucket: c.env.AWS_BUCKET_NAME,
            Key: previousKey,
          })
        );
      }
  
      await s3.send(new PutObjectCommand(s3Params));
      return `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
    } catch (error) {
      throw new Error(`Failed to upload image: ${(error as Error).message}`);
    }
  }

export default uploadToS3;