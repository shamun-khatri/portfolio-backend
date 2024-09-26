import { Hono, Context } from "hono";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const pjt = new Hono();

// Create a new project
pjt.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  const img = formData.get("image");

  let imageUrl: string | null = null;

  if (img instanceof File) {
    // Handle S3 image upload (similar to previous code)
    imageUrl = await uploadToS3(img, c);
    formData.set("image", imageUrl);
  } else if (typeof img === "string" && img.startsWith("http")) {
    imageUrl = img;
  }

  const membersData = formData.get("member");
  const members = membersData ? JSON.parse(membersData.toString()) : [];

  const projectData = Object.fromEntries(formData.entries());
  delete projectData["member"];
  console.log("projectData", projectData);
  console.log("members", members);
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

    const { title, description, date, category, github, webapp } = projectData;

    // Single raw SQL query with CTE for both Project and Member insertions
    const savedProject = await prisma.$queryRaw`
      INSERT INTO "Project" (title, description, image, date, category, github, webapp)
      VALUES (${title}, ${description}, ${imageUrl}, ${date}, ${category}, ${github}, ${webapp})
      RETURNING *;
    `;

    const projectId = savedProject[0].id; // Get the newly created project's ID

    // Insert members if the array is not empty
    if (members.length > 0) {
      await prisma.$queryRaw`
        INSERT INTO "Member" (name, img, linkedin, github, "projectId")
        SELECT members.name, members.img, members.linkedin, members.github, ${projectId}
        FROM jsonb_to_recordset(${JSON.stringify(members)}::jsonb)
        AS members(name text, img text, linkedin text, github text);
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

// Get all projects
pjt.get("/", async (c: Context) => {
  const prisma = c.get("prisma");
  try {
    const projects = await prisma.project.findMany({
      include: { members: true },
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
pjt.get("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const projectId = Number(c.req.param("id"));

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
pjt.put("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const formData = await c.req.formData();
  const img = formData.get("image");

  const projectId = Number(c.req.param("id"));

  const existingProject = await prisma.$queryRaw`
    SELECT * FROM "Project" WHERE id = ${projectId};
  `;

  if (!existingProject.length) {
    return c.json({ error: "Project not found" }, 404);
  }

  let imageUrl: string | null = null;

  if (img instanceof File) {
    imageUrl = await uploadToS3(img, c, existingProject[0].image);
    formData.set("image", imageUrl);
  } else if (typeof img === "string" && img.startsWith("http")) {
    imageUrl = img;
  }

  const membersData = formData.get("member");
  const members = membersData ? JSON.parse(membersData.toString()) : [];

  const projectData = Object.fromEntries(formData.entries());
  delete projectData["member"];

  try {
    const { title, description, date, category, github, webapp } = projectData;

    // Prepare the fields to update (ignore null fields)
    const updateFields = [];
    if (title) updateFields.push(`title = '${title}'`);
    if (description) updateFields.push(`description = '${description}'`);
    if (date) updateFields.push(`date = '${date}'`);
    if (category) updateFields.push(`category = '${category}'`);
    if (github) updateFields.push(`github = '${github}'`);
    if (webapp) updateFields.push(`webapp = '${webapp}'`);
    if (imageUrl) updateFields.push(`image = '${imageUrl}'`);

    // Build the final update query
    const updateQuery = `
      UPDATE "Project"
      SET ${updateFields.join(', ')}
      WHERE id = ${projectId};
    `;

    // Execute the update query
    await prisma.$executeRawUnsafe(updateQuery);

    // Handle updating, inserting, or removing members
    if (members.length > 0) {
      for (const member of members) {
        if (member.id) {
          // Update existing member
          await prisma.$executeRaw`
            UPDATE "Member"
            SET name = ${member.name}, img = ${member.img}, linkedin = ${member.linkedin}, github = ${member.github}
            WHERE id = ${member.id} AND "projectId" = ${projectId};
          `;
        } else {
          // Insert new member
          await prisma.$executeRaw`
            INSERT INTO "Member" (name, img, linkedin, github, "projectId")
            VALUES (${member.name}, ${member.img}, ${member.linkedin}, ${member.github}, ${projectId});
          `;
        }
      }
    }

    // Retrieve the full project with members
    const fullProject = await prisma.$queryRaw`
      SELECT p.*, json_agg(m.*) AS members
      FROM "Project" p
      LEFT JOIN "Member" m ON p.id = m."projectId"
      WHERE p.id = ${projectId}
      GROUP BY p.id;
    `;

    return c.json(fullProject[0], 200);

  } catch (error) {
    return c.json(
      { error: `Failed to update project: ${(error as Error).message}` },
      500
    );
  }
});


// Delete a project by ID
pjt.delete("/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const projectId = Number(c.req.param("id"));

  try {
    // First, delete all members associated with this project
    await prisma.$executeRaw`
      DELETE FROM "Member" WHERE "projectId" = ${projectId};
    `;

    // Then, delete the project itself
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM "Project" WHERE id = ${projectId};
    `;

    if (deleteResult.count === 0) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({ message: `Project with ID ${projectId} and its members have been deleted.` }, 200);
  } catch (error) {
    return c.json(
      { error: `Failed to delete project: ${(error as Error).message}` },
      500
    );
  }
});

// Delete all projects
pjt.delete("/", async (c: Context) => {
  const prisma = c.get("prisma");

  try {
    // First, delete all members associated with projects
    await prisma.$executeRaw`
      DELETE FROM "Member";
    `;

    // Then, delete all projects
    await prisma.$executeRaw`
      DELETE FROM "Project";
    `;

    return c.json({ message: "All projects and their members have been deleted." }, 200);
  } catch (error) {
    return c.json(
      { error: `Failed to delete all projects: ${(error as Error).message}` },
      500
    );
  }
});


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

export default pjt;
