const express = require('express');
const rateLimit = require('express-rate-limit');
const { CODES, BY_CODE, reject } = require('../lib/authCodes');
const sessionFailure = require('../lib/sessionFailure');

// Rate limiter for login endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,                  // 15 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    // Carries a code like every other failure, so the SPA can say "too many
    // attempts, wait" rather than folding it into a generic sign-in error.
    message: {
        message: CODES.RATE_LIMITED.note,
        code: CODES.RATE_LIMITED.code
    }
});

/**
 * Legacy form-based auth routes (redirect-based flows).
 * Mounted at: /
 */
module.exports.legacyRoutes = function (passport, user) {
    const router = express.Router();

    // Logout (redirect)
    router.get('/logout', function (req, res, next) {
        req.logout(function (err) {
            if (err) { return next(err); }
            res.redirect('./');
        });
    });

    // "Mongo" strategy login request (form submission)
    router.post('/login_mongo', loginLimiter,
        function (req, res, next) {
            req.body['auth.email'] = req.body.email;
            next();
        },
        passport.authenticate('local', {
            failureRedirect: './',
            failureFlash: true
        }),
        function (req, res) {
            if (req.user.auth.id == null) {
                req.user.auth.id = req.user._id;
            }
            req.user = user.findOneOrCreate(
                { 'auth.email': req.user.email },
                req.user
            );
            res.redirect('./dashboard');
        }
    );

    // "Microsoft" strategy login request
    router.get('/login_oauth2', passport.authenticate('azure_ad_oauth2'));

    // "Microsoft" strategy callback (redirect)
    router.get('/redirect', function (req, res, next) {
        passport.authenticate('azure_ad_oauth2', function (err, user, info) {
            if (err) { return next(err); }
            if (!user) {
                // Append the error code as a query param so the Angular SPA can render it.
                // Only codes the registry knows are forwarded — an unrecognised string
                // would reach the login page as an unrenderable param and, worse, put
                // attacker-controlled text in a URL we then echo back to the user.
                const reported = info && info.message;
                const known = Object.prototype.hasOwnProperty.call(BY_CODE, reported);
                if (!known && reported) {
                    console.warn('[auth] SSO callback reported an unregistered code ' +
                        JSON.stringify({ reported: String(reported).slice(0, 64), pid: process.pid }));
                }
                const code = known ? reported : CODES.AUTH_FAILED.code;
                console.warn('[auth] SSO callback rejected ' +
                    JSON.stringify({ code: code, pid: process.pid }));
                return res.redirect(`./login?error=${encodeURIComponent(code)}`);
            }
            req.logIn(user, function (err) {
                if (err) { return next(err); }
                // Await DB save before redirecting to prevent session race conditions
                req.session.save(function(saveErr) {
                    if (saveErr) {
                        console.error('[auth] Error saving session before redirect:', saveErr);
                        return next(saveErr);
                    }
                    return res.redirect('./dashboard');
                });
            });
        })(req, res, next);
    });

    return router;
};

/**
 * Modern SPA JSON API auth routes (no redirects).
 * Mounted at: /api/auth
 */
module.exports.apiRoutes = function (config, passport, user) {
    const router = express.Router();

    router.get('/config', function (req, res) {
        res.json({ provider: config.auth.provider || 'Mongo' });
    });

    // NOTE: this route deliberately does NOT use ensureAuth — it reports session
    // state rather than guarding a resource, and a 401 here is a normal
    // "not logged in yet" answer. It carries the same diagnostic code as
    // ensureAuth so the two can be correlated; the AuthService polls it every 5s.
    router.get('/me', function (req, res) {
        if (req.isAuthenticated()) {
            var u = req.user.toObject ? req.user.toObject() : Object.assign({}, req.user);
            if (u.auth) { delete u.auth.token; delete u.auth.salt; }
            res.json(u);
        } else {
            // Same classifier ensureAuth uses, so a 401 here and a 401 on a
            // guarded route report the same cause for the same underlying fault.
            const failure = sessionFailure.classify(req);
            reject(res, failure, sessionFailure.detail(req, '/api/auth/me'));
        }
    });

    router.post('/logout', function (req, res, next) {
        req.logout(function (err) {
            if (err) { return next(err); }
            res.json({ message: 'Logged out successfully' });
        });
    });

    router.post('/login', loginLimiter,
        function (req, res, next) {
            req.body['auth.email'] = req.body.email;
            next();
        },
        function (req, res, next) {
            passport.authenticate('local', function (err, _user, info) {
                if (err) { return res.status(500).json({ message: 'Internal server error' }); }
                if (!_user) { return reject(res, CODES.INVALID_CREDENTIALS, { path: '/api/auth/login' }); }

                req.logIn(_user, function (err) {
                    if (err) { return res.status(500).json({ message: 'Login failed' }); }

                    if (req.user.auth.id == null) {
                        req.user.auth.id = req.user._id;
                    }

                    user.findOneOrCreate(
                        { 'auth.email': req.user.auth.email },
                        req.user
                    ).then(u => {
                        req.user = u;
                        res.json(u);
                    }).catch(error => {
                        console.error('Error finding/creating user:', error);
                        res.status(500).json({ message: 'Database error finalizing login' });
                    });
                });
            })(req, res, next);
        }
    );

    return router;
};
