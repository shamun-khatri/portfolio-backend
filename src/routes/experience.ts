import { Hono, Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const exp = new Hono();

// Create a new experience
exp.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  console.log("formData", formData);
  // const body = await c.req.json();
  const img = formData.get("img");

  if (!(img instanceof File)) {
    console.log("No image found");
    const data = Object.fromEntries(formData.entries());
    const savedExperience = await prisma.experience.create({
      data: data,
    });
    return c.json(savedExperience, 201);
  } else {
    console.log("Image found");
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
      const savedExperience = await prisma.experience.create({
        data: data,
      });
      return c.json(savedExperience, 201);
    } catch (error) {
      return c.json(
        {
          error: `Failed to upload image
          Error: ${error}`,
        },
        500
      );
    }
  }
});

// Get all experiences
exp.get("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const experiences = await prisma.experience.findMany();
  return c.json(experiences, 200);
});

// Get a single experience
exp.get("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const experience = await prisma.experience.findUnique({
    where: { id: Number(c.req.param("id")) },
  });

  if (!experience) return c.json({ error: "Experience not found" }, 404);
  return c.json(experience, 200);
});

// Update an experience
exp.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const contentType = c.req.header("Content-Type") || "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Unsupported Content-Type" }, 400);
  }

  const formData = await c.req.formData();
  const img = formData.get("img");

  // Retrieve the existing experience data
  const experienceId = Number(c.req.param("id"));
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

  // Always delete the previous image from S3 if it was stored there
  if (
    existingExperience.img &&
    existingExperience.img.startsWith(
      `https://${c.env.AWS_BUCKET_NAME}.s3.`
    )
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
      console.error(`Failed to delete previous image: ${(error as Error).message}`);
      return c.json({ error: `Failed to delete previous image: ${(error as Error).message}` }, 500);
    }
  }

  let newImageUrl: string | null = null;

  // Handle new image upload if img is a file
  if (img instanceof File) {
    const s3Params = {
      Bucket: c.env.AWS_BUCKET_NAME,
      Key: `images/${Date.now()}-${img.name}`,
      Body: img,
      ContentType: img.type,
      ACL: ObjectCannedACL.public_read,
    };

    try {
      // Upload new image and get URL
      await s3.send(new PutObjectCommand(s3Params));
      newImageUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
      formData.set("img", newImageUrl);
    } catch (error) {
      return c.json({ error: `Failed to upload image: ${(error as Error).message}` }, 500);
    }
  } else if (typeof img === "string" && img.startsWith("http")) {
    // If img is a valid URL, directly use it
    newImageUrl = img;
  }

  // Convert FormData to a JSON-like object
  const data = Object.fromEntries(formData.entries());

  // Make sure to update with the correct image URL
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
    where: { id: Number(c.req.param("id")) },
  });

  if (!deletedExperience) return c.json({ error: "Experience not found" }, 404);
  return c.json({ message: "Experience deleted successfully" }, 200);
});

export default exp;
