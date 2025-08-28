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
  const userId = c.get("decodedToken").id; // Assuming userId comes from JWT middleware

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const contentType = c.req.header("Content-Type");
  let formData: FormData | Record<string, any> = {};
  let img: File | Blob | String | null = null;

  if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    img = formData.get("img");

    // Upload image to S3 if it's a file
    if (img instanceof File) {
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
      } catch (error) {
        return c.json({ error: `Failed to upload image: ${error}` }, 500);
      }
    }
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  const data = Object.fromEntries(formData.entries());
  data["userId"] = userId; // Add userId to the data object

  try {
    const savedEducation = await prisma.education.create({
      data,
    });
    return c.json(savedEducation, 201);
  } catch (error) {
    console.error("Error saving education:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get all experiences for a specific user via dynamic parameter or query parameter
// Get all education records for a specific user
edu.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id"); // Get user_id from query or dynamic parameter

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  try {
    const educationRecords = await prisma.education.findMany({
      where: { userId },
    });

    if (educationRecords.length === 0) {
      return c.json(
        { message: "No education records found for this user" },
        404
      );
    }

    return c.json(educationRecords, 200);
  } catch (error) {
    console.error("Error fetching education records:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get Education by ID
edu.get("/:user_id/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const educationId = c.req.param("id");
  const userId = c.req.param("user_id");

  try {
    const education = await prisma.education.findUnique({
      where: { id: educationId, userId },
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
        {
          error: `Failed to delete previous image: ${(error as Error).message}`,
        },
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
