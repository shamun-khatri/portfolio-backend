import { Hono, Context } from "hono";
import {
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import cuid from "cuid";
import uploadToS3 from "../lib/upload-to-s3";

const pjt = new Hono();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const parseTagsFromFormData = (formData: FormData): string[] => {
  const rawTags = formData.getAll("tags[]");
  const fallback = rawTags.length ? rawTags : formData.getAll("tags");
  if (fallback.length > 1) {
    return fallback
      .map((t) => (typeof t === "string" ? t : ""))
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const single = fallback[0];
  if (typeof single === "string") {
    const trimmed = single.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((t) => String(t).trim()).filter(Boolean);
        }
      } catch {
        // fall through to comma parsing
      }
    }
    return trimmed
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return [];
};

// Create a new project
pjt.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken").id; // Assuming userId comes from JWT middleware
  // check content header
  console.log("Content-Type:", c.req.header("Content-Type"));
  const formData = await c.req.formData();
  const img = formData.get("image");
  console.log("Image:", img);
  console.log("Form Data image:", formData.get("image"));

  let imageUrl: string | null = null;

  if (img instanceof File) {
    // Handle S3 image upload (similar to previous code)
    try {
      imageUrl = await uploadToS3(img, c);
      formData.set("image", imageUrl);
      console.log("Image uploaded to S3:", imageUrl);
    } catch (error) {
      return c.json(
        { error: `Failed to upload image: ${getErrorMessage(error)}` },
        500
      );
    }
  } else if (typeof img === "string" && img.startsWith("http")) {
    imageUrl = img;
  }

  const membersData = formData.get("member");
  const members = membersData ? JSON.parse(membersData.toString()) : [];
  const tags = parseTagsFromFormData(formData);

  const projectData = Object.fromEntries(formData.entries());
  delete projectData["member"];
  delete projectData["tags[]"];
  delete projectData["tags"];
  console.log("projectData", projectData);
  console.log("members", members);
  console.log("type of members", typeof members);
  try {
    // const savedProject = await prisma.project.create({
    //   data: {
    //     ...projectData,
    //     image: imageUrl,
    //     members: {
    //       create: members,
    //     },
    //   },
    // });

    const projectId = cuid();
    const { title, description, date, category, github, projectUrl } = projectData;

    // Determine next position for this user's projects
    const highest = await prisma.project.findFirst({ where: { userId }, orderBy: { position: "desc" } });
    const nextPosition = highest && typeof highest.position === "number" ? highest.position + 1 : 1;

    // Single raw SQL query for Project insertion (include position)
    const savedProject = await prisma.$queryRaw`
      INSERT INTO "Project" (id, title, description, image, date, tags, category, github, "projectUrl", "userId", position)
      VALUES (${projectId}, ${title}, ${description}, ${imageUrl}, ${date}, ${tags}, ${category}, ${github}, ${projectUrl}, ${userId}, ${nextPosition})
      RETURNING *;
    `;

    // const projectId = savedProject[0].id; // Get the newly created project's ID

    // Insert members if the array is not empty
    if (members.length > 0) {
      // Add unique IDs to each member
      const membersWithIds = members.map((member) => ({
        id: cuid(),
        ...member,
      }));

      await prisma.$queryRaw`
        INSERT INTO "Member" (id, name, img, linkedin, github, "projectId")
        SELECT members.id, members.name, members.img, members.linkedin, members.github, ${projectId}
        FROM jsonb_to_recordset(${JSON.stringify(membersWithIds)}::jsonb)
        AS members(id text, name text, img text, linkedin text, github text);
      `;
    }

    // Retrieve the full project object including its members
    const fullProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: true, // Include members if they exist
      },
    });

    console.log("hereeee");
    return c.json(fullProject, 201); // Return the full project with members if available
  } catch (error) {
    return c.json(
      { error: `Failed to create project: ${(error as Error).message}` },
      500
    );
  }
});

// Get all projects for a specific user via dynamic parameter
pjt.get("/:user_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  try {
    const projects = await prisma.project.findMany({
      where: { userId },
      include: { members: true }, // Include members in the response
      orderBy: { position: "asc" },
    });
    return c.json(projects, 200);
  } catch (error) {
    return c.json(
      { error: `Failed to fetch projects: ${(error as Error).message}` },
      500
    );
  }
});

// Get a project by ID
pjt.get("/id/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const projectId = c.req.param("id");
  console.log("Project ID:", projectId);

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json(project, 200);
  } catch (error) {
    return c.json(
      { error: `Failed to fetch project: ${(error as Error).message}` },
      500
    );
  }
});

// update a project
// pjt.put("/:id", async (c: Context) => {
//   const prisma = c.get("prisma");
//   const formData = await c.req.formData();
//   const img = formData.get("image");

//   const projectId = c.req.param("id");

//   const existingProject = await prisma.$queryRaw`
//     SELECT * FROM "Project" WHERE id = ${projectId};
//   `;

//   if (!existingProject.length) {
//     return c.json({ error: "Project not found" }, 404);
//   }

//   let imageUrl: string | null = null;

//   if (img instanceof File) {
//     imageUrl = await uploadToS3(img, c, existingProject[0].image);
//     formData.set("image", imageUrl);
//   } else if (typeof img === "string" && img.startsWith("http")) {
//     imageUrl = img;
//   }

//   const membersData = formData.get("member");
//   const members = membersData ? JSON.parse(membersData.toString()) : [];

//   const projectData = Object.fromEntries(formData.entries());
//   delete projectData["member"];

//   try {
//     const { title, description, date, category, github, projectUrl } =
//       projectData;

//     // Prepare the fields to update (ignore null fields)
//     const updateFields = [];
//     if (title) updateFields.push(`title = '${title}'`);
//     if (description) updateFields.push(`description = '${description}'`);
//     if (date) updateFields.push(`date = '${date}'`);
//     if (category) updateFields.push(`category = '${category}'`);
//     if (github) updateFields.push(`github = '${github}'`);
//     if (projectUrl) updateFields.push(`projectUrl = '${projectUrl}'`);
//     if (imageUrl) updateFields.push(`image = '${imageUrl}'`);

//     // Build the final update query
//     const updateQuery = `
//       UPDATE "Project"
//       SET ${updateFields.join(", ")}
//       WHERE id = '${projectId}';
//     `;

//     // Execute the update query
//     await prisma.$executeRawUnsafe(updateQuery);

//     // Handle updating, inserting, or removing members
//     if (members.length > 0) {
//       for (const member of members) {
//         if (member.id) {
//           // Update existing member
//           await prisma.$executeRaw`
//             UPDATE "Member"
//             SET name = ${member.name}, img = ${member.img}, linkedin = ${member.linkedin}, github = ${member.github}
//             WHERE id = ${member.id} AND "projectId" = ${projectId};
//           `;
//         } else {
//           // Insert new member
//           await prisma.$executeRaw`
//             INSERT INTO "Member" (name, img, linkedin, github, "projectId")
//             VALUES (${member.name}, ${member.img}, ${member.linkedin}, ${member.github}, ${projectId});
//           `;
//         }
//       }
//     }

//     // Retrieve the full project with members
//     const fullProject = await prisma.$queryRaw`
//       SELECT p.*, json_agg(m.*) AS members
//       FROM "Project" p
//       LEFT JOIN "Member" m ON p.id = m."projectId"
//       WHERE p.id = ${projectId}
//       GROUP BY p.id;
//     `;

//     return c.json(fullProject[0], 200);
//   } catch (error) {
//     return c.json(
//       { error: `Failed to update project: ${(error as Error).message}` },
//       500
//     );
//   }
// });

pjt.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const projectId = c.req.param("id"); // cuid string

  // Auth check
  const userId = c.get("decodedToken")?.id;
  if (!userId) {
    return c.json({ error: "User ID is required" }, 401);
  }

  // Ensure project exists and belongs to user
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });
  if (!existing) return c.json({ error: "Project not found" }, 404);
  if (existing.userId !== userId) {
    return c.json({ error: "Forbidden: You do not own this resource" }, 403);
  }

  const formData = await c.req.formData();
  console.log("Form Data:", formData);
  const img = formData.get("image");
  let imageUrl: string | null = null;

  if (img instanceof File) {
    try {
      imageUrl = await uploadToS3(img, c, existing.image);
    } catch (error) {
      return c.json(
        { error: `Failed to upload image: ${getErrorMessage(error)}` },
        500
      );
    }
  } else if (typeof img === "string" && img.startsWith("http")) {
    imageUrl = img;
  }

  const membersRaw = formData.get("member");
  const incomingMembers = membersRaw ? JSON.parse(membersRaw.toString()) : [];
  const hasTags =
    formData.getAll("tags[]").length > 0 ||
    formData.getAll("tags").length > 0;
  const tags = hasTags ? parseTagsFromFormData(formData) : null;

  // Build partial update data safely
  const data: any = {};
  const simpleFields = [
    "title",
    "description",
    "date",
    "category",
    "github",
    "projectUrl",
  ];
  for (const f of simpleFields) {
    const v = formData.get(f);
    if (typeof v === "string" && v.trim() !== "") data[f] = v;
  }
  if (hasTags) data.tags = tags ?? [];
  if (imageUrl) data.image = imageUrl;

  // Update project (if there is at least one field to change)
  let updatedProject;
  if (Object.keys(data).length > 0) {
    updatedProject = await prisma.project.update({
      where: { id: projectId },
      data,
    });
  } else {
    updatedProject = existing;
  }

  // Sync members (create / update / delete removed)
  if (Array.isArray(incomingMembers)) {
    const existingIds = new Set(existing.members.map((m) => m.id));
    const incomingIds = new Set(
      incomingMembers.filter((m) => m.id).map((m) => m.id)
    );

    // Delete members that were removed
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await prisma.member.deleteMany({
        where: { id: { in: toDelete }, projectId },
      });
    }

    // Upsert incoming members
    for (const m of incomingMembers) {
      if (m.id && existingIds.has(m.id)) {
        await prisma.member.update({
          where: { id: m.id },
          data: {
            name: m.name,
            img: m.img,
            linkedin: m.linkedin,
            github: m.github,
          },
        });
      } else {
        await prisma.member.create({
          data: {
            name: m.name,
            img: m.img,
            linkedin: m.linkedin,
            github: m.github,
            projectId,
          },
        });
      }
    }
  }

  // Return fresh project with members
  const fullProject = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });

  return c.json(fullProject, 200);
});

// Delete a project by ID
pjt.delete("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const projectId = c.req.param("id");

  // Auth check
  const userId = c.get("decodedToken")?.id;
  if (!userId) {
    return c.json({ error: "User ID is required" }, 401);
  }

  try {
    // Use Prisma client to delete members and project, and resequence positions
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!existing) return c.json({ error: "Project not found" }, 404);

    // Ownership check
    if (existing.userId !== userId) {
      return c.json({ error: "Forbidden: You do not own this resource" }, 403);
    }

    // Delete image from S3 if it's stored there
    if (
      existing.image &&
      existing.image.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)
    ) {
      try {
        const previousKey = existing.image.split(".com/")[1];
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
        console.error(`Failed to delete image: ${(error as Error).message}`);
      }
    }

    await prisma.member.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });

    // Resequence remaining projects for the user
    try {
      const remaining = await prisma.project.findMany({
        where: { userId },
        orderBy: { position: "asc" },
      });
      const updates = remaining.map((rec: any, idx: any) =>
        prisma.project.update({
          where: { id: rec.id },
          data: { position: idx + 1 },
        })
      );
      if (updates.length > 0) await Promise.all(updates);
    } catch (err) {
      console.error("Failed to resequence projects after delete:", err);
    }

    return c.json(
      {
        message: `Project with ID ${projectId} and its members have been deleted.`,
      },
      200
    );
  } catch (error) {
    return c.json(
      { error: `Failed to delete project: ${(error as Error).message}` },
      500
    );
  }
});

// Delete all projects for authenticated user
pjt.delete("/", async (c: Context) => {
  const prisma = c.get("prisma");

  // Auth check
  const userId = c.get("decodedToken")?.id;
  if (!userId) {
    return c.json({ error: "User ID is required" }, 401);
  }

  try {
    // Find all projects for this user to delete their images and members first
    const userProjects = await prisma.project.findMany({
      where: { userId },
      select: { id: true, image: true },
    });
    const projectIds = userProjects.map((p) => p.id);

    if (projectIds.length > 0) {
      // 1. Delete images from S3
      const s3 = new S3Client({
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
        region: c.env.AWS_REGION,
      });

      for (const p of userProjects) {
        if (p.image && p.image.startsWith(`https://${c.env.AWS_BUCKET_NAME}.s3.`)) {
          try {
            const key = p.image.split(".com/")[1];
            await s3.send(new DeleteObjectCommand({ Bucket: c.env.AWS_BUCKET_NAME, Key: key }));
          } catch (e) {
            console.error(`Failed to delete image for project ${p.id}:`, e);
          }
        }
      }

      // 2. Delete members
      await prisma.member.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 3. Delete projects
      await prisma.project.deleteMany({
        where: { userId },
      });
    }

    return c.json(
      { message: "All your projects and their members have been deleted." },
      200
    );
  } catch (error) {
    return c.json(
      { error: `Failed to delete all projects: ${(error as Error).message}` },
      500
    );
  }
});

// Reorder projects for the authenticated user.
// Expects JSON body: { order: ["projId1","projId2", ...] }
pjt.patch("/reorder", async (c: Context) => {
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
  const items = await prisma.project.findMany({ where: { id: { in: order }, userId } });
  if (items.length !== order.length) return c.json({ error: "One or more items not found or not owned by user" }, 403);

  const updates = order.map((id: string, idx: number) => prisma.project.update({ where: { id }, data: { position: idx + 1 } }));

  try {
    await Promise.all(updates);
    const updated = await prisma.project.findMany({ where: { userId }, orderBy: { position: "asc" }, include: { members: true } });
    return c.json(updated, 200);
  } catch (err) {
    console.error("Failed to reorder projects:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default pjt;
