// src/server/policies/userContext.ts
/**
 * User Context Builder (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Builds a minimal, authorization-safe user context object that can be used by:
 * - policy guards (requireAuth / requireRole / requireBusinessScope)
 * - services that need tenant scoping (businessId)
 * - audit events (trace correlation without PII)
 *
 * Why this exists
 * ---------------
 * Authentication providers (Firebase Auth) can expose large token objects and
 * optional claims that vary across environments.
 *
 * This file:
 * - normalises the data into a stable shape
 * - applies least-privilege defaults ("unknown" role when uncertain)
 * - avoids passing excessive user data through the system
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Data minimisation: context contains only uid/role/business scope.
 * - Safeguards: role coercion defaults to "unknown" to prevent over-permission.
 * - Purpose limitation: context is used strictly for authorization decisions.
 */

import type { AuthUser } from "./auth";
import { coerceRole, type Role } from "./roles";

/**
 * Minimal set of token/claims fields expected from Firebase or a session layer.
 *
 * Design note:
 * - This is intentionally generic to avoid tight coupling to a specific SDK.
 * - API routes should map their auth mechanism into this shape.
 */
export interface AuthClaimsLike {
  /** Firebase user id (subject). */
  uid?: string;

  /**
   * Custom role claim or stored field.
   * The actual claim name may vary across projects.
   */
  role?: unknown;

  /**
   * Business scope claim/field (optional).
   * If absent, business scoping checks should fail closed.
   */
  businessId?: unknown;
}

/**
 * Builds an AuthUser context from token/claims-like input.
 *
 * Behavior:
 * - Missing uid → returns null (unauthenticated)
 * - Unknown role values → coerces to "unknown" (least privilege)
 * - businessId is optional and normalised to string|null
 */
export function buildAuthUserFromClaims(claims: AuthClaimsLike | null | undefined): AuthUser | null {
  if (!claims || typeof claims.uid !== "string" || claims.uid.length === 0) {
    return null;
  }

  const role: Role = coerceRole(claims.role);

  const businessId =
    typeof claims.businessId === "string" && claims.businessId.length > 0
      ? claims.businessId
      : null;

  return {
    uid: claims.uid,
    role,
    businessId,
  };
}

/**
 * Utility: builds an AuthUser context when only uid is available.
 *
 * Use cases:
 * - Early development where roles are not yet wired
 * - Unit tests where only uid is relevant
 *
 * Security note:
 * - Role defaults to "unknown" to avoid accidental elevation.
 */
export function buildAuthUserFromUid(uid: string): AuthUser {
  return {
    uid,
    role: "unknown",
    businessId: null,
  };
}
