const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
const rateLimit = require('express-rate-limit')

/** defines all routes (urls) and associated actions and/or view
 *
 * @param {*} config    - quantum app configuration
 * @param {*} app       - express app object & config info
 * @param {*} passport  - authentication object & config info
 * @param {*} user      - Mongoose user model
 *
 *    req        - incoming request obj
 *    req.user   - user info in request
 *
 *    res        - outgoing response obj
 *    res.render - create view from template + data
 */
module.exports = function (config, app, passport, user) {

    // ******************************************************************************
    // VIEWS
    // ******************************************************************************



    // ******************************************************************************
    // ACTIONS
    // ******************************************************************************

    // AUTHENTICATION ===============================================================
    // NOTE: use relative urls in redirects

    // Logout
    app.get('/logout', function (req, res, next) {
        req.logout(function (err) {
            if (err) { return next(err); }
            res.redirect('./');
        })
    })

    // Rate limiter for login endpoints
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 15,                  // 15 attempts per window
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many login attempts, please try again later' }
    })

    // "Mongo" strategy login request (form submission)
    app.post('/login_mongo', loginLimiter,
        // map form input to nested user model
        // https://github.com/saintedlama/passport-local-mongoose/issues/243
        function (req, res, next) {
            req.body['auth.email'] = req.body['email']
            next()
        },
        // call passport to authenticate user
        passport.authenticate('local', {
            failureRedirect: './',
            failureFlash: true
        }),
        // user authenticated, find or create in MongoDB
        function (req, res) {
            // if no OIDC id exists we're on local -> use mongo _id
            if (req.user.auth.id == null) {
                req.user.auth.id = req.user._id
            }
            req.user = user.findOneOrCreate(
                { "auth.email": req.user.email },
                req.user
            )
            res.redirect('./dashboard');
        })

    // "Microsoft" strategy login request
    app.get('/login_oauth2',
        passport.authenticate('azure_ad_oauth2'))

    // "Microsoft" strategy callback (redirect)
    app.get('/redirect',
        passport.authenticate('azure_ad_oauth2', { failureRedirect: './login' }),
        function (req, res) {
            res.redirect('./dashboard')
        }
    )

    // =============================================================================
    // MODERN SPA API AUTHENTICATION ENDPOINTS (Returns JSON, NO REDIRECTS)
    // =============================================================================

    app.get('/api/auth/config', function (req, res) {
        res.json({
            provider: config.auth.provider || 'Mongo'
        });
    });

    app.get('/api/auth/me', function (req, res) {
        if (req.isAuthenticated()) {
            var u = req.user.toObject ? req.user.toObject() : Object.assign({}, req.user);
            if (u.auth) { delete u.auth.token; delete u.auth.salt; }
            res.json(u);
        } else {
            res.status(401).json({ message: 'Unauthorized' })
        }
    });

    app.post('/api/auth/logout', function (req, res, next) {
        req.logout(function (err) {
            if (err) { return next(err); }
            res.json({ message: 'Logged out successfully' });
        });
    });

    app.post('/api/auth/login', loginLimiter,
        function (req, res, next) {
            req.body['auth.email'] = req.body['email']
            next()
        },
        function (req, res, next) {
            passport.authenticate('local', function (err, _user, info) {
                if (err) { return res.status(500).json({ message: 'Internal server error' }); }
                if (!_user) { return res.status(401).json({ message: 'Invalid credentials' }); }

                req.logIn(_user, function (err) {
                    if (err) { return res.status(500).json({ message: 'Login failed' }); }

                    // if no OIDC id exists we're on local -> use mongo _id
                    if (req.user.auth.id == null) {
                        req.user.auth.id = req.user._id
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

    // PROCEDURES ==================================================================

    // models & controllers
    require('./models/user')
    require('./models/procedure')
    var usr = require('./controllers/user.controller')
    var procs = require('./controllers/procedure.controller')
    var system = require('./controllers/system.controller')

    // middleware
    var ensureLeadRole = require('./lib/ensureLeadRole')
    var { ensureMissionAccess, ensureProcedureMissionAccess } = require('./lib/ensureMissionAccess')
    var ensureNotVip = require('./lib/ensureNotVip')

    // file upload (multer)
    var multer = require('multer')
    var upload = multer({
        dest: '/tmp/quantum',
        limits: {
            fileSize: 10 * 1024 * 1024,  // 10 MB max
            files: 1                      // single file only
        },
        fileFilter: function (req, file, cb) {
            var allowed = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only .xlsx and .xls files are allowed'));
            }
        }
    })

    // Helper: ensure the request is authenticated (JSON 401, no redirect)
    function ensureAuth(req, res, next) {
        if (req.isAuthenticated && req.isAuthenticated()) return next();
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // ===========================================================================
    // SYSTEM API
    // ===========================================================================
    app.get('/api/version', ensureAuth, system.getVersion);
    app.get('/api/status', ensureAuth, system.getStatus);

    // ===========================================================================
    // PROCEDURES API
    // ===========================================================================
    // List endpoint: ensureMissionAccess sets req.userMissionNames for query filtering
    app.get('/api/procedures',                          ensureAuth, ensureMissionAccess, procs.getProcedureList);
    // Single-procedure endpoints: ensureProcedureMissionAccess verifies the user belongs to that procedure's mission
    app.get('/api/procedures/single',                   ensureAuth, ensureProcedureMissionAccess, procs.getSingleProcedure);
    app.get('/api/procedures/data',                     ensureAuth, ensureProcedureMissionAccess, procs.getProcedureData);
    app.get('/api/procedures/roles',                    ensureAuth, procs.getQuantumRoles);
    app.post('/api/procedures/upload',                  ensureAuth, ensureMissionAccess, upload.single('file'), ensureNotVip, procs.uploadFile);
    app.patch('/api/procedures/name',                   ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.updateProcedureName);
    app.get('/api/procedures/instances',                ensureAuth, ensureProcedureMissionAccess, procs.getAllInstances);
    // /api/procedures/instances/live route removed as it's superseded by /api/procedures/single
    app.post('/api/procedures/instances',               ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.saveProcedureInstance);
    app.post('/api/procedures/instances/steps',         ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.setInfo);
    app.post('/api/procedures/instances/complete',      ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.setInstanceCompleted);
    app.post('/api/procedures/instances/comments',      ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.setComments);
    app.get('/api/procedures/instances/users',           ensureAuth, ensureProcedureMissionAccess, procs.getInstanceUsers);
    app.post('/api/procedures/instances/user-status',   ensureAuth, ensureProcedureMissionAccess, procs.setUserStatus); // Allowing user-status so VIPs might be able to leave/join? Or should VIP not be able to join/leave?
    app.post('/api/procedures/instances/parent-steps',  ensureAuth, ensureProcedureMissionAccess, ensureNotVip, procs.setParentsInfo);

    // ===========================================================================
    // USERS API
    // ===========================================================================
    app.get('/api/users',                               ensureAuth, ensureLeadRole, usr.getUsers);
    app.get('/api/users/roles',                         ensureAuth, usr.getRoles);
    app.get('/api/users/missions',                     ensureAuth, ensureLeadRole, usr.getMissions);
    app.get('/api/users/user-missions',                 ensureAuth, ensureLeadRole, usr.getUserMissions);
    app.post('/api/users/mission',                      ensureAuth, ensureLeadRole, usr.setMissionForUser);
    app.post('/api/users/mission/remove',               ensureAuth, ensureLeadRole, usr.removeMissionFromUser);
    app.get('/api/users/current-role',                  ensureAuth, usr.getCurrentRole);
    app.get('/api/users/allowed-roles',                 ensureAuth, usr.getAllowedRoles);
    app.post('/api/users/role',                         ensureAuth, usr.setUserRole);  // self-only: controller enforces caller == target
    app.post('/api/users/allowed-roles',                ensureAuth, ensureLeadRole, usr.setAllowedRoles);
    app.get('/api/users/role-status',                   ensureAuth, usr.getUsersCurrentRole);

    const path = require('path')
    app.get('*', function (req, res) {
        res.sendFile(path.join(__dirname, '../public/index.html'))
    })
};
