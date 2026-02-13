import { Context, Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import exp from "./routes/experience";
import { prisma } from "./lib/db/connect-middleware";
import edu from "./routes/education";
import pjt from "./routes/project";
import { cors } from "hono/cors";
import { verifyJWT } from "./lib/verify-token";
import user from "./routes/user";
import bio from "./routes/bio";
import skills from "./routes/skill";
import { cacheLong, cacheMedium } from "./lib/cache-middleware";
import customEntities from "./routes/custom-entity";

type Bindings = {
  DATABASE_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_BUCKET_NAME: string;
  NEXTAUTH_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use(secureHeaders());
app.use(logger());

// app.use("api/*", prisma()).basePath("api").route("/experiences", exp);

app.use("/api/*", prisma());

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowedOrigins = [
    "http://localhost:3000",
    "https://portfolio-admin-jcbs.vercel.app",
    "https://app.shamunkhatri.me",
  ];

  if (origin && allowedOrigins.includes(origin)) {
    return cors({ origin, credentials: true })(c, next);
  }

  return cors({ origin: "*", credentials: false })(c, next);
});

// app.use("api/*", cors({ credentials: true, origin: "*" }));

app.get("/", (c: Context) => {
  //log the request url
  const url = c.req.url;
  console.log("Request URL: ", url);
  //  log the cookies comes with the request
  const cookies = c.req.header("cookie");
  console.log("Cookies: ", cookies);
  // log the headers comes with the request
  const headers = c.req.header();
  console.log("Headers: ", headers);
  return c.text("Hello Hono!");
});

app.notFound((c) => {
  return c.json({ error: "Route not found" }, 404);
});

// Apply cache middleware before JWT (GET requests are public and cached)
app.use("/api/bio/*", cacheLong);
app.use("/api/experiences/*", cacheMedium);
app.use("/api/education/*", cacheMedium);
app.use("/api/projects/*", cacheMedium);
app.use("/api/skills/*", cacheMedium);

// JWT verification (GET requests bypass auth check in verifyJWT middleware)
app.use("/api/*", verifyJWT());

// Mount routes
app.route("/api/experiences", exp);
app.route("/api/education", edu);
app.route("/api/projects", pjt);
app.route("/api/users", user);
app.route("/api/bio", bio);
app.route("/api/skills", skills);
app.route("/api", customEntities); // Custom entity routes (mounted at /api)

app.onError((err, c) => {
  console.error(err.message);
  return c.json({ error: err.message }, 500);
});

export default app;
