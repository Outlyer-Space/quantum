const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn

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
module.exports = function(config, app, passport, user) {

    // ******************************************************************************
    // VIEWS
    // ******************************************************************************

	// Home + Login page
    app.get('/', function(req, res) {
        const flashMsg = req.flash('error')
        console.log(flashMsg)
        res.render('index.ejs', {
            login: config.auth.provider,
            flash: flashMsg
        })
    })

    // Dashboard (main view)
    app.get('/dashboard', ensureLoggedIn('./'), function(req, res) {
        res.render('dashboard.ejs', {
            user : req.user
        })
    })

    // User Info (settings)
    app.get('/profile', ensureLoggedIn('./'), function(req, res) {
        res.render('profile.ejs', {
            user : req.user
        })
    })

    // ******************************************************************************
    // ACTIONS
    // ******************************************************************************

    // AUTHENTICATION ===============================================================
    // NOTE: use relative urls in redirects

    // Logout
    app.get('/logout', function(req, res, next) {
        req.logout(function(err) {
          if (err) { return next(err); }
          res.redirect('./');
        })
      })

    // "Mongo" strategy login request (form submission)
    app.post('/login_mongo',
        // map form input to nested user model
        // https://github.com/saintedlama/passport-local-mongoose/issues/243
        function(req,res, next){
            console.log('Login request:')
            console.log(req.body)
            req.body['auth.email'] = req.body['email']
            next()
        },
        // call passport to authenticate user
        passport.authenticate('local', {
            failureRedirect : './',
            failureFlash : true
        }),
        // user authenticated, find or create in MongoDB
        function(req, res) {
            // if no OIDC id exists we're on local -> use mongo _id
            if (req.user.auth.id == null){
                req.user.auth.id = req.user._id
            }
            console.log(`User login: ${req.user}`)
            console.log(`SessionID : ${req.sessionID}`)
            req.user = user.findOneOrCreate(
                { "auth.email" : req.user.email},
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
            console.log("User authenticated OK")
            res.redirect('./dashboard')
        }
    )

    // PROCEDURES ==================================================================

    // models & controllers
    require('./models/user')
    require('./models/procedure')
    var usr   =  require('./controllers/user.controller')
    var procs =  require('./controllers/procedure.controller')

    // file upload (multer)
    var multer = require('multer')
    var upload = multer({ dest: '/tmp/quantum' })

    //To save procedures
    app.post('/upload',upload.single('file'),procs.uploadFile);

    //Displays all the available procedures in a table
    app.get('/getProcedureList',procs.getProcedureList);

    //Gets all the sections of the procedure
    app.get('/getProcedureData',procs.getProcedureData);

    //save procedure instance
    app.post('/saveProcedureInstance',procs.saveProcedureInstance);

    //Displays all the available procedures in a table
    app.post('/setInfo',procs.setInfo);

    //Displays all the available procedures in a table
    app.post('/setInstanceCompleted',procs.setInstanceCompleted);

    //Gets all the sections of the live instance
    app.get('/getLiveInstanceData',procs.getLiveInstanceData);

    //Gets all running instances and archived instances of a procedure
    app.get('/getAllInstances',procs.getAllInstances);

    //set user's mission property and roles(if needed)
    app.post('/setMissionForUser',usr.setMissionForUser);

    //get current role of the user
    app.get('/getCurrentRole',usr.getCurrentRole);

    //get allowed roles of the user
    app.get('/getAllowedRoles',usr.getAllowedRoles);

    //set user's current role in the database
    app.post('/setUserRole',usr.setUserRole);

    //Get Users list
    app.get('/getUsers',usr.getUsers);

    //get roles configured in server code
    app.get('/getRoles',usr.getRoles);

    //set user's allowed roles in the database
    app.post('/setAllowedRoles',usr.setAllowedRoles);

    //set comments
    app.post('/setComments',procs.setComments);

    //set user status
    app.post('/setUserStatus',procs.setUserStatus);

    //get user current role
    app.get('/getUsersCurrentRole',usr.getUsersCurrentRole);

    //update procedure name
    app.post('/updateProcedureName',procs.updateProcedureName);

    //get quantum user roles
    app.get('/getQuantumRoles',procs.getQuantumRoles);

    //update parents info
    app.post('/setParentsInfo',procs.setParentsInfo);

};
