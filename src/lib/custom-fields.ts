/**
 * Professional Custom Fields System
 * Supports schema validation, type safety, and flexible metadata storage
 */

// Define supported field types
export type FieldType = "text" | "number" | "boolean" | "date" | "url" | "email" | "select" | "multiselect" | "json";

// Field definition for UI generation and validation
export interface FieldDefinition {
  key: string;           // Field identifier (e.g., "location")
  label: string;         // Display label (e.g., "Location")
  type: FieldType;       // Data type
  required?: boolean;    // Is field required
  isPrivate?: boolean;   // Only visible to the owner
  defaultValue?: any;    // Default value
  options?: string[];    // For select/multiselect
  validation?: {       // Validation rules
    min?: number;        // Min length for text, min value for number
    max?: number;        // Max length for text, max value for number
    pattern?: string;    // Regex pattern
  };
  description?: string;  // Help text for UI
}

// Per-entity field schemas (stored in DB or config)
export const EXPERIENCE_FIELD_SCHEMA: FieldDefinition[] = [
  {
    key: "location",
    label: "Location",
    type: "text",
    description: "Job location (e.g., 'New York, NY' or 'Remote')"
  },
  {
    key: "employmentType",
    label: "Employment Type",
    type: "select",
    options: ["Full-time", "Part-time", "Contract", "Freelance", "Internship"],
    description: "Type of employment"
  },
  {
    key: "salaryRange",
    label: "Salary Range",
    type: "text",
    isPrivate: true,
    description: "Optional salary range (e.g., '$100k - $150k')"
  },
  {
    key: "isRemote",
    label: "Remote Position",
    type: "boolean",
    defaultValue: false
  },
  {
    key: "technologies",
    label: "Technologies Used",
    type: "multiselect",
    options: [], // Can be populated from skills
    description: "Technologies used at this job"
  },
  {
    key: "achievements",
    label: "Key Achievements",
    type: "json",
    isPrivate: true,
    description: "Array of achievements as JSON"
  }
];

export const EDUCATION_FIELD_SCHEMA: FieldDefinition[] = [
  {
    key: "location",
    label: "Location",
    type: "text",
    description: "City, Country"
  },
  {
    key: "gpa",
    label: "GPA",
    type: "number",
    isPrivate: true,
    description: "Grade point average"
  },
  {
    key: "isOngoing",
    label: "Currently Studying",
    type: "boolean",
    defaultValue: false
  }
];

export const PROJECT_FIELD_SCHEMA: FieldDefinition[] = [
  {
    key: "status",
    label: "Development Status",
    type: "select",
    options: ["Ongoing", "Completed", "Maintenance", "Archived"],
    defaultValue: "Completed"
  },
  {
    key: "videoUrl",
    label: "Demo Video URL",
    type: "url"
  },
  {
    key: "isPrivate",
    label: "Private Repository",
    type: "boolean",
    defaultValue: false
  }
];

export const SKILL_FIELD_SCHEMA: FieldDefinition[] = [
  {
    key: "proficiency",
    label: "Proficiency Level",
    type: "number", // 1-100
    validation: { min: 0, max: 100 }
  },
  {
    key: "yearsOfExperience",
    label: "Years of Experience",
    type: "number"
  },
  {
    key: "isFavorite",
    label: "Showcase in Bio",
    type: "boolean",
    defaultValue: false
  }
];

export const BIO_FIELD_SCHEMA: FieldDefinition[] = [
  {
    key: "twitter",
    label: "Twitter Profile",
    type: "url"
  },
  {
    key: "github",
    label: "GitHub Profile",
    type: "url"
  },
  {
    key: "linkedin",
    label: "LinkedIn Profile",
    type: "url"
  },
  {
    key: "availability",
    label: "Availability Info",
    type: "text",
    description: "e.g., 'Looking for opportunities' or 'Not available'"
  }
];

/**
 * Validate custom field data against schema
 */
export function validateCustomFields(
  data: Record<string, any>,
  schema: FieldDefinition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of schema) {
    const value = data[field.key];

    // Check required fields
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`Field "${field.label}" is required`);
      continue;
    }

    // Skip validation if value is empty and not required
    if (value === undefined || value === null || value === "") {
      continue;
    }

    // Type validation
    switch (field.type) {
      case "number":
        if (typeof value !== "number" || isNaN(value)) {
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

      case "text":
      case "url":
      case "email":
        if (typeof value !== "string") {
          errors.push(`Field "${field.label}" must be text`);
        } else {
          if (field.validation?.min !== undefined && value.length < field.validation.min) {
            errors.push(`Field "${field.label}" must be at least ${field.validation.min} characters`);
          }
          if (field.validation?.max !== undefined && value.length > field.validation.max) {
            errors.push(`Field "${field.label}" must be at most ${field.validation.max} characters`);
          }
          if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
            errors.push(`Field "${field.label}" has invalid format`);
          }
        }
        break;

      case "date":
        if (isNaN(Date.parse(value))) {
          errors.push(`Field "${field.label}" must be a valid date`);
        }
        break;

      case "select":
        if (field.options && field.options.length > 0 && !field.options.includes(value)) {
          errors.push(`Field "${field.label}" must be one of: ${field.options.join(", ")}`);
        }
        break;

      case "multiselect":
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.label}" must be an array`);
        } else if (field.options && field.options.length > 0) {
          const invalid = value.filter(v => !field.options!.includes(v));
          if (invalid.length > 0) {
            errors.push(`Field "${field.label}" has invalid options: ${invalid.join(", ")}`);
          }
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
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse custom fields from FormData (handles JSON strings from form submissions)
 */
export function parseCustomFieldsFromFormData(
  formData: FormData,
  schema: FieldDefinition[]
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const field of schema) {
    // Try to get from form data
    const value = formData.get(`metadata.${field.key}`);

    if (value !== null && value !== "") {
      switch (field.type) {
        case "number":
          result[field.key] = parseFloat(value as string);
          break;
        case "boolean":
          result[field.key] = value === "true" || value === "on" || value === "1";
          break;
        case "multiselect":
          // Handle multiple values (metadata.key[]), fallback to CSV/JSON in metadata.key
          const allValues = formData.getAll(`metadata.${field.key}[]`);
          if (allValues.length > 0) {
            result[field.key] = allValues.map(v => String(v));
          } else if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
              result[field.key] = [];
            } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
              try {
                const parsed = JSON.parse(trimmed);
                result[field.key] = Array.isArray(parsed) ? parsed.map((v) => String(v)) : [String(parsed)];
              } catch {
                result[field.key] = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
              }
            } else {
              result[field.key] = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
            }
          }
          break;
        case "json":
          try {
            result[field.key] = JSON.parse(value as string);
          } catch {
            result[field.key] = value;
          }
          break;
        default:
          result[field.key] = value;
      }
    } else if (field.defaultValue !== undefined) {
      result[field.key] = field.defaultValue;
    }
  }

  return result;
}

/**
 * Parse custom fields from either FormData or a plain object (JSON)
 */
export function parseMetadata(
  input: FormData | Record<string, any>,
  schema: FieldDefinition[]
): Record<string, any> {
  if (input instanceof FormData) {
    return parseCustomFieldsFromFormData(input, schema);
  }
  
  // For JSON input, we assume it's already structured or use the schema to extract from top-level/metadata object
  const result: Record<string, any> = {};
  const metadataSource = input.metadata || input;

  for (const field of schema) {
    const value = metadataSource[field.key];
    if (value !== undefined && value !== null && value !== "") {
      result[field.key] = value;
    } else if (field.defaultValue !== undefined) {
      result[field.key] = field.defaultValue;
    }
  }
  return result;
}

/**
 * Filter metadata based on schema and ownership
 * Removes fields marked as isPrivate if isOwner is false
 */
export function filterMetadataBySchema(
  metadata: any,
  schema: FieldDefinition[],
  isOwner: boolean
): any {
  if (!metadata || isOwner) return metadata;

  // Handle both stringified and object metadata
  const data = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  const result: Record<string, any> = {};

  const privateKeys = new Set(
    schema.filter((f) => f.isPrivate).map((f) => f.key)
  );

  for (const [key, value] of Object.entries(data)) {
    if (!privateKeys.has(key) && !key.startsWith("_")) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize metadata for storage (removes undefined/null, validates types)
 */
export function sanitizeMetadata(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Example: Convert Prisma JsonValue to typed object
 * Usage: const metadata = experience.metadata ? fromPrismaJson(experience.metadata) : {};
 */
export function fromPrismaJson(json: any): Record<string, any> {
  if (typeof json === "string") {
    return JSON.parse(json);
  }
  return json as Record<string, any>;
}
