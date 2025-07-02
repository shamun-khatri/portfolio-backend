import { Hono, Context } from "hono";

const user = new Hono();

// Create or update user based on Google Auth data
user.post("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const { id, name, email, avatar, googleId } = await c.req.json();

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, avatar, googleId },
      create: { id, name, email, avatar, googleId },
    });
    return c.json(user, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get user by email
user.get("/getuser", async (c: Context) => {
  const prisma = c.get("prisma");
  const email = c.req.query("email");

  try {
    const user = await prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        name: true,
        // Exclude createdAt to isolate the issue
        // createdAt: true,
        // updatedAt: true,
      },    
    });
    if (!user) {
      // Return an empty array
      return c.json([], 200);
    }
    return c.json([user], 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get user profile
user.get("/profile", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("userId");

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        experiences: true,
        educations: true,
        projects: true,
      },
    });
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Update user profile
user.put("/profile", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("userId");
  const { name, avatar } = await c.req.json();

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, avatar },
    });
    return c.json(updatedUser, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Delete user account
user.delete("/", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("userId");

  try {
    await prisma.user.delete({
      where: { id: userId },
    });
    return c.json({ message: "User account deleted successfully" }, 200);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

export default user;
