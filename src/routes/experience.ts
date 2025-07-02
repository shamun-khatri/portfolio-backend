import { Hono, Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const exp = new Hono();

exp.get("/", (c: Context) => {
  return c.text("Experience route");
});

// Create a new experience
exp.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id; // Assuming userId comes from JWT middleware
  const formData = await c.req.formData();

  const img = formData.get("img");

  if (!(img instanceof File)) {
    const data = Object.fromEntries(formData.entries());
    try {
      const savedExperience = await prisma.experience.create({
        data: {
          ...data,
          userId,
        },
      });
      return c.json(savedExperience, 201);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  } else {
    const s3 = new S3Client({
      credentials: {
        accessKeyId: c.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
      },
      region: c.env.AWS_REGION,
    });
    const s3Params = {
      Bucket: c.env.AWS_BUCKET_NAME,
      Key: `images/${Date.now()}-${img.name}`,
      Body: img,
      ACL: ObjectCannedACL.public_read,
    };

    try {
      await s3.send(new PutObjectCommand(s3Params));
      const imageUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
      formData.set("img", imageUrl);
      const data = Object.fromEntries(formData.entries());
      try {
        const savedExperience = await prisma.experience.create({
          data: {
            ...data,
            userId,
          },
        });
        return c.json(savedExperience, 201);
      } catch (error) {
        return c.json({ error: (error as Error).message }, 500);
      }
    } catch (error) {
      return c.json(
        {
          error: `Failed to upload image. Error: ${error}`,
        },
        500
      );
    }
  }
});

// Get all experiences for a specific user via dynamic parameter or query parameter
exp.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id")
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const experiences = await prisma.experience.findMany({
    where: { userId },
  });
  return c.json(experiences, 200);
});

// Get a single experience for a specific user
exp.get("/:user_id/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id")
  const experienceId = c.req.param("id");

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const experience = await prisma.experience.findUnique({
    where: { id: experienceId, userId },
  });

  if (!experience) return c.json({ error: "Experience not found" }, 404);
  return c.json(experience, 200);
});

// Update an experience
exp.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  const img = formData.get("img");

  const experienceId = c.req.param("id");
  const existingExperience = await prisma.experience.findUnique({
    where: { id: experienceId },
  });

  if (!existingExperience) {
    return c.json({ error: "Experience not found" }, 404);
  }

  const s3 = new S3Client({
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
    },
    region: c.env.AWS_REGION,
  });

  if (
    existingExperience.img &&
    existingExperience.img.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
  ) {
    const previousKey = existingExperience.img.split(".com/")[1];
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: c.env.AWS_BUCKET_NAME,
          Key: previousKey,
        })
      );
    } catch (error) {
      return c.json({ error: `Failed to delete previous image: ${error}` }, 500);
    }
  }

  let newImageUrl: string | null = null;

  if (img instanceof File) {
    const s3Params = {
      Bucket: c.env.AWS_BUCKET_NAME,
      Key: `images/${Date.now()}-${img.name}`,
      Body: img,
      ACL: ObjectCannedACL.public_read,
    };

    try {
      await s3.send(new PutObjectCommand(s3Params));
      newImageUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
      formData.set("img", newImageUrl);
    } catch (error) {
      return c.json({ error: `Failed to upload image: ${error}` }, 500);
    }
  }

  const data = Object.fromEntries(formData.entries());

  if (newImageUrl) {
    data["img"] = newImageUrl;
  }

  try {
    const updatedExperience = await prisma.experience.update({
      where: { id: experienceId },
      data: data,
    });

    return c.json(updatedExperience, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Delete an experience 
exp.delete("/:id", async (c: Context) => {
  const prisma = c.get("prisma");

  const deletedExperience = await prisma.experience.delete({
    where: { id: c.req.param("id") },
  });

  if (!deletedExperience) return c.json({ error: "Experience not found" }, 404);
  return c.json({ message: "Experience deleted successfully" }, 200);
});

export default exp;
