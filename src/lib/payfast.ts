import crypto from "crypto";

export function toQueryString(params: Record<string, string>) {
  // PayFast requires sorted params and URL-encoding
  const keys = Object.keys(params).sort();
  return keys
    .filter((k) => params[k] !== "")
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
}

export function makeSignature(
  params: Record<string, string>,
  passphrase?: string,
) {
  const qs = toQueryString(params);
  const payload = passphrase
    ? `${qs}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`
    : qs;
  return crypto.createHash("md5").update(payload).digest("hex");
}
