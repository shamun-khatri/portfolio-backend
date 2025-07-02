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

app.use("api/*", prisma());
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
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

app.use('/api/*', verifyJWT());

app.route("/api/experience", exp);

app.route("/api/education", edu);

app.route("/api/project", pjt);

app.route("/api/user", user);

app.onError((err, c) => {
  console.error(err.message);
  return c.json({ error: err.message }, 500);
});

export default app;
