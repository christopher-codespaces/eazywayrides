// src/server/ai/index.ts
/**
 * AI Module Entry Point (V1)
 * =============================================================================
 * What this file does
 * -------------------
 * 1) Selects the active AI provider implementation.
 * 2) Builds standard metadata for every AI/rules output.
 *
 * V1 behavior
 * -----------
 * - Provider defaults to "none" (vendor-free, deterministic).
 * - External providers (e.g., Google/OpenAI) are intentionally not enabled
 *   until there is explicit approval (budget + compliance).
 *
 * POPIA (South Africa) considerations
 * ----------------------------------
 * - Provider selection must be explicit and controlled.
 * - Metadata must be PII-free and safe to store in logs/audit trails.
 */

import {
  AI_CONTRACT_VERSION,
  nowUtcIso,
  type AIProviderName,
  type ContractMeta,
} from "./contract";
import { noneProvider, type AIProvider } from "./providers/none";

/**
 * Returns the active provider instance.
 *
 * Current implementation:
 * - Always returns `noneProvider` to avoid external data processing.
 *
 * Extension point (future):
 * - Environment-based selection can be added once approved.
 * - The selection should fail-safe to `noneProvider`.
 */
export function getAIProvider(): AIProvider {
  // Future extension pattern (intentionally disabled for V1):
  // const provider = process.env.AI_PROVIDER as AIProviderName | undefined;
  // switch (provider) {
  //   case "google": return googleProvider;
  //   case "openai": return openAIProvider;
  //   default: return noneProvider;
  // }

  return noneProvider;
}

/**
 * Builds metadata attached to every contract output.
 *
 * Why metadata exists:
 * - Enables auditability: which policy version produced the output
 * - Enables debugging: when the output was generated, and by which provider
 * - Supports trace correlation: optional traceId for request-level logs
 *
 * Safety constraints:
 * - Must not include personal data (names, phone numbers, emails, IDs).
 * - Must not include raw application text or document contents.
 */
export function buildMeta(params: {
  provider: AIProviderName;
  policyVersion: string;
  traceId?: string;
  model?: string;
}): ContractMeta {
  return {
    // Contract version: bump when output schema changes.
    contractVersion: AI_CONTRACT_VERSION,

    // Provider name: indicates whether output used external processing.
    provider: params.provider,

    // Policy version: bump whenever scoring/threshold rules change.
    policyVersion: params.policyVersion,

    // Generation time: UTC ISO timestamp for consistent auditing across regions.
    generatedAt: nowUtcIso(),

    // Trace id: optional correlation identifier for logs/monitoring.
    traceId: params.traceId,

    // Model: only used if a real AI provider is enabled later.
    model: params.model,
  };
}
