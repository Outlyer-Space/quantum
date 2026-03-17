
const express = require('express')         // app framework
const path = require('path')            // path constructor
const morgan = require('morgan')          // request logger
const cookieParser = require('cookie-parser')   // cookie parser
const bodyParser = require('body-parser')     // body parser
const flash = require('connect-flash')   // flash messages
const session = require('express-session') // session management
const helmet = require('helmet')           // security headers
const mongoSanitize = require('express-mongo-sanitize')

/** creaye the express quantum app
 *
 * @param {*} config   - app configuration
 * @param {*} passport - preconfigured passport module
 * @returns
 */
module.exports = function (config, passport) {
  const app = express()
  const pwd = config.node.path
  const isProd = process.env.NODE_ENV === 'production'

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,  // Angular handles CSP via meta tags
    crossOriginEmbedderPolicy: false
  }))
  app.disable('x-powered-by')

  app.use(session({
    secret: process.env.SESSION_SECRET || (function() { console.error('WARNING: SESSION_SECRET not set — using ephemeral random fallback (sessions will not survive restarts)'); return require('crypto').randomBytes(32).toString('hex'); })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,  // 1 day
      httpOnly: true,                // prevent XSS cookie theft
      secure: isProd,                // HTTPS only in production
      sameSite: 'lax'                // CSRF protection
    }
  }))
  app.use(morgan(config.node.morgan))
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }))
  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(mongoSanitize()) // strip $ and . from req.body, req.query, req.params
  app.use(cookieParser())
  app.use(passport.initialize())
  app.use(passport.session())

  if (process.env.SERVE_ANGULAR === 'true') {
    app.use(express.static(path.join(pwd, '/public')))
  }
  app.use(express.static(path.join(pwd, '/app')))
  app.use(flash())

  app.set('port', 3000)                            // port, http://localhost:3000
  app.set('views', path.join(pwd, '/app/views'))   // views def directory
  app.set('view engine', 'ejs')                    // use ejs for templating

  return app
}
