/**
 * Canonical auth failure codes — the single source of truth for the server.
 *
 * MIRRORED IN: frontend/src/app/core/services/auth-failure.ts
 * The `code` strings must stay byte-identical across the two files. The server
 * owns the classification; the frontend owns the wording shown to the user.
 *
 * A code earns its place here only if BOTH are true:
 *   1. The server can actually determine it — no guessing between two causes.
 *   2. Someone would do something different about it (the user retries, or an
 *      administrator fixes a directory/config/database fault).
 *
 * `retryable` answers one question: could signing in again plausibly resolve
 * this? It drives the frontend's redirect-loop guard. A non-retryable failure
 * must never bounce the user back through the login flow, because the flow
 * cannot fix it — they would loop forever on a fault only an admin can clear.
 */

const CODES = {
    // ---------------------------------------------------------------
    // Session faults (401) — no authenticated user on a guarded route
    // ---------------------------------------------------------------

    /** No connect.sid presented at all. Never signed in, cleared cookies, or a
     *  SameSite/Secure/domain rule stopped the browser sending it. */
    NO_SESSION_COOKIE: {
        code: 'no_session_cookie',
        status: 401,
        retryable: true,
        note: 'No session cookie was presented. Normal for a first visit.'
    },

    /** A cookie arrived but its HMAC does not verify against the current
     *  secret. The cookie was signed by a process using a DIFFERENT key:
     *  SESSION_SECRET unset (each pm2 worker mints its own), rotated, or
     *  differing across Container App replicas. NOT expiry — the cookie is
     *  perfectly fresh, it is simply not trusted here. */
    SESSION_COOKIE_UNTRUSTED: {
        code: 'session_cookie_untrusted',
        status: 401,
        retryable: true,
        note: 'Cookie signature failed. Check SESSION_SECRET is set and identical across every worker and replica.'
    },

    /** Signature verified, so this server issued the cookie — but the store has
     *  no record for that session id. Genuine expiry, TTL eviction, or a
     *  manually cleared sessions collection. */
    SESSION_EXPIRED: {
        code: 'session_expired',
        status: 401,
        retryable: true,
        note: 'Cookie is trusted but the session record is gone from the store (expired or evicted).'
    },

    /** Valid, live session that simply carries no authenticated user. Signed
     *  out, or the session was created before login completed. */
    SESSION_NOT_AUTHENTICATED: {
        code: 'session_not_authenticated',
        status: 401,
        retryable: true,
        note: 'Session is valid but holds no authenticated user.'
    },

    /** The session names a user id that no longer deserializes — the account
     *  was deleted or the _id changed since login. Signing in again will not
     *  recreate it; an administrator must restore the account. */
    USER_NOT_FOUND: {
        code: 'user_not_found',
        status: 401,
        retryable: false,
        note: 'Session references a user that no longer exists in MongoDB.'
    },

    /** Session and user are both fine; the stored display name is unusable.
     *  A directory fault, fixed in Entra, not by signing in again. */
    PROFILE_NAME_INVALID: {
        code: 'profile_name_invalid',
        status: 401,
        retryable: false,
        note: 'Stored display name is empty or "undefined undefined". Fix the account in Microsoft Entra ID.'
    },

    // ---------------------------------------------------------------
    // Credential faults (local "Mongo" strategy)
    // ---------------------------------------------------------------

    INVALID_CREDENTIALS: {
        code: 'invalid_credentials',
        status: 401,
        retryable: true,
        note: 'Email or password did not match.'
    },

    RATE_LIMITED: {
        code: 'rate_limited',
        status: 429,
        retryable: false,
        note: 'Too many login attempts from this client. Retry after the window elapses.'
    },

    // ---------------------------------------------------------------
    // SSO callback faults — returned as ?error= on the redirect to /login
    // ---------------------------------------------------------------

    /** The token carried no usable email claim (unique_name / upn /
     *  preferred_username all absent or non-string). A missing parameter, not
     *  a credential failure. */
    MISSING_EMAIL_CLAIM: {
        code: 'missing_email_claim',
        status: 401,
        retryable: false,
        note: 'Entra token carried no usable email claim. Check the app registration claim mapping.'
    },

    /** Email resolved, but no display name in the directory. Refused here so
     *  the directory is corrected at source rather than a guessed name being
     *  written to Mongo. */
    INCOMPLETE_PROFILE: {
        code: 'incomplete_profile',
        status: 401,
        retryable: false,
        note: 'Entra account has no given_name/family_name/name. Add a display name in the directory.'
    },

    /** Neither the id_token nor the access token could be decoded into claims. */
    INVALID_TOKEN_CLAIMS: {
        code: 'invalid_token_claims',
        status: 401,
        retryable: true,
        note: 'Neither id_token nor access_token decoded to a claims object.'
    },

    /** Claims were fine; writing or reading the user in MongoDB failed. */
    USER_PERSIST_FAILED: {
        code: 'user_persist_failed',
        status: 500,
        retryable: true,
        note: 'Database error finding or creating the user during SSO callback.'
    },

    /** Passport reported a failure we cannot attribute more precisely. */
    AUTH_FAILED: {
        code: 'auth_failed',
        status: 401,
        retryable: true,
        note: 'Unattributed SSO failure from passport.'
    }
};

/** Look a definition up by its wire string. */
const BY_CODE = Object.freeze(
    Object.keys(CODES).reduce(function (acc, key) {
        acc[CODES[key].code] = CODES[key];
        return acc;
    }, {})
);

/**
 * Send a failure as JSON, with the operator-facing line logged once.
 * `detail` carries only non-PII diagnostics — booleans, a pid, a path, an _id.
 */
function reject (res, definition, detail) {
    console.warn('[auth] ' + definition.status + ' ' + definition.code + ' ' +
        JSON.stringify(Object.assign({ pid: process.pid }, detail || {})));
    return res.status(definition.status).json({
        message: definition.note,
        code: definition.code
    });
}

module.exports = { CODES: Object.freeze(CODES), BY_CODE: BY_CODE, reject: reject };
