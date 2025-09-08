const passport = require('passport')

/** setup authentication using passport
 *
 * @param {*} User   - mongoose user model
 * @param {*} config - app configuration
 *
 * Multiple authentication providers are supported (configured in user.js).
 *
 */
module.exports = function (config, User) {
  // config passport using static methods created in user.js

  passport.use(User.createStrategy(config))
  passport.serializeUser(User.serializeUser())
  passport.deserializeUser(User.deserializeUser())

  return passport
}
