import { Hono, Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import uploadToS3 from "../lib/upload-to-s3";
import {
  parseMetadata,
  sanitizeMetadata,
  filterMetadataBySchema,
  SKILL_FIELD_SCHEMA,
} from "../lib/custom-fields";

const skills = new Hono();

// Create a new skill
skills.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id;

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const contentType = c.req.header("Content-Type");
  let formData: FormData | Record<string, any> = {};
  let icon: File | Blob | String | null = null;

  if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    icon = formData.get("icon");

    // Upload icon to S3 if it's a file
    if (icon instanceof File) {
      const s3 = new S3Client({
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
        region: c.env.AWS_REGION,
      });

      const s3Params = {
        Bucket: c.env.AWS_BUCKET_NAME,
        Key: `icons/${Date.now()}-${icon.name}`,
        Body: icon,
        ACL: ObjectCannedACL.public_read,
      };

      try {
        await s3.send(new PutObjectCommand(s3Params));
        const iconUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
        formData.set("icon", iconUrl);
      } catch (error) {
        return c.json({ error: `Failed to upload icon: ${error}` }, 500);
      }
    }
  } else if (contentType?.includes("application/json")) {
    const jsonData = await c.req.json();
    
    // Convert JSON to FormData-like object for consistent handling
    formData = jsonData;
    icon = jsonData.icon;

    // Handle base64 icon data if provided
    if (icon && typeof icon === "string" && icon.startsWith("data:")) {
      try {
        const [header, base64Data] = icon.split(",");
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        
        const binaryData = atob(base64Data);
        const arrayBuffer = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          arrayBuffer[i] = binaryData.charCodeAt(i);
        }
        
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const file = new File([blob], `icon-${Date.now()}.${mimeType.split('/')[1]}`, { type: mimeType });

        const s3 = new S3Client({
          credentials: {
            accessKeyId: c.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
          },
          region: c.env.AWS_REGION,
        });

        const s3Params = {
          Bucket: c.env.AWS_BUCKET_NAME,
          Key: `icons/${Date.now()}-${file.name}`,
          Body: file,
          ACL: ObjectCannedACL.public_read,
        };

        await s3.send(new PutObjectCommand(s3Params));
        const iconUrl = `https://${s3Params.Bucket}.s3.${c.env.AWS_REGION}.amazonaws.com/${s3Params.Key}`;
        (formData as any).icon = iconUrl;
      } catch (error) {
        return c.json({ error: `Failed to process base64 icon: ${error}` }, 500);
      }
    }
  } else {
    return c.json({ error: "Unsupported Content-Type" }, 415);
  }

  // Convert formData to a plain object safely
  const data: Record<string, any> = {};
  if (formData instanceof FormData) {
    for (const [key, value] of (formData as any)) {
      data[key] = value;
    }
  } else {
    Object.assign(data, formData);
  }
  data["userId"] = userId;

  const metadata = parseMetadata(formData, SKILL_FIELD_SCHEMA);

  try {
    const savedSkill = await prisma.skill.create({
      data: {
        name: data.name,
        icon: data.icon,
        category: data.category,
        userId: data.userId,
        metadata: sanitizeMetadata(metadata),
      },
    });
    return c.json(savedSkill, 201);
  } catch (error) {
    console.error("Error saving skill:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get all skills for a specific user
skills.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const decodedToken = c.get("decodedToken");
  const isOwner = decodedToken && decodedToken.id === userId;

  try {
    const skillRecords = await prisma.skill.findMany({
      where: { userId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    if (skillRecords.length === 0) {
      return c.json({ message: "No skills found for this user" }, 404);
    }

    const sanitizedRecords = skillRecords.map((skill: any) => ({
      ...skill,
      metadata: filterMetadataBySchema(
        skill.metadata,
        SKILL_FIELD_SCHEMA,
        isOwner
      ),
    }));

    return c.json(sanitizedRecords, 200);
  } catch (error) {
    console.error("Error fetching skills:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get skills grouped by category for a specific user
skills.get("/:user_id/grouped", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const decodedToken = c.get("decodedToken");
  const isOwner = decodedToken && decodedToken.id === userId;

  try {
    const skillRecords = await prisma.skill.findMany({
      where: { userId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    if (skillRecords.length === 0) {
      return c.json({ message: "No skills found for this user" }, 404);
    }

    // Group skills by category and filter metadata
    const groupedSkills = skillRecords.reduce(
      (acc: Record<string, any[]>, skill: any) => {
        const category = skill.category || "Other";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push({
          ...skill,
          metadata: filterMetadataBySchema(
            skill.metadata,
            SKILL_FIELD_SCHEMA,
            isOwner
          ),
        });
        return acc;
      },
      {} as Record<string, any[]>
    );

    return c.json(groupedSkills, 200);
  } catch (error) {
    console.error("Error fetching grouped skills:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get skill by ID
skills.get("/:user_id/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const skillId = c.req.param("id");
  const userId = c.req.param("user_id");

  const decodedToken = c.get("decodedToken");
  const isOwner = decodedToken && decodedToken.id === userId;

  try {
    const skill = await prisma.skill.findFirst({
      where: { id: skillId, userId },
    });

    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(
      {
        ...skill,
        metadata: filterMetadataBySchema(
          skill.metadata,
          SKILL_FIELD_SCHEMA,
          isOwner
        ),
      },
      200
    );
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Update skill by ID
skills.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  
  if (!userId) {
    return c.json({ error: "User ID is required" }, 401);
  }

  const skillId = c.req.param("id");
  const existingSkill = await prisma.skill.findUnique({
    where: { id: skillId },
  });

  if (!existingSkill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (existingSkill.userId !== userId) {
    return c.json({ error: "Forbidden: You do not own this resource" }, 403);
  }

  const contentType = c.req.header("Content-Type");
  let formData: FormData | Record<string, any> = {};
  let icon: File | Blob | String | null = null;
  let newIconUrl: string | null = null;

  if (contentType?.includes("multipart/form-data")) {
    formData = await c.req.formData();
    icon = formData.get("icon");
  } else if (contentType?.includes("application/json")) {
    formData = await c.req.json();
    icon = (formData as any).icon;
  }

  // Handle icon update
  if (icon instanceof File) {
    try {
      newIconUrl = await uploadToS3(icon, c, existingSkill.icon);
    } catch (error) {
      return c.json(
        { error: `Failed to upload icon: ${(error as Error).message}` },
        500
      );
    }
  } else if (typeof icon === "string") {
    if (icon.startsWith("data:")) {
      // Handle base64 icon
      try {
        const [header, base64Data] = icon.split(",");
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        
        const binaryData = atob(base64Data);
        const arrayBuffer = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          arrayBuffer[i] = binaryData.charCodeAt(i);
        }
        
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const file = new File([blob], `icon-${Date.now()}.${mimeType.split('/')[1]}`, { type: mimeType });

        newIconUrl = await uploadToS3(file, c, existingSkill.icon);
      } catch (error) {
        return c.json(
          { error: `Failed to process base64 icon: ${(error as Error).message}` },
          500
        );
      }
    } else if (icon.startsWith("http")) {
      // External URL or existing S3 URL
      newIconUrl = icon;
    } else {
      // Icon class name or font icon (like "fa-javascript", "devicon-javascript-plain")
      newIconUrl = icon;
    }
  }

  // Convert formData to a plain object safely
  const data: Record<string, any> = {};
  if (formData instanceof FormData) {
    for (const [key, value] of (formData as any)) {
      data[key] = value;
    }
  } else {
    Object.assign(data, formData);
  }

  if (newIconUrl) data["icon"] = newIconUrl;
  
  // Never allow changing ownership via update
  if ("userId" in data) delete (data as Record<string, unknown>)["userId"];

  const metadata = parseMetadata(formData, SKILL_FIELD_SCHEMA);

  try {
    const updatedSkill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        name: data.name || existingSkill.name,
        icon: data.icon || existingSkill.icon,
        category: data.category || existingSkill.category,
        metadata: Object.keys(metadata).length > 0 ? sanitizeMetadata(metadata) : existingSkill.metadata,
      },
    });

    return c.json(updatedSkill, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Delete skill by ID
skills.delete("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const skillId = c.req.param("id");
  const userId = c.get("decodedToken")?.id;

  if (!userId) {
    return c.json({ error: "User ID is required" }, 401);
  }

  const existingSkill = await prisma.skill.findUnique({
    where: { id: skillId },
  });

  if (!existingSkill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (existingSkill.userId !== userId) {
    return c.json({ error: "Forbidden: You do not own this resource" }, 403);
  }

  // Delete icon from S3 if it's stored there
  if (
    existingSkill.icon &&
    existingSkill.icon.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
  ) {
    try {
      const previousKey = existingSkill.icon.split(".com/")[1];
      const s3 = new S3Client({
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
        region: c.env.AWS_REGION,
      });
      await s3.send(
        new DeleteObjectCommand({
          Bucket: c.env.AWS_BUCKET_NAME,
          Key: previousKey,
        })
      );
    } catch (error) {
      console.error(`Failed to delete icon: ${(error as Error).message}`);
    }
  }

  try {
    await prisma.skill.delete({
      where: { id: skillId },
    });

    return c.json({ message: "Skill deleted successfully" }, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

export default skills;
