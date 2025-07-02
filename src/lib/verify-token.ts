import { Context, Env, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { decode } from "next-auth/jwt";

export const verifyJWT = (): MiddlewareHandler =>
  createMiddleware<Env>(async (c: Context, next: any) => {
    const secret = c.env.NEXTAUTH_SECRET;
    // Skip JWT verification for GET requests
    if (c.req.method === "GET") {
      return await next();
    } else if (c.req.method === "POST" && c.req.path === "/api/user") {
      await next();
    }

    // get sesstion token from cookies in the request header
    const token = c.req.header("Cookie")?.split("; ")
    .find((row) => row.startsWith("next-auth.session-token="))
    ?.split("=")[1];

    // const token = c.req.header("Authorization")?.split(" ")[1]; // Extract token from Bearer Authorization header
    if (!token) {
      return c.json({ error: "No token provided" }, 401);
    }

    try {
      const decoded = await decode({
        token: token,
        secret: secret,
        salt: "", // Add your salt if needed, otherwise leave empty
      });

      if (!decoded) {
        return c.json({ error: "Invalid token" }, 401);
      }
      // You can store the decoded token in the context
      c.set("decodedToken", decoded);

      // Proceed to the next middleware/handler
      await next();
    } catch (error) {
      console.error("Error decoding token:", error);
      return c.json({ error: "Error decoding token" }, 401);
    }
  });
