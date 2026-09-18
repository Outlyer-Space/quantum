
const express = require('express');         // app framework
const path = require('path');            // path constructor
const morgan = require('morgan');          // request logger
const session = require('express-session'); // session management
const flash = require('connect-flash');   // flash messages
const MongoStore = require('connect-mongo').default || require('connect-mongo'); // session store in MongoDB
const helmet = require('helmet');           // security headers
const mongoSanitize = require('express-mongo-sanitize');

/** creaye the express quantum app
 *
 * @param {*} config   - app configuration
 * @param {*} passport - preconfigured passport module
 * @returns
 */
module.exports = function (config, passport) {
    const app = express();
    const pwd = config.node.path;
    const isProd = process.env.NODE_ENV === 'production';

    // Trust the Azure load balancer to properly set X-Forwarded-Proto
    // This is REQUIRED for express-session to set a secure cookie over HTTP
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: false,  // Angular handles CSP via meta tags
        crossOriginEmbedderPolicy: false
    }));
    app.disable('x-powered-by');

    // Construct the MongoDB URL properly to handle special characters in passwords
    const sessionDbUrl = new URL(config.mongo.url);
    if (config.mongo.usr && config.mongo.pwd) {
        sessionDbUrl.username = config.mongo.usr;
        sessionDbUrl.password = encodeURIComponent(config.mongo.pwd);
    }
    if (sessionDbUrl.protocol.includes('srv')) {
        sessionDbUrl.search = 'retryWrites=true&w=majority';
    }

    // The session secret signs the connect.sid cookie.
    const sessionSecret = process.env.SESSION_SECRET || 'quantum_fallback_shared_secret_8f9e1d2c3b4a5';

    // Give the failure classifier the same secret express-session verifies with,
    // so it can tell an untrusted cookie signature apart from a genuine expiry.
    require('./sessionFailure').configure(sessionSecret);

    app.use(session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        // Persist sessions in MongoDB so they survive restarts and work across
        // multiple container replicas (Azure Container Apps horizontal scaling)
        store: MongoStore.create({
            mongoUrl: sessionDbUrl.href,
            mongoOptions: config.mongo.opt,
            dbName: undefined, // use whatever is in the connection URL
            collectionName: 'sessions',
            ttl: 24 * 60 * 60, // 1 day (seconds)
            autoRemove: 'native'  // MongoDB TTL index handles cleanup
        }),
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,  // 1 day (ms)
            httpOnly: true,                // prevent XSS cookie theft
            secure: isProd,                // HTTPS only in production
            sameSite: 'lax'                // CSRF protection
        }
    }));
    app.use(morgan(config.node.morgan));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(express.json({ limit: '1mb' }));
    app.use((req, res, next) => {
        ['body', 'params', 'headers', 'query'].forEach(k => {
            if (req[k]) {
                mongoSanitize.sanitize(req[k]);
            }
        });
        next();
    });
    app.use(passport.initialize());
    app.use(passport.session());

    app.use(express.static(path.join(pwd, '/public')));
    app.use(flash());

    app.set('port', 3000);                            // port, http://localhost:3000

    return app;
};
