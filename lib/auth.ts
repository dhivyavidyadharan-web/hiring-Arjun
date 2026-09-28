// Single-user login for Arjun. The session cookie holds an HMAC of a fixed
// message keyed by SESSION_SECRET + ADMIN_PASSWORD, so changing either logs everyone out.
// Uses Web Crypto so it works in both middleware (edge) and route handlers (node).

export const SESSION_COOKIE = "kargo_session";

export async function sessionToken(): Promise<string> {
  const secret = `${process.env.SESSION_SECRET ?? ""}:${process.env.ADMIN_PASSWORD ?? ""}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("kargo-hiring-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && (process.env.SESSION_SECRET ?? "").length >= 16);
}
