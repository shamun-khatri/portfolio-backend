import type { Context, Env, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { neon } from "@neondatabase/serverless";
import { PrismaNeonHTTP } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

export const prisma = (): MiddlewareHandler =>
  createMiddleware<Env>(async (c: Context, next: any) => {
    if (!c.get("prisma")) {
      const connectionString = c.env.DATABASE_URL;
      const sql = neon(connectionString);
      const adapter = new PrismaNeonHTTP(sql);
      c.set("prisma", new PrismaClient({ adapter }));
    }

    await next();
  });
