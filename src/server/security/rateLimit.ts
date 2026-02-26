// src/server/security/rateLimit.ts
/**
 * Rate Limiting Utility (Server-Side)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides a small in-memory rate limiter suitable for protecting:
 * - sensitive endpoints (login-like, screening, matching)
 * - abuse-prone operations (repeated scoring requests)
 *
 * This is a V1 utility:
 * - It is simple, deterministic, and requires no infrastructure.
 * - It is not a distributed limiter and will reset on server restart.
 *
 * Why this exists
 * ---------------
 * Rate limiting reduces:
 * - brute-force style abuse
 * - denial-of-service pressure from repeated requests
 * - runaway costs (if an external AI provider is enabled later)
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Safeguards: rate limiting is a technical safeguard.
 * - Data minimisation: keys should avoid storing PII; prefer internal IDs.
 * - Purpose limitation: the limiter stores operational counters only.
 *
 * IMPORTANT LIMITATION
 * --------------------
 * In-memory limiting is effective only within a single runtime instance.
 * If the deployment uses multiple instances/regions, a shared store (e.g., Redis)
 * should replace this implementation.
 */

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum number of allowed hits within the window. */
  limit: number;

  /** Window size in milliseconds. Example: 60_000 for 1 minute. */
  windowMs: number;
}

/**
 * Result returned by a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;

  /** Remaining hits in the current window (0 when blocked). */
  remaining: number;

  /** UTC timestamp (ms) when the window resets. */
  resetAtMs: number;
}

/**
 * Internal state tracked per key.
 *
 * Stored values:
 * - count: number of hits in current window
 * - windowStartMs: start time of current window
 */
type Bucket = { count: number; windowStartMs: number };

/**
 * In-memory store.
 *
 * Key guidance:
 * - Prefer stable internal IDs: uid, businessId, jobId, driverId.
 * - Avoid email/phone/name.
 * - For IP-based limiting, store a hashed form if feasible.
 */
const buckets = new Map<string, Bucket>();

/**
 * Performs a rate limit check for a given key.
 *
 * Behavior:
 * - If the current window has expired, resets the bucket.
 * - Increments count and determines if the request is allowed.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  // No existing bucket → create a new window starting now.
  if (!bucket) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAtMs: now + config.windowMs,
    };
  }

  // If window expired → reset count and window start.
  const windowEnd = bucket.windowStartMs + config.windowMs;
  if (now >= windowEnd) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAtMs: now + config.windowMs,
    };
  }

  // Same window → increment count.
  bucket.count += 1;

  const allowed = bucket.count <= config.limit;
  const remaining = Math.max(0, config.limit - bucket.count);

  return {
    allowed,
    remaining,
    resetAtMs: windowEnd,
  };
}

/**
 * Convenience helper: throws an Error when rate limit is exceeded.
 *
 * Why this exists:
 * - Keeps route handlers concise.
 * - Standardises the failure pattern.
 *
 * Note:
 * - Callers should convert this into a 429 response.
 */
export function assertRateLimit(key: string, config: RateLimitConfig): void {
  const result = checkRateLimit(key, config);
  if (!result.allowed) {
    const err = new Error("RATE_LIMITED");
    // Attach minimal metadata for handlers that want to set headers.
    (err as any).rateLimit = result;
    throw err;
  }
}

/**
 * Housekeeping: removes expired buckets.
 *
 * Why this exists:
 * - Prevents unbounded memory growth in long-running processes.
 *
 * Usage:
 * - Can be called periodically (e.g., every few minutes) from a server entry point.
 */
export function cleanupExpiredBuckets(config: RateLimitConfig): void {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.windowStartMs + config.windowMs) {
      buckets.delete(key);
    }
  }
}
