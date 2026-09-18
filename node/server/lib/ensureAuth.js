// Protects routes: valid session anchored to _id, with a defensive name check
// for any legacy records that pre-date the OAuth callback validation.
// Passport already loads req.user from MongoDB on every request — no extra DB lookup needed.
//
// The two 401s below are DIFFERENT faults and must stay distinguishable:
//   session_not_authenticated -> the session did not restore (cookie signature or store)
//   profile_name_invalid      -> session restored fine, stored display name is unusable
// The log lines carry no tokens, no cookie values and no emails — booleans, a path and an _id.
module.exports = function ensureAuth (req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user._id) {
        // A cookie that arrived but did not restore a session points at signature
        // verification (differing signing keys across workers) or the session store.
        const cookieHeader = req.headers && req.headers.cookie;
        console.warn('[auth] 401 session_not_authenticated ' + JSON.stringify({
            sentSessionCookie: Boolean(cookieHeader && cookieHeader.indexOf('connect.sid') !== -1),
            sessionRestored: Boolean(req.session && req.session.passport),
            path: req.originalUrl
        }));
        return res.status(401).json({ message: 'Unauthorized', code: 'session_not_authenticated' });
    }

    // Matches the validator used in the OAuth callback (user.js) — both layers must agree.
    const name = req.user.auth && typeof req.user.auth.name === 'string' && req.user.auth.name.trim();
    const isValidDisplayName = n => n !== '' && n !== 'undefined undefined';

    if (!isValidDisplayName(name || '')) {
        console.warn('[auth] 401 profile_name_invalid ' + JSON.stringify({
            userId: String(req.user._id),
            path: req.originalUrl
        }));
        return res.status(401).json({
            message: 'Incomplete user profile. Please contact your administrator.',
            code: 'profile_name_invalid'
        });
    }

    return next();
};
