import { Hono, Context } from "hono";
import { serialize } from "object-to-formdata";
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

function jsonToFormData(jsonObject) {
  const formData = new FormData();

  for (const key in jsonObject) {
    if (jsonObject.hasOwnProperty(key)) {
      const value = jsonObject[key];

      // Handle file objects directly
      if (value instanceof File || value instanceof Blob) {
        formData.append(key, value, value.name || "untitled"); // Add filename for File objects
      } else if (typeof value === "object" && value !== null) {
        // Handle nested objects/arrays by stringifying them
        // Note: FormData flattens nested structures, so complex objects might need specific handling
        formData.append(key, JSON.stringify(value));
      } else {
        // Handle primitive values
        formData.append(key, value);
      }
    }
  }
  return formData;
}

// Create a new experience
exp.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id; // Assuming userId comes from JWT middleware

  console.log("userId:", userId);

  const contentType = c.req.header("Content-Type");

  let formData: FormData | Record<string, any> = {};
  let img: File | Blob | String | null = null;
  let skills: string[] = [];

  if (contentType?.includes("application/json")) {
    const data = await c.req.json();
    formData = jsonToFormData(data);

    const imgData: Record<string, any> = data.img[0];
    if (!imgData || !imgData["thumbUrl"]) {
      return c.json({ error: "Image data is missing or invalid" }, 400);
    }

    const base64Data = imgData["thumbUrl"].split(",")[1];
    const binaryData = atob(base64Data);
    const arrayBuffer = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      arrayBuffer[i] = binaryData.charCodeAt(i);
    }
    const blob = new Blob([arrayBuffer], { type: imgData["type"] });

    img = new File([blob], imgData["name"], { type: imgData["type"] });
    formData.set("img", img);
  } else if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    img = formData.get("img");

    // Convert skills[] to an array
    const skillsRaw = formData.get("skills");
    skills = skillsRaw ? JSON.parse(skillsRaw.toString()) : [];
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  if (!(img instanceof File)) {
    const data = Object.fromEntries(formData.entries());
    try {
      // Auto-assign position for new experience
      const highest = await prisma.experience.findFirst({ where: { userId }, orderBy: { position: "desc" } });
      const nextPosition = highest && typeof highest.position === "number" ? highest.position + 1 : 1;

      const savedExperience = await prisma.experience.create({
        data: {
          ...data,
          skills, // Pass the skills array
          userId,
          position: nextPosition,
        },
      });
      return c.json(savedExperience, 201);
    } catch (error) {
      console.error("Error saving experience:", error);
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
      delete data["skills[]"];
      try {
        // Auto-assign position for new experience
        const highest = await prisma.experience.findFirst({ where: { userId }, orderBy: { position: "desc" } });
        const nextPosition = highest && typeof highest.position === "number" ? highest.position + 1 : 1;

        const savedExperience = await prisma.experience.create({
          data: {
            ...data,
            skills, // Pass the skills array
            userId,
            position: nextPosition,
          },
        });
        return c.json(savedExperience, 201);
      } catch (error) {
        console.error("Error saving experience:", error);
        return c.json({ error: (error as Error).message }, 500);
      }
    } catch (error) {
      console.error("Error uploading image to S3:", error);
      return c.json(
        {
          error: `Failed to upload image. Error: ${error}`,
        },
        500
      );
    }
  }
});

// Get all experiences for a specific user via dynamic parameter
exp.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");
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
  const userId = c.req.param("user_id");
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
  // Auth check
  const userId = c.get("decodedToken")?.id; // Assuming userId comes from JWT middleware
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }
  const formData = await c.req.formData();
  const img = formData.get("img");

  const experienceId = c.req.param("id");
  const existingExperience = await prisma.experience.findUnique({
    where: { id: experienceId },
  });

  if (!existingExperience) {
    return c.json({ error: "Experience not found" }, 404);
  }

  // Ownership check
  if (existingExperience.userId !== userId) {
    return c.json({ error: "Forbidden: You do not own this resource" }, 403);
  }

  let newImageUrl: string | null = null;

  if (img instanceof File) {
    const s3 = new S3Client({
      credentials: {
        accessKeyId: c.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
      },
      region: c.env.AWS_REGION,
    });

    // Delete previous S3 image only if uploading a new image
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
        return c.json(
          { error: `Failed to delete previous image: ${error}` },
          500
        );
      }
    }

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
  } else if (typeof img === "string" && img.startsWith("http")) {
    newImageUrl = img;
  }

  // Convert FormData to a plain object safely (avoid relying on entries() typings)
  const data: Record<string, any> = {};
  for (const [key, value] of (formData as any)) {
    data[key] = value;
  }

  if (newImageUrl) {
    data["img"] = newImageUrl;
  }
  // Never allow changing ownership via update
  if ("userId" in data) delete (data as Record<string, unknown>)["userId"];

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

  const experienceId = c.req.param("id");
  const deletedExperience = await prisma.experience.delete({ where: { id: experienceId } });

  if (!deletedExperience) return c.json({ error: "Experience not found" }, 404);

  // Resequence remaining items for the user to keep positions contiguous
  try {
    const remaining = await prisma.experience.findMany({ where: { userId: deletedExperience.userId }, orderBy: { position: "asc" } });
    const updates = remaining.map((rec: any, idx: any) => prisma.experience.update({ where: { id: rec.id }, data: { position: idx + 1 } }));
    if (updates.length > 0) await prisma.$transaction(updates);
  } catch (err) {
    console.error("Failed to resequence positions after delete:", err);
  }

  return c.json({ message: "Experience deleted successfully" }, 200);
});

// Reorder experiences for the authenticated user.
// Expects JSON body: { order: ["expId1","expId2", ...] }
exp.patch("/reorder", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  if (!userId) return c.json({ error: "User ID is required" }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const order = body?.order;
  if (!Array.isArray(order) || order.length === 0) return c.json({ error: "`order` must be a non-empty array of ids" }, 400);

  // Ensure all provided ids belong to this user
  const items = await prisma.experience.findMany({ where: { id: { in: order }, userId } });
  if (items.length !== order.length) return c.json({ error: "One or more items not found or not owned by user" }, 403);

  const updates = order.map((id: string, idx: number) => prisma.experience.update({ where: { id }, data: { position: idx + 1 } }));

  try {
    await prisma.$transaction(updates);
    const updated = await prisma.experience.findMany({ where: { userId }, orderBy: { position: "asc" } });
    return c.json(updated, 200);
  } catch (err) {
    console.error("Failed to reorder experiences:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default exp;
