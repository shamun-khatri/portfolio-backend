import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import exp from "./routes/experience";
import { prisma } from "./lib/db/connect-middleware";
import edu from "./routes/education";
import pjt from "./routes/project";

type Bindings = {
  DATABASE_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_BUCKET_NAME: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use(secureHeaders());
app.use(logger());

app.get("/", (c) => {
  return c.text("Hello Hono!");
});


// app.use("api/*", prisma()).basePath("api").route("/experiences", exp);

app.use("api/*", prisma());

app.route("/api/experiences", exp);

app.route("/api/education", edu);

app.route("/api/project", pjt);

app.onError((err, c) => {
  console.error(err.message);
  return c.json({ error: err.message }, 500);
});

export default app;
