import {
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Context, Hono } from "hono";

const bio = new Hono();

bio.get("/", (c: Context) => {
  return c.text("Bio route");
});

// Create a new bio
bio.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id;

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const contentType = c.req.header("Content-Type");
  let formData: FormData;
  let profileImage: File | Blob | string | null = null;

  if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    profileImage = formData.get("profileImage");

    // Upload profile image to S3 if it's a file
    if (profileImage instanceof File) {
      const s3 = new S3Client({
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
        region: c.env.AWS_REGION,
      });

      const s3Params = {
        Bucket: c.env.AWS_BUCKET_NAME,
        Key: `images/${Date.now()}-${profileImage.name}`,
        Body: profileImage,
        ACL: ObjectCannedACL.public_read,
      };

      try {
        await s3.send(new PutObjectCommand(s3Params));
        const imageUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
        formData.set("profileImage", imageUrl);
      } catch (error) {
        return c.json(
          { error: `Failed to upload profile image: ${error}` },
          500
        );
      }
    }
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  // Convert FormData to object properly for Cloudflare Workers
  const data: Record<string, any> = {};
  for (const [key, value] of (formData as any).entries()) {
    data[key] = value;
  }
  data["userId"] = userId;

  // Convert designations to an array if it's a string
  if (typeof data.designations === "string") {
    data.designations = JSON.parse(data.designations);
  }

  try {
    const savedBio = await prisma.bio.create({
      data: {
        name: data.name as string,
        designations: data.designations as string[],
        desc: data.desc as string,
        profileImage: data.profileImage as string,
        resumeUrl: data.resumeUrl as string | undefined,
        userId: data.userId as string,
      },
    });
    return c.json(savedBio, 201);
  } catch (error) {
    console.error("Error saving bio:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// get bio of user by user id
bio.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  try {
    const bio = await prisma.bio.findFirst({
      where: { userId },
    });
    console.log("bio: ", bio);
    if (!bio) {
      return c.json({}, 200);
    }

    return c.json(bio, 200);
  } catch (error) {
    return c.json(
      { error: `Failed to fetch bio: ${(error as Error).message}` },
      500
    );
  }
});

// Update bio of user
bio.put("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id;

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const contentType = c.req.header("Content-Type");
  let formData: FormData;
  let profileImage: File | Blob | string | null = null;

  if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    profileImage = formData.get("profileImage");

    // Upload profile image to S3 if it's a file
    if (profileImage instanceof File) {
      const s3 = new S3Client({
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
        region: c.env.AWS_REGION,
      });

      const s3Params = {
        Bucket: c.env.AWS_BUCKET_NAME,
        Key: `images/${Date.now()}-${profileImage.name}`,
        Body: profileImage,
        ACL: ObjectCannedACL.public_read,
      };

      try {
        await s3.send(new PutObjectCommand(s3Params));
        const imageUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
        formData.set("profileImage", imageUrl);
      } catch (error) {
        return c.json(
          { error: `Failed to upload profile image: ${error}` },
          500
        );
      }
    }
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  // Convert FormData to object properly for Cloudflare Workers
  const data: Record<string, any> = {};
  for (const [key, value] of (formData as any).entries()) {
    data[key] = value;
  }
  data["userId"] = userId;

  // Convert designations to an array if it's a string
  if (typeof data.designations === "string") {
    data.designations = JSON.parse(data.designations);
  }

  try {
    const updatedBio = await prisma.bio.update({
      where: { userId },
      data: {
        name: data.name as string,
        designations: data.designations as string[],
        desc: data.desc as string,
        profileImage: data.profileImage as string,
        resumeUrl: data.resumeUrl as string | undefined,
      },
    });
    return c.json(updatedBio, 200);
  } catch (error) {
    console.error("Error updating bio:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

export default bio;
