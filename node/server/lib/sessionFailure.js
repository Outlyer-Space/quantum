/**
 * Classifies WHY a request has no authenticated user.
 *
 * "401" on its own is not a diagnosis. These four states have four different
 * causes and four different remedies, and until now they all surfaced as one
 * indistinguishable "session expired":
 *
 *   no_session_cookie        no connect.sid at all      -> first visit, or the
 *                                                          browser is dropping it
 *   session_cookie_untrusted signature does not verify  -> SESSION_SECRET unset,
 *                                                          rotated, or differing
 *                                                          across workers/replicas
 *   session_expired          signature OK, store empty  -> genuine expiry/eviction
 *   session_not_authenticated live session, no user     -> signed out
 *   user_not_found           user id no longer resolves -> account deleted
 *
 * The signature check is what separates the second from the third, and it is the
 * whole reason this module exists: a cookie rejected for a bad signature is not
 * an expired cookie, and telling the user it expired sends them around a login
 * loop that cannot help them.
 *
 * Implemented against Node's crypto directly rather than taking a dependency on
 * cookie-signature. express-session signs cookies as:
 *     's:' + sessionId + '.' + base64(HMAC-SHA256(sessionId, secret))
 * with trailing '=' padding stripped. That is the entire format.
 */

const crypto = require('crypto');
const { CODES } = require('./authCodes');

/** Secrets used to verify cookie signatures. Set once from app.js so this
 *  module always checks against exactly what express-session was given. */
let secrets = [];

/** Called from app.js with the same secret handed to express-session. */
function configure (secret) {
    secrets = (Array.isArray(secret) ? secret : [secret]).filter(function (s) {
        return typeof s === 'string' && s.length > 0;
    });
}

/** Pull the raw connect.sid value off the Cookie header. */
function readSessionCookie (req) {
    const header = req.headers && req.headers.cookie;
    if (!header) { return null; }
    const match = /(?:^|;\s*)connect\.sid=([^;]*)/.exec(header);
    if (!match) { return null; }
    try {
        return decodeURIComponent(match[1]) || null;
    } catch (e) {
        return match[1] || null;
    }
}

/** Verify the cookie's HMAC. Returns the session id, or false if untrusted. */
function unsign (raw) {
    if (raw.slice(0, 2) !== 's:') { return false; }
    const signed = raw.slice(2);
    const dot = signed.lastIndexOf('.');
    if (dot < 1) { return false; }

    const sessionId = signed.slice(0, dot);
    const given = Buffer.from(signed.slice(dot + 1));

    for (let i = 0; i < secrets.length; i++) {
        const expected = Buffer.from(
            crypto.createHmac('sha256', secrets[i])
                .update(sessionId)
                .digest('base64')
                .replace(/=+$/, '')
        );
        // Length check first: timingSafeEqual throws on a length mismatch.
        if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
            return sessionId;
        }
    }
    return false;
}

/**
 * Returns the authCodes definition describing why `req` has no authenticated
 * user. Only call this once that is already established.
 */
function classify (req) {
    const raw = readSessionCookie(req);
    if (!raw) { return CODES.NO_SESSION_COOKIE; }

    // Without a configured secret we cannot tell untrusted from expired, and a
    // confident wrong answer is worse than an unspecific one.
    if (secrets.length === 0) { return CODES.SESSION_NOT_AUTHENTICATED; }

    const sessionId = unsign(raw);
    if (sessionId === false) { return CODES.SESSION_COOKIE_UNTRUSTED; }

    // Signature verified, so this deployment issued the cookie. If the store had
    // no record, express-session has already discarded it and generated a fresh
    // session — so a sessionID that no longer matches the cookie means the
    // record is gone from the store.
    if (!req.session || req.sessionID !== sessionId) { return CODES.SESSION_EXPIRED; }

    if (!req.session.passport || !req.session.passport.user) {
        return CODES.SESSION_NOT_AUTHENTICATED;
    }

    // The session names a user, but deserializeUser produced nothing.
    return CODES.USER_NOT_FOUND;
}

/** Non-PII diagnostics for the log line: booleans, a path, never a cookie value. */
function detail (req, path) {
    return {
        sentSessionCookie: readSessionCookie(req) !== null,
        sessionRestored: Boolean(req.session && req.session.passport),
        path: path || req.originalUrl
    };
}

module.exports = { configure: configure, classify: classify, detail: detail };
