// Protects routes: valid session anchored to _id, with a defensive name check
// for any legacy records that pre-date the OAuth callback validation.
// Passport already loads req.user from MongoDB on every request — no extra DB lookup needed.
//
// Every rejection carries a machine-readable code from lib/authCodes.js. The
// session-level faults are told apart by lib/sessionFailure.js, which verifies
// the cookie signature so that "we do not trust this cookie" is never reported
// as "your session expired" — they have different causes and different fixes.
//
// Log lines carry no tokens, no cookie values and no emails — booleans, a pid,
// a path and an _id.

const { CODES, reject } = require('./authCodes');
const sessionFailure = require('./sessionFailure');

module.exports = function ensureAuth (req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user._id) {
        const failure = sessionFailure.classify(req);
        return reject(res, failure, sessionFailure.detail(req));
    }

    // Matches the validator used in the OAuth callback (user.js) — both layers must agree.
    const name = req.user.auth && typeof req.user.auth.name === 'string' && req.user.auth.name.trim();
    const isValidDisplayName = n => n !== '' && n !== 'undefined undefined';

    if (!isValidDisplayName(name || '')) {
        return reject(res, CODES.PROFILE_NAME_INVALID, {
            userId: String(req.user._id),
            path: req.originalUrl
        });
    }

    return next();
};
