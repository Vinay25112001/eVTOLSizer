/* =====================================================================
   SUPABASE AUTH — the correct architecture, behind a flag
   =====================================================================
   WHY THIS EXISTS

   The application authenticates against its own `evtol_users` table, comparing
   a password hash the CLIENT computes. src/lib/password.js replaced the
   reversible `btoa(pw)` with PBKDF2, which removes plaintext exposure — but it
   is a mitigation, not the architecture. The hash still travels to the client
   and is compared there, so it functionally IS the password: anyone who can
   read the table can replay the stored value straight back at this client.

   Supabase Auth fixes that properly. Passwords are hashed with bcrypt SERVER-
   side, the credential never reaches the browser, and sessions are JWTs the
   database itself can enforce RLS against (`auth.uid()`), which is what finally
   makes row-level security meaningful on user-owned rows.

   ── WHY THIS IS BEHIND A FLAG ────────────────────────────────────────

   This is a live system with real accounts, and it cannot be tested against
   the production database from a development session. A hard cutover would be
   reckless: if anything about the project's email-confirmation settings or RLS
   policies differs from what is assumed here, every user is locked out at once
   and the failure is discovered in production.

   So both paths exist. `VITE_AUTH_MODE` selects:
       "custom"   (default) — the existing table-based path, unchanged
       "supabase"           — this module
   Nothing changes until the flag is set. Test it against a staging project,
   then flip it.

   ── MIGRATING EXISTING ACCOUNTS ──────────────────────────────────────

   Accounts live in `evtol_users` with a PBKDF2 or legacy-base64 hash and have
   no Supabase Auth identity. They migrate on first sign-in:

       1. try signIn — fails, no auth identity exists yet
       2. look up the legacy row and verify the password against its stored hash
       3. if it verifies, the password is proven — create the auth account with it
       4. sign in again

   The user types their existing password once and never notices. Nothing is
   migrated without the password being proven first, so a leaked hash cannot be
   used to create an account.

   ── ONE PROJECT SETTING THAT WILL BREAK THIS ─────────────────────────

   If "Confirm email" is ENABLED in the Supabase project, signUp does not return
   a usable session and step 4 fails until the user clicks a link in their
   inbox. For a silent migration it must be DISABLED, or the migration must be
   run as an admin-side backfill with the service-role key instead — which
   cannot happen in the browser, because that key must never ship to a client.
   `migrateLegacyAccount` reports this case rather than failing opaquely.
   ===================================================================== */

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_KEY;

/* "custom" keeps the existing behaviour. Anything else is opt-in. */
export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || "custom";
export const usingSupabaseAuth = AUTH_MODE === "supabase";

const SESSION_KEY = "evtol.session";

async function authFetch(path, { method = "POST", body, token } = {}) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: KEY_,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error_code || data?.error;
    throw err;
  }
  return data;
}

/* ── Session ────────────────────────────────────────────────────────── */

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

export function saveSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private browsing — session simply will not persist */ }
}

/** Refresh an expired access token. Returns null if the refresh token is dead. */
export async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  try {
    const s = await authFetch("token?grant_type=refresh_token",
      { body: { refresh_token: session.refresh_token } });
    saveSession(s);
    return s;
  } catch { saveSession(null); return null; }
}

/** Current session, refreshed if it has expired. */
export async function getSession() {
  const s = loadSession();
  if (!s) return null;
  const expMs = (s.expires_at ?? 0) * 1000;
  if (expMs && Date.now() > expMs - 60_000) return refreshSession(s);
  return s;
}

/* ── Sign up / in / out ─────────────────────────────────────────────── */

export async function signUp(email, password, metadata = {}) {
  const s = await authFetch("signup", {
    body: { email: email.trim().toLowerCase(), password, data: metadata },
  });
  /* With email confirmation enabled the response carries a user but no
     session. Say so explicitly — callers must not treat it as signed in. */
  const confirmed = !!s?.access_token;
  if (confirmed) saveSession(s);
  return { session: confirmed ? s : null, user: s?.user ?? s, needsEmailConfirm: !confirmed };
}

export async function signIn(email, password) {
  const s = await authFetch("token?grant_type=password", {
    body: { email: email.trim().toLowerCase(), password },
  });
  saveSession(s);
  return s;
}

export async function signOut() {
  const s = loadSession();
  if (s?.access_token) {
    try { await authFetch("logout", { token: s.access_token }); } catch { /* local sign-out still applies */ }
  }
  saveSession(null);
}

export async function requestPasswordReset(email) {
  return authFetch("recover", { body: { email: email.trim().toLowerCase() } });
}

/**
 * Migrate one legacy account, having ALREADY proven the password against the
 * legacy hash. Never call this without verifying first.
 *
 * @param verifyLegacy async (password) => boolean
 */
export async function migrateLegacyAccount(email, password, verifyLegacy, metadata = {}) {
  const proven = await verifyLegacy(password);
  if (!proven) return { migrated: false, reason: "password did not match the legacy hash" };

  try {
    const { needsEmailConfirm } = await signUp(email, password, { ...metadata, migrated_from: "evtol_users" });
    if (needsEmailConfirm) {
      return { migrated: false, needsEmailConfirm: true,
        reason: "Supabase project has email confirmation enabled, so the account "
              + "cannot be activated silently. Disable it, or backfill server-side "
              + "with the service-role key (never in the browser)." };
    }
    const session = await signIn(email, password);
    return { migrated: true, session };
  } catch (e) {
    if (e.status === 422 || /already registered/i.test(e.message)) {
      /* An auth identity already exists — the password simply did not match it. */
      return { migrated: false, reason: "an auth account already exists for this email" };
    }
    return { migrated: false, reason: e.message };
  }
}
