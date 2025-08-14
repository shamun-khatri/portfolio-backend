import { Context, Hono } from "hono";

const bio = new Hono();

bio.get("/", (c: Context) => {
  return c.text("Bio route");
});

// Create a new bio

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

export default bio;
