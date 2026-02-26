// src/server/policies/roles.ts
/**
 * Role Definitions & Role Utilities (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Centralises role identifiers and common role-related helpers used across:
 * - API routes
 * - services
 * - repositories
 * - audit and security utilities
 *
 * Why this exists
 * ---------------
 * Role strings scattered across a codebase lead to:
 * - inconsistent permissions
 * - silent security bugs due to typos
 * - unclear authorization intent during review
 *
 * This file provides a single source of truth for role values and helpers
 * that make policy checks explicit and readable.
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Safeguards: role-based access control is an important safeguard.
 * - Least privilege: helpers should encourage minimal access by default.
 *
 * Notes on naming
 * ---------------
 * This project may already use specific role labels in Firestore or Firebase
 * custom claims. The role union below should mirror the stored values exactly.
 *
 * If role values are not final, keep the union stable and map unknown values
 * to "unknown" during user context construction.
 */

/**
 * Role identifiers used for authorization decisions.
 *
 * Guidance:
 * - Keep role strings short and stable.
 * - Avoid adding “temporary” roles without updating policy checks.
 */
export const ROLES = {
  admin: "admin",
  business: "business",
  driver: "driver",
  unknown: "unknown",
} as const;

/**
 * Type union of all supported roles.
 */
export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Defines a set of roles allowed for a given operation.
 *
 * Usage pattern:
 * - Prefer a constant set per route/operation to keep permissions auditable.
 */
export type AllowedRoles = ReadonlyArray<Role>;

/**
 * Converts an unknown value (e.g., from database/claims) into a safe Role.
 *
 * Why it exists:
 * - Prevents unexpected strings from accidentally passing checks.
 * - Defaults to "unknown" to enforce least privilege.
 */
export function coerceRole(value: unknown): Role {
  if (value === ROLES.admin) return ROLES.admin;
  if (value === ROLES.business) return ROLES.business;
  if (value === ROLES.driver) return ROLES.driver;
  return ROLES.unknown;
}

/**
 * True if the role is privileged for administrative actions.
 */
export function isAdmin(role: Role): boolean {
  return role === ROLES.admin;
}

/**
 * True if the role represents a business/operator user.
 */
export function isBusiness(role: Role): boolean {
  return role === ROLES.business;
}

/**
 * True if the role represents a driver user.
 */
export function isDriver(role: Role): boolean {
  return role === ROLES.driver;
}

/**
 * Validates that a role is within an allowed set.
 *
 * Why it exists:
 * - Makes authorization checks explicit and readable in routes/services.
 * - Encourages least privilege by requiring an explicit allowlist.
 */
export function isRoleAllowed(role: Role, allowed: AllowedRoles): boolean {
  return allowed.includes(role);
}
