// Protects routes: valid session anchored to _id, with a defensive name check
// for any legacy records that pre-date the OAuth callback validation.
// Passport already loads req.user from MongoDB on every request — no extra DB lookup needed.
module.exports = function ensureAuth (req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user._id) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Matches the validator used in the OAuth callback (user.js) — both layers must agree.
    const name = req.user.auth && typeof req.user.auth.name === 'string' && req.user.auth.name.trim();
    const isValidDisplayName = n => n !== '' && n !== 'undefined undefined';

    if (!isValidDisplayName(name || '')) {
        return res.status(401).json({ message: 'Incomplete user profile. Please contact your administrator.' });
    }

    return next();
};
