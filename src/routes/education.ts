import { Hono, Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import uploadToS3 from "../lib/upload-to-s3";

const edu = new Hono();

// Create a new education
edu.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  const img = formData.get("img");

  let imageUrl: string | null = null;

  if (img instanceof File) {
    try {
      imageUrl = await uploadToS3(img, c); // Using the uploadToS3 function
      formData.set("img", imageUrl);
    } catch (error) {
      return c.json(
        { error: `Failed to upload image: ${(error as Error).message}` },
        500
      );
    }
  } else if (typeof img === "string" && img.startsWith("http")) {
    imageUrl = img;
  }

  const data = Object.fromEntries(formData.entries());
  if (imageUrl) data["img"] = imageUrl;

  try {
    const savedEducation = await prisma.education.create({ data });
    return c.json(savedEducation, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get all educations
edu.get("/", async (c: Context) => {
  const prisma = c.get("prisma");

  try {
    const educationRecords = await prisma.education.findMany();
    return c.json(educationRecords, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get Education by ID
edu.get("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const educationId = Number(c.req.param("id"));

  try {
    const education = await prisma.education.findUnique({
      where: { id: educationId },
    });

    if (!education) {
      return c.json({ error: "Education not found" }, 404);
    }

    return c.json(education, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Update education by ID
edu.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  const img = formData.get("img");
  const educationId = Number(c.req.param("id"));

  const existingEducation = await prisma.education.findUnique({
    where: { id: educationId },
  });

  if (!existingEducation) {
    return c.json({ error: "Education not found" }, 404);
  }

  let newImageUrl: string | null = null;

  // Delete previous image from S3 if it's stored there
  if (
    existingEducation.img &&
    existingEducation.img.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
  ) {
    try {
      const previousKey = existingEducation.img.split(".com/")[1];
      await uploadToS3(new File([], ""), c, existingEducation.img); // Reusing the same function to delete the previous image
    } catch (error) {
      return c.json(
        { error: `Failed to delete previous image: ${(error as Error).message}` },
        500
      );
    }
  }

  // Upload new image if a new image is provided
  if (img instanceof File) {
    try {
      newImageUrl = await uploadToS3(img, c); // Using the uploadToS3 function
      formData.set("img", newImageUrl);
    } catch (error) {
      return c.json(
        { error: `Failed to upload image: ${(error as Error).message}` },
        500
      );
    }
  } else if (typeof img === "string" && img.startsWith("http")) {
    newImageUrl = img;
  }

  const data = Object.fromEntries(formData.entries());
  if (newImageUrl) data["img"] = newImageUrl;

  try {
    const updatedEducation = await prisma.education.update({
      where: { id: educationId },
      data,
    });

    return c.json(updatedEducation, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Delete an education by ID
edu.delete("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const educationId = Number(c.req.param("id"));

  const existingEducation = await prisma.education.findUnique({
    where: { id: educationId },
  });

  if (!existingEducation) {
    return c.json({ error: "Education not found" }, 404);
  }

  // Delete image from S3 if it's stored there
  if (
    existingEducation.img &&
    existingEducation.img.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
  ) {
    try {
      const previousKey = existingEducation.img.split(".com/")[1];
      await uploadToS3(new File([], ""), c, existingEducation.img); // Reusing the same function to delete the previous image
    } catch (error) {
      console.error(`Failed to delete image: ${(error as Error).message}`);
    }
  }

  try {
    await prisma.education.delete({
      where: { id: educationId },
    });

    return c.json({ message: "Education deleted successfully" }, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});


export default edu;
