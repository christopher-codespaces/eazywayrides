// src/server/policies/auth.ts
/**
 * Authentication & Authorization Policy Helpers (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Centralises common auth/role enforcement logic for server-side entry points:
 * - API routes
 * - Server actions
 * - Admin operations
 *
 * The helpers in this file:
 * - ensure requests are authenticated before accessing protected logic
 * - enforce role-based access control (RBAC) consistently
 * - standardise error shapes for easier debugging and auditing
 *
 * Why this is necessary
 * ---------------------
 * Without centralised policy guards, codebases often accumulate:
 * - duplicated role checks
 * - inconsistent permission rules across routes
 * - hard-to-trace security bugs
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Safeguards: access controls are a core security safeguard.
 * - Data minimisation: authentication checks should return only what is needed
 *   (e.g., uid/role), not full user profiles.
 * - Logging: access-denied logs should avoid storing PII.
 */

/**
 * Minimal user context used by server-side policy checks.
 *
 * Design note:
 * - Keep this minimal and stable.
 * - Include only what is required for authorization decisions.
 */
export interface AuthUser {
  uid: string;

  /**
   * Role identifiers used for RBAC.
   * These values should match the project's stored user claims/fields.
   *
   * Examples (adjust to the project's roles):
   * - "admin"
   * - "business"
   * - "driver"
   */
  role: "admin" | "business" | "driver" | "unknown";

  /**
   * Optional tenant/business scope when RBAC needs entity-level boundaries.
   * Example: business users should only access their own businessId resources.
   */
  businessId?: string | null;
}

/**
 * Standard error shape for policy failures.
 *
 * Rationale:
 * - Provides predictable error handling in routes/controllers.
 * - Avoids leaking internal details to clients.
 */
export class PolicyError extends Error {
  public readonly code: "UNAUTHENTICATED" | "FORBIDDEN";
  public readonly httpStatus: 401 | 403;

  constructor(params: { code: "UNAUTHENTICATED" | "FORBIDDEN"; message?: string }) {
    super(params.message ?? params.code);
    this.code = params.code;
    this.httpStatus = params.code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

/**
 * Ensures a user context exists.
 *
 * Typical usage:
 * - When server code receives a user context from Firebase Auth or session state.
 *
 * Behavior:
 * - Throws PolicyError("UNAUTHENTICATED") if user is missing.
 */
export function requireAuth(user: AuthUser | null | undefined): AuthUser {
  if (!user) {
    throw new PolicyError({
      code: "UNAUTHENTICATED",
      message: "Authentication is required for this operation.",
    });
  }
  return user;
}

/**
 * Ensures the authenticated user has one of the allowed roles.
 *
 * Behavior:
 * - Throws PolicyError("FORBIDDEN") when role is not allowed.
 *
 * Design note:
 * - This is RBAC enforcement only.
 * - Entity-level authorization (e.g., businessId ownership) should be done with
 *   separate checks such as `requireBusinessScope`.
 */
export function requireRole(user: AuthUser, allowed: Array<AuthUser["role"]>): AuthUser {
  // Unknown role should never pass authorization by default.
  if (!allowed.includes(user.role)) {
    throw new PolicyError({
      code: "FORBIDDEN",
      message: "Insufficient permissions for this operation.",
    });
  }
  return user;
}

/**
 * Ensures the authenticated user is scoped to a specific business.
 *
 * Use cases:
 * - business dashboards
 * - business-owned jobs
 * - business-owned driver screening outputs
 *
 * Behavior:
 * - Throws PolicyError("FORBIDDEN") when scope is missing or mismatched.
 */
export function requireBusinessScope(user: AuthUser, businessId: string): AuthUser {
  if (!user.businessId || user.businessId !== businessId) {
    throw new PolicyError({
      code: "FORBIDDEN",
      message: "Business scope is required for this operation.",
    });
  }
  return user;
}

/**
 * Converts a PolicyError into a safe JSON response payload.
 *
 * Design note:
 * - The message is intentionally generic to avoid leakage.
 * - Routes/controllers can use this to standardise error handling.
 */
export function policyErrorToResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof PolicyError) {
    return {
      status: err.httpStatus,
      body: { error: err.code },
    };
  }
  return {
    status: 500,
    body: { error: "INTERNAL_ERROR" },
  };
}
