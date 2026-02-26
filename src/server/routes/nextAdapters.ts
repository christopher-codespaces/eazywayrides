// src/server/routes/nextAdapters.ts
/**
 * Next.js Route Adapters (Integration Layer)
 * =============================================================================
 * What this file does
 * -------------------
 * Provides small helpers that adapt framework-agnostic handler responses
 * into concrete Next.js response objects.
 *
 * These adapters:
 * - isolate Next.js-specific objects (NextResponse, res)
 * - keep business logic free of framework coupling
 * - ensure consistent response behavior across routes
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Safeguards: prevents accidental leakage of internal error objects
 * - Data minimisation: responses are explicitly shaped and controlled
 *
 * IMPORTANT NOTE
 * --------------
 * This file supports:
 * - Next.js App Router (NextResponse)
 * - Next.js Pages Router (res.status().json())
 *
 * Only adapters should reference Next.js response primitives.
 */

// App Router support
import { NextResponse } from "next/server";

/**
 * Framework-agnostic response shape produced by route handlers.
 *
 * This structure is intentionally minimal:
 * - status: HTTP status code
 * - body: JSON-serialisable payload
 * - headers: optional HTTP headers
 */
export type HandlerResponse = {
  status: number;
  body: any;
  headers?: Record<string, string>;
};

/**
 * Converts a HandlerResponse into a NextResponse (App Router).
 *
 * Header handling:
 * - Object.entries(headers) returns [headerName, headerValue] pairs
 * - headerName is the HTTP header key (e.g. "Cache-Control")
 * - headerValue is the corresponding value (e.g. "no-store")
 *
 * Headers are copied explicitly to avoid leaking framework internals.
 */
export function toNextResponse(response: HandlerResponse): NextResponse {
  const nextResponse = NextResponse.json(response.body, {
    status: response.status,
  });

  if (response.headers) {
    for (const [headerName, headerValue] of Object.entries(response.headers)) {
      nextResponse.headers.set(headerName, headerValue);
    }
  }

  return nextResponse;
}

/**
 * Converts a HandlerResponse into a Pages Router response.
 *
 * Header handling:
 * - headerName represents the HTTP header key
 * - headerValue represents the HTTP header value
 *
 * Usage:
 * ------------------------------------------------
 * export default async function handler(req, res) {
 *   const response = await handleSomething(...);
 *   return sendJson(res, response);
 * }
 */
export function sendJson(res: any, response: HandlerResponse): void {
  if (response.headers) {
    for (const [headerName, headerValue] of Object.entries(response.headers)) {
      res.setHeader(headerName, headerValue);
    }
  }

  res.status(response.status).json(response.body);
}
