const { legacyRoutes, apiRoutes } = require('./auth.routes');
const systemRoutes = require('./system.routes');
const procedureRoutes = require('./procedure.routes');
const userRoutes = require('./user.routes');
const clientRoutes = require('./client.routes');

module.exports = function (config, app, passport, user) {
    // Legacy redirect-based auth (login form, OAuth2 redirects)
    app.use('/', legacyRoutes(passport, user));
    // Modern SPA JSON API auth
    app.use('/api/auth', apiRoutes(config, passport, user));
    app.use('/api', systemRoutes());
    app.use('/api/procedures', procedureRoutes());
    app.use('/api/users', userRoutes());

    // Catch-all SPA route MUST be mounted last
    app.use('/', clientRoutes());
};
