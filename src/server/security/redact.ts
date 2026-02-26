// src/server/security/redact.ts
/**
 * Redaction Utilities (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides small, reusable helpers to redact or minimise sensitive fields
 * before data is:
 * - logged
 * - attached to audit events
 * - returned in error payloads
 *
 * This file is intentionally simple and explicit to reduce the risk of
 * accidentally leaking personal or sensitive information.
 *
 * Why this exists
 * ---------------
 * Even well-designed services can accidentally log:
 * - identifiers
 * - free-text input
 * - nested objects that include sensitive fields
 *
 * Centralised redaction helpers ensure a consistent approach across the codebase.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: only what is strictly necessary should be logged.
 * - Safeguards: technical measures must protect personal information.
 * - Purpose limitation: logs are operational, not a data store for profiles.
 *
 * IMPORTANT RULE
 * --------------
 * Redaction should be applied *before* logging or persistence.
 * Do not rely on downstream systems to mask sensitive data.
 */

/**
 * Generic keys that commonly carry sensitive information.
 *
 * Design note:
 * - This list is conservative and intentionally broad.
 * - It can be extended as new risk patterns are identified.
 */
const SENSITIVE_KEYS = new Set<string>([
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "phoneNumber",
  "address",
  "idNumber",
  "identityNumber",
  "document",
  "documents",
  "password",
  "token",
  "accessToken",
  "refreshToken",
]);

/**
 * Redacts sensitive values from an object recursively.
 *
 * Behavior:
 * - Primitive values are returned as-is.
 * - Arrays are mapped element-by-element.
 * - Objects are shallow-copied and sensitive keys are replaced with "[REDACTED]".
 *
 * Safety constraints:
 * - The original object is never mutated.
 * - Unknown shapes are handled defensively.
 */
export function redactObject<T>(value: T): T {
  // Primitive values cannot contain nested sensitive data.
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Arrays are redacted element-by-element.
  if (Array.isArray(value)) {
    return value.map((v) => redactObject(v)) as unknown as T;
  }

  // Objects are shallow-copied with sensitive keys masked.
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactObject(val);
    }
  }

  return result as T;
}

/**
 * Redacts an error object for safe logging.
 *
 * Why this exists:
 * - Errors may include request payloads or internal details.
 * - Logging raw errors risks leaking sensitive data.
 *
 * Output:
 * - name
 * - message
 * - stack (optional, depending on environment)
 */
export function redactError(err: unknown): {
  name?: string;
  message?: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stack traces may be disabled in production if required.
      stack: err.stack,
    };
  }

  // Fallback for non-Error throws.
  return {
    message: "Non-error value thrown",
  };
}

/**
 * Helper: safely stringify an object for logs after redaction.
 *
 * Usage:
 * ------------------------------------------------
 * console.log(safeStringify(payload));
 *
 * Benefits:
 * - Guarantees redaction before serialization.
 * - Prevents circular reference crashes.
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redactObject(value));
  } catch {
    return "[UNSERIALIZABLE_VALUE]";
  }
}
