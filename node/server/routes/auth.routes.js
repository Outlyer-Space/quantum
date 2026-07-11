const express = require('express');
const rateLimit = require('express-rate-limit');

// Rate limiter for login endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,                  // 15 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again later' }
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
            req.body['auth.email'] = req.body['email'];
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
                { "auth.email": req.user.email },
                req.user
            );
            res.redirect('./dashboard');
        }
    );

    // "Microsoft" strategy login request
    router.get('/login_oauth2', passport.authenticate('azure_ad_oauth2'));

    // "Microsoft" strategy callback (redirect)
    router.get('/redirect',
        passport.authenticate('azure_ad_oauth2', { failureRedirect: './login' }),
        function (req, res) {
            res.redirect('./dashboard');
        }
    );

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

    router.get('/me', function (req, res) {
        if (req.isAuthenticated()) {
            var u = req.user.toObject ? req.user.toObject() : Object.assign({}, req.user);
            if (u.auth) { delete u.auth.token; delete u.auth.salt; }
            res.json(u);
        } else {
            res.status(401).json({ message: 'Unauthorized' });
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
            req.body['auth.email'] = req.body['email'];
            next();
        },
        function (req, res, next) {
            passport.authenticate('local', function (err, _user, info) {
                if (err) { return res.status(500).json({ message: 'Internal server error' }); }
                if (!_user) { return res.status(401).json({ message: 'Invalid credentials' }); }

                req.logIn(_user, function (err) {
                    if (err) { return res.status(500).json({ message: 'Login failed' }); }

                    if (req.user.auth.id == null) {
                        req.user.auth.id = req.user._id;
                    }

                    user.findOneOrCreate(
                        { "auth.email": req.user.auth.email },
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
