import crypto from "crypto";

/**
 * PayFast LIVE endpoints.
 */
export const PAYFAST_LIVE_HOST = "https://www.payfast.co.za";
export const PAYFAST_SANDBOX_HOST = "sandbox.payfast.co.za";

export const PAYFAST_PROCESS_URL = "https://www.payfast.co.za/eng/process";
export const PAYFAST_SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";

export const PAYFAST_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";
export const PAYFAST_SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";

/**
 * PHP urlencode equivalent (RFC 1738-ish), because PayFast reference
 * implementation uses PHP urlencode for ITN signature computation.
 *
 * Differences vs encodeURIComponent:
 * - spaces become '+' instead of '%20'
 * - '!' "'" '(' ')' '*' '~' are percent-encoded (encodeURIComponent leaves them)
 *
 * This is a PRIMARY source of signature mismatches if you use JS native encoding.
 */
export function phpUrlEncode(input: string): string {
  return encodeURIComponent(String(input))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/~/g, "%7E");
}

/**
 * Build the exact pfParamString for PayFast ITN signature verification.
 *
 * Rules (PayFast reference implementation):
 * - Iterate params in ORIGINAL order (as received in the raw body)
 * - Exclude: signature, option, Itemid
 * - PHP-urlencode each value
 * - Join as: key=value&key=value (trailing & removed)
 *
 * NOTE: This is DIFFERENT from the "API signature" which sorts keys.
 * For ITN, we preserve original order.
 */
export function buildPfParamString(
  entries: IterableIterator<[string, string]> | [string, string][]
): string {
  let pfParamString = "";
  // Support both URLSearchParams (entries() returns IterableIterator) and plain arrays
  const entriesArr = Array.isArray(entries)
    ? entries
    : Array.from(entries);

  for (const [key, value] of entriesArr) {
    if (key === "signature" || key === "option" || key === "Itemid") continue;
    pfParamString += `${key}=${phpUrlEncode(value)}&`;
  }
  if (pfParamString.endsWith("&")) {
    pfParamString = pfParamString.slice(0, -1);
  }
  return pfParamString;
}

/**
 * Build a pfParamString from a plain Record (for testing or manual ITN).
 * This sorts keys alphabetically — use only for testing/payments that
 * follow the sorted-key approach. For the official ITN handler, use
 * buildPfParamString(entries) which preserves original order.
 */
export function buildPfParamStringSorted(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let pfParamString = "";
  for (const key of sortedKeys) {
    if (key === "signature" || key === "option" || key === "Itemid") continue;
    const value = params[key];
    if (value === "" || value === undefined || value === null) continue;
    pfParamString += `${key}=${phpUrlEncode(value)}&`;
  }
  if (pfParamString.endsWith("&")) {
    pfParamString = pfParamString.slice(0, -1);
  }
  return pfParamString;
}

/**
 * Verify PayFast signature using sorted-key approach.
 * Used by old routes (payments/notify, test-itn) that send signature
 * from the frontend. For the ITN handler (no frontend signature),
 * use verifyPayfastSignature with buildPfParamString (preserves original order).
 */
export function verifySignature(
  params: Record<string, string>,
  passphrase: string | null
): boolean {
  // Clone and remove signature field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature: _sig, ...rest } = params;
  const pfParamString = buildPfParamStringSorted(rest);
  const sigBase = passphrase
    ? `${pfParamString}&passphrase=${phpUrlEncode(passphrase)}`
    : pfParamString;
  const computed = md5Hex(sigBase);
  return computed === String(params.signature ?? "").toLowerCase();
}

/**
 * Compute MD5 hex digest.
 */
export function md5Hex(input: string): string {
  return crypto.createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Verify PayFast ITN signature.
 *
 * @param pfParamString - the reconstructed param string (no passphrase)
 * @param receivedSignature - signature from PayFast request
 * @param passphrase - optional PayFast passphrase
 * @returns verification result with computed signature for logging
 */
export function verifyPayfastSignature({
  pfParamString,
  receivedSignature,
  passphrase,
}: {
  pfParamString: string;
  receivedSignature: string;
  passphrase: string | null;
}): { computed: string; ok: boolean } {
  const sigBase = passphrase
    ? `${pfParamString}&passphrase=${phpUrlEncode(passphrase)}`
    : pfParamString;
  const computed = md5Hex(sigBase);
  return {
    computed,
    ok: String(receivedSignature || "").toLowerCase() === computed.toLowerCase(),
  };
}

/**
 * Convert ZAR amount string like "1200.00" to integer cents like 120000.
 * Uses BigInt to avoid float math — this is MANDATORY to prevent
 * "amount mismatch" ITN failures.
 */
export function zarToCents(amountStr: string): bigint {
  const s = String(amountStr).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`Invalid amount format: "${s}"`);
  const sign = m[1] === "-" ? BigInt(-1) : BigInt(1);
  const rands = BigInt(m[2]);
  const centsPart = (m[3] || "0").padEnd(2, "0");
  const cents = BigInt(centsPart);
  return sign * (rands * BigInt(100) + cents);
}

/**
 * Get PayFast host based on mode.
 */
export function getPayfastHost(mode: string): string {
  if (mode === "sandbox") return "sandbox.payfast.co.za";
  if (mode === "live") return "www.payfast.co.za";
  throw new Error(`Invalid PAYFAST_MODE: ${mode}`);
}

/**
 * Validate with PayFast /eng/query/validate endpoint.
 * Must return response beginning with "VALID" (case-insensitive) to be verified.
 *
 * @param host - PayFast host (www.payfast.co.za or sandbox.payfast.co.za)
 * @param pfParamString - the reconstructed param string (NO passphrase appended)
 * @param userAgent - User-Agent string
 * @param timeoutMs - request timeout (default 15000ms)
 */
export async function validateWithPayfast({
  host,
  pfParamString,
  userAgent,
  timeoutMs = 15000,
}: {
  host: string;
  pfParamString: string;
  userAgent: string;
  timeoutMs?: number;
}): Promise<{
  httpStatus: number;
  firstLine: string;
  ok: boolean;
  raw: string;
}> {
  const url = `https://${host}/eng/query/validate`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: pfParamString,
      signal: controller.signal,
    });

    const text = await resp.text();
    const firstLine = String(text).split("\n")[0].trim();
    return {
      httpStatus: resp.status,
      firstLine,
      ok: firstLine.toUpperCase() === "VALID",
      raw: text,
    };
  } finally {
    clearTimeout(t);
  }
}