/* =====================================================================
   PASSWORD HASHING
   =====================================================================
   WHAT WAS WRONG

       pw_hash: btoa(pw)

   btoa is BASE64 ENCODING, not hashing. It is trivially and exactly
   reversible — `atob(stored)` returns the password. Every row in `evtol_users`
   therefore contained a plaintext-equivalent credential, and because the
   Supabase anon key ships inside the client bundle (by design; anon keys are
   public and are meant to be protected by row-level security), anyone who can
   read that table can read every password. People reuse passwords, so the
   blast radius extends well beyond this application.

   ── WHAT THIS DOES ───────────────────────────────────────────────────

   PBKDF2-SHA256 through WebCrypto, with a per-user random salt and a high
   iteration count, stored in a self-describing format:

       pbkdf2$<iterations>$<salt-b64>$<hash-b64>

   Self-describing matters: the iteration count travels WITH the hash, so it
   can be raised later without invalidating existing users.

   ── TRANSPARENT MIGRATION, AND WHY IT MATTERS ────────────────────────

   This is a live system with existing accounts. A hard cutover would lock out
   every one of them, which is a worse outcome than the flaw being fixed. So
   `verify()` accepts BOTH formats: a stored value that does not begin with
   "pbkdf2$" is treated as legacy base64 and compared that way. `needsUpgrade()`
   then tells the caller to re-hash and save on the next successful login, so
   accounts migrate silently as people sign in.

   ── WHAT THIS STILL IS NOT ───────────────────────────────────────────

   Client-side hashing is a MITIGATION, not the correct architecture. The hash
   travels to the server and is compared there, so it is functionally the
   password: an attacker who reads the table can replay the stored value
   directly against this client. It removes plaintext exposure and password
   reuse across sites, which is the largest real-world harm, but it does not
   make the store safe on its own.

   The correct fix is Supabase Auth, which hashes server-side with bcrypt and
   never exposes the credential to the client at all. That is a larger change
   to the sign-up and session flow and is deliberately NOT bundled in here.
   Until it is done, the protection genuinely resting under this is the
   row-level security policy on `evtol_users` — which has never been verified
   in this project and should be, before relying on any of it.
   ===================================================================== */

const ITERATIONS = 210_000;   // OWASP 2023 guidance for PBKDF2-SHA256
const KEYLEN     = 32;        // bytes
const PREFIX     = "pbkdf2";

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, KEYLEN * 8);
  return new Uint8Array(bits);
}

/** Hash a password for storage. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${PREFIX}$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** True when the stored value is the old reversible base64 form. */
export function isLegacyHash(stored) {
  return typeof stored === "string" && stored.length > 0 && !stored.startsWith(PREFIX + "$");
}

/* Constant-time compare so a timing side channel cannot leak the hash. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a password against either format.
 * @returns { ok, needsUpgrade }
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };

  if (isLegacyHash(stored)) {
    /* Legacy base64. Accepted ONLY so existing accounts keep working; the
       caller must re-hash on success. */
    return { ok: timingSafeEqual(stored, btoa(password)), needsUpgrade: true };
  }

  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const iterations = parseInt(iterStr, 10);
  if (!iterations || !saltB64 || !hashB64) return { ok: false, needsUpgrade: false };

  const hash = await pbkdf2(password, unb64(saltB64), iterations);
  return {
    ok: timingSafeEqual(b64(hash), hashB64),
    /* Re-hash if the stored work factor has fallen behind current guidance. */
    needsUpgrade: iterations < ITERATIONS,
  };
}
