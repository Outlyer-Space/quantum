module.exports = function ensureAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        // Drop the request if the session is incomplete or the profile is corrupted
        if (!req.user || !req.user.auth || !req.user.auth.name || req.user.auth.name === 'undefined undefined') {
            return res.status(401).json({ message: 'Incomplete user profile. Please re-authenticate.' });
        }
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
};
