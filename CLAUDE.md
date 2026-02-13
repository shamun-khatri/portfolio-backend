# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Cloudflare Workers** API backend for a portfolio application, built with:
- **Framework**: [Hono](https://hono.dev) (lightweight web framework for edge runtimes)
- **Runtime**: Cloudflare Workers (serverless edge functions)
- **Database**: PostgreSQL via [Neon](https://neon.tech) serverless
- **ORM**: Prisma with Neon HTTP adapter (`@prisma/adapter-neon`)
- **Authentication**: next-auth JWT tokens (auth is separate admin app at `portfolio-admin-jcbs.vercel.app`)
- **File Storage**: AWS S3 for image uploads

## Common Commands

```bash
# Development server (local Wrangler dev)
bun dev

# Deploy to production
bun deploy

# Database commands (all use .dev.vars for env)
bun db:generate          # Generate Prisma client
bun db:migrate:dev       # Create/run dev migrations
bun db:migrate:deploy    # Deploy migrations to production
bun db:seed              # Run database seeder
```

**Note**: The project uses Bun (`bun.lock`), but npm/yarn scripts are also configured. Environment variables are loaded from `.dev.vars` (not `.env`).

## Project Architecture

### Entry Point
[```src/index.ts```](src/index.ts) - Hono app setup with middleware chain:
1. `secureHeaders()` - Security headers
2. `logger()` - Request logging
3. `prisma()` - Database connection middleware (attaches Prisma client to context)
4. CORS handling - Public for GET, restricted origins for mutations
5. `verifyJWT()` - JWT validation for `/api/*` routes (skipped for GET requests)

### Database Layer
[```src/lib/db/connect-middleware.ts```](src/lib/db/connect-middleware.ts) - Prisma middleware using Neon HTTP adapter:
```typescript
// Attaches `prisma` to Hono context, accessible via c.get("prisma")
const adapter = new PrismaNeonHttp(c.env.DATABASE_URL, {});
```

### Authentication
[```src/lib/verify-token.ts```](src/lib/verify-token.ts) - JWT middleware using next-auth:
- Extracts token from `next-auth.session-token` cookie
- Uses `decode()` from `next-auth/jwt` with salt `"next-auth.session-token"`
- GET requests are public; POST/PUT/PATCH/DELETE require valid JWT

### Routes (REST API)
All routes mounted under `/api/` with CRUD operations:

| Route | File | Notes |
|-------|------|-------|
| `/api/experiences` | [`routes/experience.ts`](src/routes/experience.ts) | Position-based ordering, image uploads to S3 |
| `/api/education` | [`routes/education.ts`](src/routes/education.ts) | Similar pattern to experiences |
| `/api/projects` | [`routes/project.ts`](src/routes/project.ts) | Supports project members |
| `/api/users` | [`routes/user.ts`](src/routes/user.ts) | User management |
| `/api/bio` | [`routes/bio.ts`](src/routes/bio.ts) | Single bio per user |
| `/api/skills` | [`routes/skill.ts`](src/routes/skill.ts) | Skill categories |

### Data Models (Prisma)
See [```prisma/schema.prisma```](prisma/schema.prisma):
- **User**: Central entity; owns experiences, education, projects, skills, bio
- **Experience**: Work history with `position` field for ordering, `skills` array, optional S3 `doc`
- **Education**: Academic background with `position` ordering
- **Project**: Portfolio projects with `category`, `tags`, related `members`
- **Member**: Team members linked to projects
- **Skill**: Categorized skills with icons
- **Bio**: Single profile info (name, designations, desc, images) per user

### File Uploads
Images uploaded to AWS S3 via `@aws-sdk/client-s3`:
- Files stored in S3 bucket with key pattern: `images/{timestamp}-{filename}`
- Public-read ACL applied
- Previous images deleted on update to avoid orphaned files
- Base64 images from JSON payloads converted to Files before upload

### Environment Variables (Wrangler)
Defined in [```wrangler.toml```](wrangler.toml), loaded from `.dev.vars` locally:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME` - S3 config
- `NEXTAUTH_SECRET` - JWT verification secret (shared with auth app)

## Key Patterns

### Route Handler Pattern
```typescript
const router = new Hono();

// Access Prisma client from context
router.get("/:user_id", async (c) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id");
  // ... fetch data
});

// Ownership check for mutations
router.put("/:id", async (c) => {
  const userId = c.get("decodedToken").id;
  const existing = await prisma.experience.findUnique({ where: { id } });
  if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);
  // ... update
});
```

### Position-based Ordering
Experiences and education use integer `position` field for manual ordering:
- Auto-assigned on creation: `nextPosition = highest.position + 1`
- `/reorder` PATCH endpoint accepts `{ order: ["id1", "id2", ...] }`
- After delete, positions are resequenced to maintain contiguous values

### FormData Parsing
Routes accept both `application/json` and `multipart/form-data`:
- JSON payloads with base64 images converted to File objects
- Arrays like `skills[]` normalized to string arrays via `parseSkillsFromFormData()`
