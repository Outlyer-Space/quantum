
const express      = require('express')         // app framework
const path         = require('path')            // path constructor
const morgan       = require('morgan')          // request logger
const cookieParser = require('cookie-parser')   // cookie parser
const bodyParser   = require('body-parser')     // body parser
const flash        = require('connect-flash')   // flash messages
const session      = require('express-session') // session management

/** creaye the express quantum app
 *
 * @param {*} config   - app configuration
 * @param {*} passport - preconfigured passport module
 * @returns
 */
module.exports = function (config, passport) {
  const app = express()
  const pwd = config.node.path

  app.use(session({
    secret: 'one_step_at_a_time',
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
  }))
  app.use(morgan(config.node.morgan))
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(bodyParser.json())
  app.use(cookieParser())
  app.use(passport.initialize())
  app.use(passport.session())
  app.use(express.static(path.join(pwd, '/app')))
  app.use(flash())

  app.set('port', 3000)                            // port, http://localhost:3000
  app.set('views', path.join(pwd, '/app/views'))   // views def directory
  app.set('view engine', 'ejs')                    // use ejs for templating

  return app
}
