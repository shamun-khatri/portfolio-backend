import { Hono, Context } from "hono";
import { z } from "zod";
import cuid from "cuid";

/**
 * Custom Entity Router
 * Allows users to define their own entity types (Case Studies, Clients, Certifications, etc.)
 * with custom fields and create unlimited instances.
 */

const router = new Hono();

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "url",
  "email",
  "select",
  "multiselect",
  "color",
  "richtext",
  "json",
  "image",
  "file",
] as const;

const normalizeFieldType = (value: unknown): string => {
  if (typeof value !== "string") return String(value ?? "");
  const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, "");

  const aliases: Record<string, string> = {
    rich: "richtext",
    richtextfield: "richtext",
    markdown: "richtext",
    multiselectfield: "multiselect",
    multipleselect: "multiselect",
    checkbox: "boolean",
    media: "image",
  };

  return aliases[normalized] ?? normalized;
};

const normalizeFieldSchema = (schema: unknown): unknown => {
  if (!Array.isArray(schema)) return schema;

  return schema.map((field) => {
    if (!field || typeof field !== "object") return field;
    const typedField = field as Record<string, unknown>;
    return {
      ...typedField,
      type: normalizeFieldType(typedField.type),
    };
  });
};

// Validation schema for field definition
const FieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  isPrivate: z.boolean().default(false),
  defaultValue: z.any().optional(),
  options: z.array(z.string()).default([]),
  description: z.string().optional(),
  validation: z.object({
    pattern: z.string().optional(),
    message: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
});

// Schema for creating/updating entity type
const EntityTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isPublic: z.boolean().default(true),
  fieldSchema: z.array(FieldDefinitionSchema).min(1, "At least one field required"),
});

// ==================== CUSTOM ENTITY TYPE ROUTES ====================

// GET /api/custom-entity-types - List user's custom entity types
router.get("/custom-entity-types", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const types = await prisma.customEntityType.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      include: {
        _count: {
          select: { entities: true }
        }
      }
    });

    return c.json(types);
  } catch (error) {
    console.error("Error fetching custom entity types:", error);
    return c.json({ error: "Failed to fetch entity types" }, 500);
  }
});

// POST /api/custom-entity-types - Create new entity type
router.post("/custom-entity-types", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    if (body?.fieldSchema) {
      body.fieldSchema = normalizeFieldSchema(body.fieldSchema);
    }
    const validated = EntityTypeSchema.parse(body);

    // Check for duplicate slug
    const existing = await prisma.customEntityType.findUnique({
      where: { userId_slug: { userId, slug: validated.slug } },
    });

    if (existing) {
      return c.json({ error: "Entity type with this slug already exists" }, 409);
    }

    // Get next position
    const lastType = await prisma.customEntityType.findFirst({
      where: { userId },
      orderBy: { position: "desc" },
    });
    const position = (lastType?.position ?? 0) + 1;

    const newType = await prisma.customEntityType.create({
      data: {
        ...validated,
        fieldSchema: validated.fieldSchema as any,
        userId,
        position,
      },
    });

    return c.json(newType, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.issues }, 400);
    }
    console.error("Error creating custom entity type:", error);
    return c.json({ error: "Failed to create entity type" }, 500);
  }
});

// GET /api/custom-entity-types/:id - Get single entity type
router.get("/custom-entity-types/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const entityType = await prisma.customEntityType.findFirst({
      where: { id, userId },
      include: {
        entities: {
          where: { isPublished: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!entityType) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    return c.json(entityType);
  } catch (error) {
    console.error("Error fetching entity type:", error);
    return c.json({ error: "Failed to fetch entity type" }, 500);
  }
});

// PUT /api/custom-entity-types/:id - Update entity type
router.put("/custom-entity-types/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    if (body?.fieldSchema) {
      body.fieldSchema = normalizeFieldSchema(body.fieldSchema);
    }
    const validated = EntityTypeSchema.partial().parse(body);

    // Verify ownership
    const existing = await prisma.customEntityType.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    // Check slug uniqueness if changing
    if (validated.slug && validated.slug !== existing.slug) {
      const duplicate = await prisma.customEntityType.findUnique({
        where: { userId_slug: { userId, slug: validated.slug } },
      });
      if (duplicate) {
        return c.json({ error: "Slug already in use" }, 409);
      }
    }

    const updated = await prisma.customEntityType.update({
      where: { id },
      data: {
        ...validated,
        fieldSchema: validated.fieldSchema as any,
      },
    });

    return c.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.issues }, 400);
    }
    console.error("Error updating entity type:", error);
    return c.json({ error: "Failed to update entity type" }, 500);
  }
});

// DELETE /api/custom-entity-types/:id - Delete entity type (and all instances)
router.delete("/custom-entity-types/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify ownership
    const existing = await prisma.customEntityType.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    await prisma.customEntityType.delete({ where: { id } });

    return c.json({ message: "Entity type and all its data deleted" });
  } catch (error) {
    console.error("Error deleting entity type:", error);
    return c.json({ error: "Failed to delete entity type" }, 500);
  }
});

// PATCH /api/custom-entity-types/reorder - Reorder entity types
router.patch("/custom-entity-types/reorder", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const order = body.order as string[];

    if (!Array.isArray(order)) {
      return c.json({ error: "Order must be an array of IDs" }, 400);
    }

    // Verify all IDs belong to user
    const userTypes = await prisma.customEntityType.findMany({
      where: { userId },
      select: { id: true },
    });
    const userTypeIds = new Set(userTypes.map((t: { id: string }) => t.id));
    const invalid = order.filter((id) => !userTypeIds.has(id));

    if (invalid.length > 0) {
      return c.json({ error: "Invalid entity type IDs" }, 403);
    }

    // Update positions
    const updates = order.map((id, idx) =>
      prisma.customEntityType.update({
        where: { id },
        data: { position: idx + 1 },
      })
    );

    await Promise.all(updates);

    return c.json({ message: "Reordered successfully" });
  } catch (error) {
    console.error("Error reordering entity types:", error);
    return c.json({ error: "Failed to reorder" }, 500);
  }
});

// ==================== CUSTOM ENTITY INSTANCES ====================

// GET /api/custom-entities - List all instances for the user
router.get("/custom-entities", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const entities = await prisma.customEntity.findMany({
      where: {
        entityType: { userId }
      },
      include: {
        entityType: true
      },
      orderBy: { createdAt: "desc" }
    });

    return c.json(entities);
  } catch (error) {
    console.error("Error fetching all custom entities:", error);
    return c.json({ error: "Failed to fetch entities" }, 500);
  }
});

// GET /api/users/:user_id/custom-entities/:type_slug/public - Public access to entities
router.get("/users/:user_id/custom-entities/:type_slug/public", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.req.param("user_id"); // From URL param
  const slug = c.req.param("type_slug");

  try {
    const entityType = await prisma.customEntityType.findFirst({
      where: {
        userId,
        slug,
        isPublic: true,
      },
      include: {
        entities: {
          where: { isPublished: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!entityType) {
      return c.json({ error: "Not found" }, 404);
    }

    const decodedToken = c.get("decodedToken");
    const isOwner = decodedToken && decodedToken.id === userId;

    // Filter sensitive fields if not the owner
    if (!isOwner) {
      const fieldSchema = (entityType.fieldSchema as any[]) || [];
      const privateKeys = new Set(
        fieldSchema.filter((f) => f.isPrivate).map((f) => f.key)
      );

      entityType.entities = entityType.entities.map((ent: any) => {
        const filteredMetadata: any = {};
        const metadata = ent.metadata as any;
        if (metadata) {
          for (const [key, value] of Object.entries(metadata)) {
            if (!privateKeys.has(key) && !key.startsWith("_")) {
              filteredMetadata[key] = value;
            }
          }
        }
        return { ...ent, metadata: filteredMetadata };
      });
    }

    return c.json({
      type: entityType,
      entities: entityType.entities,
    });
  } catch (error) {
    console.error("Error fetching public entities:", error);
    return c.json({ error: "Failed to fetch" }, 500);
  }
});

// GET /api/custom-entities/type/:type_id - List all entities of a type
router.get("/custom-entities/type/:type_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const typeId = c.req.param("type_id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify entity type belongs to user
    const entityType = await prisma.customEntityType.findFirst({
      where: { id: typeId, userId },
    });

    if (!entityType) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    const entities = await prisma.customEntity.findMany({
      where: { entityTypeId: typeId },
      orderBy: { position: "asc" },
    });

    return c.json({
      type: entityType,
      entities,
    });
  } catch (error) {
    console.error("Error fetching entities:", error);
    return c.json({ error: "Failed to fetch entities" }, 500);
  }
});

// POST /api/custom-entities/type/:type_id - Create new entity
router.post("/custom-entities/type/:type_id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const typeId = c.req.param("type_id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Get entity type and validate ownership
    const entityType = await prisma.customEntityType.findFirst({
      where: { id: typeId, userId },
    });

    if (!entityType) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    const body = await c.req.json();
    const schema = entityType.fieldSchema as any[];

    // Validate data against schema
    const { valid, errors } = validateEntityData(body.data, schema);
    if (!valid) {
      return c.json({ error: "Validation failed", details: errors }, 400);
    }

    // Get next position
    const lastEntity = await prisma.customEntity.findFirst({
      where: { entityTypeId: typeId },
      orderBy: { position: "desc" },
    });
    const position = (lastEntity?.position ?? 0) + 1;

    const newEntity = await prisma.customEntity.create({
      data: {
        id: cuid(),
        entityTypeId: typeId,
        data: body.data,
        image: body.image,
        isPublished: body.isPublished ?? true,
        position,
      },
    });

    return c.json(newEntity, 201);
  } catch (error) {
    console.error("Error creating entity:", error);
    return c.json({ error: "Failed to create entity" }, 500);
  }
});

// GET /api/custom-entities/:id - Get single entity
router.get("/custom-entities/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const entity = await prisma.customEntity.findFirst({
      where: { id },
      include: {
        entityType: true,
      },
    });

    if (!entity || entity.entityType.userId !== userId) {
      return c.json({ error: "Entity not found" }, 404);
    }

    return c.json(entity);
  } catch (error) {
    console.error("Error fetching entity:", error);
    return c.json({ error: "Failed to fetch entity" }, 500);
  }
});

// PUT /api/custom-entities/:id - Update entity
router.put("/custom-entities/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const entity = await prisma.customEntity.findFirst({
      where: { id },
      include: { entityType: true },
    });

    if (!entity || entity.entityType.userId !== userId) {
      return c.json({ error: "Entity not found" }, 404);
    }

    const body = await c.req.json();
    const schema = entity.entityType.fieldSchema as any[];

    // Validate if data is being updated
    if (body.data) {
      const { valid, errors } = validateEntityData(body.data, schema);
      if (!valid) {
        return c.json({ error: "Validation failed", details: errors }, 400);
      }
    }

    const updated = await prisma.customEntity.update({
      where: { id },
      data: {
        data: body.data ?? entity.data,
        image: body.image !== undefined ? body.image : entity.image,
        isPublished: body.isPublished !== undefined ? body.isPublished : entity.isPublished,
      },
    });

    return c.json(updated);
  } catch (error) {
    console.error("Error updating entity:", error);
    return c.json({ error: "Failed to update entity" }, 500);
  }
});

// DELETE /api/custom-entities/:id - Delete entity
router.delete("/custom-entities/:id", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const id = c.req.param("id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const entity = await prisma.customEntity.findFirst({
      where: { id },
      include: { entityType: true },
    });

    if (!entity || entity.entityType.userId !== userId) {
      return c.json({ error: "Entity not found" }, 404);
    }

    await prisma.customEntity.delete({ where: { id } });

    // Resequence remaining entities
    const remaining = await prisma.customEntity.findMany({
      where: { entityTypeId: entity.entityTypeId },
      orderBy: { position: "asc" },
    });

    const updates = remaining.map((e: { id: string }, idx: number) =>
      prisma.customEntity.update({
        where: { id: e.id },
        data: { position: idx + 1 },
      })
    );

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return c.json({ message: "Entity deleted" });
  } catch (error) {
    console.error("Error deleting entity:", error);
    return c.json({ error: "Failed to delete entity" }, 500);
  }
});

// PATCH /api/custom-entities/type/:type_id/reorder - Reorder entities
router.patch("/custom-entities/type/:type_id/reorder", async (c: Context) => {
  const prisma = c.get("prisma");
  const userId = c.get("decodedToken")?.id;
  const typeId = c.req.param("type_id");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify ownership
    const entityType = await prisma.customEntityType.findFirst({
      where: { id: typeId, userId },
    });

    if (!entityType) {
      return c.json({ error: "Entity type not found" }, 404);
    }

    const body = await c.req.json();
    const order = body.order as string[];

    // Verify all IDs belong to this type
    const entities = await prisma.customEntity.findMany({
      where: { entityTypeId: typeId },
      select: { id: true },
    });
    const entityIds = new Set(entities.map((e: { id: string }) => e.id));

    if (order.length !== entityIds.size) {
      return c.json({ error: "Invalid order array" }, 400);
    }

    const invalid = order.filter((id) => !entityIds.has(id));
    if (invalid.length > 0) {
      return c.json({ error: "Invalid entity IDs" }, 400);
    }

    const updates = order.map((id, idx) =>
      prisma.customEntity.update({
        where: { id },
        data: { position: idx + 1 },
      })
    );

    await Promise.all(updates);

    return c.json({ message: "Reordered successfully" });
  } catch (error) {
    console.error("Error reordering entities:", error);
    return c.json({ error: "Failed to reorder" }, 500);
  }
});

// ==================== VALIDATION HELPERS ====================

function validateEntityData(data: Record<string, any>, schema: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of schema) {
    const value = data[field.key];

    // Required check
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`Field "${field.label}" is required`);
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    // Type validation
    switch (field.type) {
      case "text":
      case "textarea":
      case "richtext":
        if (typeof value !== "string") {
          errors.push(`Field "${field.label}" must be text`);
        }
        break;

      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`Field "${field.label}" must be a number`);
        } else {
          if (field.validation?.min !== undefined && value < field.validation.min) {
            errors.push(`Field "${field.label}" must be at least ${field.validation.min}`);
          }
          if (field.validation?.max !== undefined && value > field.validation.max) {
            errors.push(`Field "${field.label}" must be at most ${field.validation.max}`);
          }
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`Field "${field.label}" must be true or false`);
        }
        break;

      case "date":
        if (isNaN(Date.parse(value))) {
          errors.push(`Field "${field.label}" must be a valid date`);
        }
        break;

      case "url":
        try {
          new URL(value);
        } catch {
          errors.push(`Field "${field.label}" must be a valid URL`);
        }
        break;

      case "image":
      case "file":
        if (typeof value !== "string") {
          errors.push(`Field "${field.label}" must be a string`);
        }
        break;

      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push(`Field "${field.label}" must be a valid email`);
        }
        break;

      case "select":
        if (field.options && !field.options.includes(value)) {
          errors.push(`Field "${field.label}" must be one of: ${field.options.join(", ")}`);
        }
        break;

      case "multiselect":
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.label}" must be an array`);
        } else if (field.options) {
          const invalid = value.filter((v) => !field.options.includes(v));
          if (invalid.length > 0) {
            errors.push(`Invalid options for "${field.label}": ${invalid.join(", ")}`);
          }
        }
        break;

      case "color":
        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
        if (!colorRegex.test(value)) {
          errors.push(`Field "${field.label}" must be a hex color (#RRGGBB)`);
        }
        break;

      case "json":
        try {
          if (typeof value === "string") {
            JSON.parse(value);
          }
        } catch {
          errors.push(`Field "${field.label}" must be valid JSON`);
        }
        break;
    }

    // Pattern validation
    if (field.validation?.pattern && typeof value === "string") {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(value)) {
        errors.push(field.validation.message || `Field "${field.label}" has invalid format`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export default router;
