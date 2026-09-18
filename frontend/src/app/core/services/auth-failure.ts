/**
 * Auth failure taxonomy — the frontend half.
 *
 * MIRRORS: node/server/lib/authCodes.js
 * The server owns classification and sends a `code`; this file owns the wording
 * the user reads and whether the failure is worth retrying.
 *
 * `retryable` is the important field. It decides whether a failure may bounce
 * the user back through the login flow. A non-retryable fault cannot be fixed
 * by signing in again — an account with no display name in Entra, a deleted
 * user record — so sending them to the login page to try again produces an
 * infinite loop and no information. Those get one accurate explanation and the
 * redirect guard is deliberately left engaged.
 */

export type AuthFailureCode =
    // Session faults
    | 'no_session_cookie'
    | 'session_cookie_untrusted'
    | 'session_expired'
    | 'session_not_authenticated'
    | 'user_not_found'
    | 'profile_name_invalid'
    // Credential faults
    | 'invalid_credentials'
    | 'rate_limited'
    // SSO callback faults
    | 'missing_email_claim'
    | 'incomplete_profile'
    | 'invalid_token_claims'
    | 'user_persist_failed'
    | 'auth_failed';

export interface AuthFailure {
    /** Shown to the user on the login page. States the cause, and who fixes it. */
    readonly message: string;
    /** Could signing in again plausibly resolve this? Drives the redirect guard. */
    readonly retryable: boolean;
    /** Logged to the console for whoever is debugging, not shown to the user. */
    readonly diagnostic: string;
}

export const AUTH_FAILURES: Readonly<Record<AuthFailureCode, AuthFailure>> = {
    // ---------------------------------------------------------------
    // Session faults
    // ---------------------------------------------------------------
    no_session_cookie: {
        message: 'You are not signed in. Please sign in to continue.',
        retryable: true,
        diagnostic: 'No session cookie was sent. Normal on a first visit; if it persists, the browser is blocking the cookie (SameSite, Secure, or third-party cookie settings).'
    },
    session_cookie_untrusted: {
        message: 'Your session could not be verified, so you have been signed out. Please sign in again. If this keeps happening, report it to your administrator — it is a server configuration fault, not a problem with your account.',
        retryable: true,
        diagnostic: 'Cookie signature did not verify. The cookie was signed with a different key than this server holds — SESSION_SECRET unset, rotated, or differing across workers/replicas. NOT expiry.'
    },
    session_expired: {
        message: 'Your session has expired. Please sign in again.',
        retryable: true,
        diagnostic: 'Cookie signature verified but the session record is no longer in the store — genuine expiry or eviction.'
    },
    session_not_authenticated: {
        message: 'You have been signed out. Please sign in again.',
        retryable: true,
        diagnostic: 'A valid session exists but carries no authenticated user.'
    },
    user_not_found: {
        message: 'Your user account could not be found. Please contact your administrator — signing in again will not restore it.',
        retryable: false,
        diagnostic: 'The session references a user id that no longer resolves in MongoDB.'
    },
    profile_name_invalid: {
        message: 'Your Microsoft account has no display name. Please ask your administrator to add one in Microsoft Entra ID. Signing in again will not resolve this.',
        retryable: false,
        diagnostic: 'Session and user are valid; the stored display name is empty or "undefined undefined".'
    },

    // ---------------------------------------------------------------
    // Credential faults
    // ---------------------------------------------------------------
    invalid_credentials: {
        message: 'That email and password combination was not recognised.',
        retryable: true,
        diagnostic: 'Local strategy rejected the credentials.'
    },
    rate_limited: {
        message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
        retryable: false,
        diagnostic: 'Rate limiter tripped — 15 attempts per 15 minutes. Retrying immediately will not help.'
    },

    // ---------------------------------------------------------------
    // SSO callback faults
    // ---------------------------------------------------------------
    missing_email_claim: {
        message: 'Microsoft sign-in did not return an email address for your account. Please contact your administrator — this is a directory configuration issue.',
        retryable: false,
        diagnostic: 'No usable unique_name / upn / preferred_username claim. Check the app registration claim mapping.'
    },
    incomplete_profile: {
        message: 'Your Microsoft account has no display name. Please ask your administrator to add one in Microsoft Entra ID. Signing in again will not resolve this.',
        retryable: false,
        diagnostic: 'Entra account has no given_name/family_name/name claim.'
    },
    invalid_token_claims: {
        message: 'Microsoft sign-in returned a response we could not read. Please try again.',
        retryable: true,
        diagnostic: 'Neither id_token nor access_token decoded to a claims object.'
    },
    user_persist_failed: {
        message: 'We could not complete your sign-in because of a temporary server problem. Please try again in a moment.',
        retryable: true,
        diagnostic: 'Database error during findOneOrCreate in the SSO callback.'
    },
    auth_failed: {
        message: 'Microsoft sign-in failed. Please try again or contact your administrator.',
        retryable: true,
        diagnostic: 'Unattributed passport failure.'
    }
};

/** Fallback for a code this build does not know — an older or newer server. */
export const UNKNOWN_AUTH_FAILURE: AuthFailure = {
    message: 'Sign-in failed. Please try again or contact your administrator.',
    retryable: true,
    diagnostic: 'Unrecognised auth failure code — server and frontend builds may be out of step.'
};

/** Resolve any string to a failure definition. Never throws. */
export function resolveAuthFailure(code: string | null | undefined): AuthFailure {
    if (!code) { return UNKNOWN_AUTH_FAILURE; }
    return AUTH_FAILURES[code as AuthFailureCode] ?? UNKNOWN_AUTH_FAILURE;
}
