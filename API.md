# Portfolio Backend API Documentation

Base URL: `https://api.shamunkhatri.me` (production) / `http://localhost:8787` (local)

## Authentication

Most endpoints (except GET requests) require authentication via JWT token from next-auth session cookie.

| Auth Type | Method | Description |
|-----------|--------|-------------|
| JWT Session | Cookie | `next-auth.session-token` cookie from next-auth |
| Public | None | GET endpoints are publicly accessible |

**Note:** GET requests will automatically detect the user session. If the requester is the owner of the data, the API will include private fields (like `isPublished: false` items or sensitive metadata). Unauthenticated GET requests only return public data.

### Metadata & Privacy
Most entities support **Custom Fields** via a `metadata` JSON object. 
- When sending data via `multipart/form-data`, use the `metadata.<field_key>` syntax (e.g., `metadata.salaryRange`).
- Fields can be marked as **Private** in the backend schema. These fields will be automatically filtered out if the requester is not the data owner.

---

## Base Response Format

All responses are JSON.

**Success Response:**
```json
{
  "id": "cm0abc123...",
  "createdAt": "2024-01-15T10:30:00Z",
  ...
}
```

**Error Response:**
```json
{
  "error": "Error message description"
}
```

---

## Endpoints

### Custom Entities

Dynamic data structures defined by the user.

#### Custom Entity Types
Definitions for custom data (e.g., "Certificates", "Clients").

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name |
| slug | string | Yes | Unique URL identifier |
| description| string | No | Optional info |
| fields | JSON | Yes | Array of field definitions |

**Example Fields JSON:**
```json
[
  { "key": "issuedBy", "type": "text", "label": "Issued By", "required": true },
  { "key": "date", "type": "date", "label": "Date Received" }
]
```

- **GET `/api/custom-entity-types`**: List user's types.
- **POST `/api/custom-entity-types`**: Create type.
- **PUT `/api/custom-entity-types/:id`**: Update type.
- **DELETE `/api/custom-entity-types/:id`**: Delete type and all its instances.

#### Custom Entity Instances
The actual data following the schema.

- **GET `/api/custom-entities`**: List all instances.
- **GET `/api/custom-entities/type/:type_id`**: List instances of a specific type.
- **POST `/api/custom-entities`**: Create instance. 
  - Fields: `type_id`, `name`, `metadata.*`.
- **PUT `/api/custom-entities/:id`**: Update instance.
- **DELETE `/api/custom-entities/:id`**: Delete instance.

#### Public Access
- **GET `/api/users/:user_id/custom-entities/:type_slug/public`**: Public entries for a type (cached).

---

### Bio

User profile information. Only one bio per user.

#### GET `/api/bio/:user_id`
Get bio for a specific user.

**Cache:** 1 hour (3600 seconds)

**Response:**
```json
{
  "id": "cm0abc123...",
  "name": "John Doe",
  "designations": ["Full Stack Developer", "UI/UX Designer"],
  "desc": "A passionate developer...",
  "profileImage": "https://bucket.s3.region.amazonaws.com/...",
  "resumeUrl": "https://bucket.s3.region.amazonaws.com/...",
  "userId": "cm0user123...",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

#### POST `/api/bio`
Create a new bio for the authenticated user.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name |
| designations | string[] | Yes | Array of titles/roles |
| desc | string | Yes | Bio description |
| profileImage | File/string | Yes | Profile image (file upload or URL) |
| resumeUrl | string | No | Resume PDF URL |
| metadata.* | mixed | No | Custom fields (e.g., `metadata.twitter`) |

**Metadata Fields:**
- `metadata.twitter` (url)
- `metadata.github` (url)
- `metadata.linkedin` (url)
- `metadata.availability` (text)

**Response:** `201 Created`

---

#### PUT `/api/bio`
Update the authenticated user's bio.

**Content-Type:** `multipart/form-data`

Same fields as POST.

**Response:** `200 OK`

---

### Experience

Work experience entries with position-based ordering.

#### GET `/api/experiences/:user_id`
Get all experiences for a user (ordered by position ascending).

**Cache:** 5 minutes (300 seconds)

**Response:**
```json
[
  {
    "id": "cm0exp123...",
    "img": "https://...",
    "role": "Senior Developer",
    "company": "Tech Corp",
    "date": "2020 - Present",
    "desc": "Description...",
    "skills": ["React", "Node.js", "TypeScript"],
    "doc": "https://...",
    "userId": "cm0user123...",
    "position": 1,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

#### GET `/api/experiences/:user_id/:id`
Get a single experience.

**Response:** Single experience object.

---

#### POST `/api/experiences`
Create new experience (auto-assigns position to end of list).

**Content-Type:** `multipart/form-data` or `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| img | File/string | Yes | Image file or URL |
| role | string | Yes | Job title |
| company | string | Yes | Company name |
| date | string | Yes | Date range (free text) |
| desc | string | Yes | Job description |
| skills | string[] | Yes | Skills/tags array |
| doc | File/string | No | Document upload |
| metadata.* | mixed | No | Custom fields (e.g., `metadata.location`) |

**Metadata Fields:**
The following custom fields are recognized for experiences:
- `metadata.location` (text)
- `metadata.employmentType` (select: Full-time, Part-time, Contract, etc.)
- `metadata.salaryRange` (text)
- `metadata.isRemote` (boolean)
- `metadata.technologies` (multiselect)
- `metadata.achievements` (json)

**Response:** `201 Created`

---

#### PUT `/api/experiences/:id`
Update an experience.

Same fields as POST, plus:
- **Note:** `position` and `userId` cannot be changed via this endpoint.

**Response:** `200 OK`

---

#### DELETE `/api/experiences/:id`
Delete an experience (resequences remaining positions).

**Response:** `200 OK`
```json
{ "message": "Experience deleted successfully" }
```

---

#### PATCH `/api/experiences/reorder`
Reorder experiences.

**Content-Type:** `application/json`

| Field | Type | Description |
|-------|------|-------------|
| order | string[] | Array of experience IDs in desired order |

**Example:**
```json
{ "order": ["cm0exp3...", "cm0exp1...", "cm0exp2..."] }
```

**Note:** All IDs must belong to the authenticated user.

---

### Education

Education entries with position-based ordering.

#### GET `/api/education/:user_id`
Get all education entries (ordered by position).

**Cache:** 5 minutes

**Response:** Array of education objects.

---

#### POST `/api/education`
Create education entry.

| Field | Type | Required |
|-------|------|----------|
| school | string | Yes |
| degree | string | Yes |
| date | string | Yes |
| grade | string | Yes |
| desc | string | Yes |
| img | File/string | Yes |
| metadata.* | mixed | No | Custom fields |

**Metadata Fields:**
- `metadata.location` (text)
- `metadata.gpa` (number, **private**)
- `metadata.isOngoing` (boolean)

---

#### PUT `/api/education/:id`
Update education entry.

---

#### DELETE `/api/education/:id`
Delete education entry.

---

### Projects

Portfolio projects with members and tags.

#### GET `/api/projects/:user_id`
Get all projects for a user (ordered by position).

**Cache:** 5 minutes

**Response:**
```json
[
  {
    "id": "cm0proj123...",
    "title": "E-commerce Platform",
    "description": "A full-stack e-commerce solution...",
    "image": "https://...",
    "date": "2023",
    "tags": ["React", "Node.js", "PostgreSQL"],
    "category": "Web Application",
    "github": "https://github.com/...",
    "projectUrl": "https://demo.com",
    "position": 1,
    "userId": "cm0user123...",
    "members": [
      {
        "id": "cm0mem123...",
        "name": "Jane Smith",
        "img": "https://...",
        "linkedin": "https://linkedin.com/...",
        "github": "https://github.com/...",
        "projectId": "cm0proj123..."
      }
    ]
  }
]
```

---

#### GET `/api/projects/id/:id`
Get a single project with members.

---

#### POST `/api/projects`
Create new project.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Project title |
| description | string | Yes | Description |
| image | File/string | Yes | Project image |
| date | string | No | Year/date |
| tags | string[] | No | Array of tags |
| category | string | Yes | Project category |
| github | string | No | GitHub URL |
| projectUrl | string | No | Live demo URL |
| member | string | No | JSON string of members array |
| metadata.* | mixed | No | Custom fields |

**Metadata Fields:**
- `metadata.status` (select)
- `metadata.videoUrl` (url)
- `metadata.isPrivate` (boolean)

**Member Format:**
```json
[
  { 
    "name": "Jane", 
    "img": "...", 
    "linkedin": "...", 
    "github": "...",
    "metadata": { "role": "Lead Architect" } 
  }
]
```

**Response:** `201 Created`

---

#### PUT `/api/projects/:id`
Update project (includes member sync - creates/updates/deletes).

---

#### DELETE `/api/projects/:id`
Delete single project.

**Response:**
```json
{ "message": "Project deleted successfully" }
```

---

#### DELETE `/api/projects`
Delete ALL projects for authenticated user.

**Warning:** Destructive operation.

**Response:**
```json
{ "message": "All your projects and their members have been deleted." }
```

---

#### PATCH `/api/projects/reorder`
Reorder projects.

| Field | Type | Description |
|-------|------|-------------|
| order | string[] | Array of project IDs in order |

---

### Skills

User skills with categories.

#### GET `/api/skills/:user_id`
Get all skills for a user (grouped by category in frontend).

**Cache:** 5 minutes

**Response:**
```json
[
  {
    "id": "cm0skill123...",
    "name": "React",
    "icon": "SiReact",
    "category": "Frontend",
    "userId": "cm0user123..."
  }
]
```

---

#### POST `/api/skills`
Create skill.

| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |
| icon | string | Yes | Icon name (e.g., "SiReact") |
| category | string | Yes | Category name |
| metadata.* | mixed | No | Custom fields |

**Metadata Fields:**
- `metadata.proficiency` (number, 0-100)
- `metadata.yearsOfExperience` (number)
- `metadata.isFavorite` (boolean)

---

#### PUT `/api/skills/:id`
Update skill.

---

#### DELETE `/api/skills/:id`
Delete skill.

---

### Users

User management.

#### POST `/api/user`
Create a new user (public endpoint for initial signup).

| Field | Type | Required |
|-------|------|----------|
| email | string | Yes |
| name | string | Yes |
| googleId | string | Yes |
| avatar | string | No |

---

#### GET `/api/user/:id`
Get user by ID.

---

#### GET `/api/user`
Get all users.

---

#### DELETE `/api/user`
Delete authenticated user and all associated data.

---

## Common Patterns

### Image Uploads

Images can be uploaded in two ways:

1. **File Upload (multipart/form-data)**:
   - Send as `File` in FormData
   - Automatically uploaded to S3
   - Returns S3 URL

2. **Base64 JSON (application/json)**:
   - Send as base64 data URL
   - Backend converts to File
   - Then uploads to S3

### Position-based Ordering

`Experience`, `Education`, and `Project` support manual ordering via `position` field:
- Position starts at 1
- Auto-assigned when creating new items
- Use `PATCH /reorder` to reorder
- Positions are automatically resequenced after deletions

### Array Fields in FormData

Arrays like `skills[]` or `tags[]` can be sent multiple ways:
- `skills[]` = multiple FormData entries
- `skills` = JSON string array `["skill1", "skill2"]`
- `skills` = comma-separated string `"skill1,skill2"`

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no token) |
| 403 | Forbidden (not owner) |
| 404 | Not Found |
| 415 | Unsupported Content-Type |
| 500 | Internal Server Error |

---

## Rate Limits

Currently no rate limiting is implemented. Plan to add:
- 100 requests/minute for public GET endpoints
- 30 requests/minute for authenticated mutations

---

## Caching Strategy

| Endpoint | Cache Duration |
|----------|---------------|
| `/api/bio/*` | 1 hour (3600s) |
| `/api/experiences/*` | 5 minutes (300s) |
| `/api/education/*` | 5 minutes (300s) |
| `/api/projects/*` | 5 minutes (300s) |
| `/api/skills/*` | 5 minutes (300s) |
| `/api/users/*` | No cache |

Cache headers: `Cache-Control: public, max-age=<seconds>`
