
const express = require('express');         // app framework
const path = require('path');            // path constructor
const morgan = require('morgan');          // request logger
// NOTE: cookie-parser was removed — it conflicts with express-session when
// called without a matching secret, causing session deserialization failures
// on redirect-based SSO flows (the root cause of the production 401).
// express-session has its own cookie parser; nothing else needs req.cookies.
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

    // The session secret signs the connect.sid cookie. It MUST be identical in
    // every process that serves the app: production runs pm2 in cluster mode
    // (pm2.config.js, instances: 0 -> one worker per CPU), and Azure Container
    // Apps may run several replicas on top of that. A per-process random secret
    // still "works" for whichever worker issued the cookie and fails signature
    // verification on every other one, so a logged-in user gets an intermittent
    // 401 session_not_authenticated as requests round-robin between workers —
    // mid-session, with the cookie present, which looks exactly like session
    // expiry and is not. Refuse to start rather than serve that silently.
    //
    // ALLOW_EPHEMERAL_SESSION_SECRET=true suppresses the hard failure for one
    // diagnostic deploy, so the fingerprint line below can be observed in a
    // running production container without taking the app down. Remove it from
    // the Container App once the cause is confirmed.
    const crypto = require('crypto');
    const allowEphemeral = process.env.ALLOW_EPHEMERAL_SESSION_SECRET === 'true';
    const sessionSecret = process.env.SESSION_SECRET || (function () {
        if (isProd && !allowEphemeral) {
            throw new Error(
                'SESSION_SECRET is not set. Refusing to start in production: a random ' +
                'per-process secret makes sessions fail intermittently across pm2 cluster ' +
                'workers and Container App replicas. Set SESSION_SECRET on the Container App.'
            );
        }
        console.error('WARNING: SESSION_SECRET not set — using ephemeral random fallback (sessions will not survive restarts)');
        return crypto.randomBytes(32).toString('hex');
    })();

    // Proof line. Every process that serves the app prints this once at boot.
    // The fingerprint is a truncated SHA-256 of the secret, not the secret — it
    // reveals nothing, but it is identical iff the secret is identical. If the
    // workers in one container print DIFFERENT fingerprints, cookie signatures
    // cannot survive a hop between them and the intermittent 401 is explained.
    // The pid is echoed on every 401 (ensureAuth.js, /api/auth/me) so a rejection
    // can be traced back to the worker that issued it.
    console.log('[auth] session secret fingerprint ' +
        crypto.createHash('sha256').update(sessionSecret).digest('hex').slice(0, 12) +
        ' (pid ' + process.pid + ', source: ' +
        (process.env.SESSION_SECRET ? 'SESSION_SECRET' : 'EPHEMERAL RANDOM — per-process, sessions will not survive a hop between workers') + ')');

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
