
const passportLocalMongoose = require('passport-local-mongoose')
const passportAzureADoauth2 = require('passport-azure-ad-oauth2')
const jwt                   = require('jsonwebtoken')

/** Defines the user model, exports to mongoose
 *
 * @param {*} config    - app config
 * @param {*} mongoose  - db connector
 *
 * passport-local-mongoose is used to create the local ('Mongo') authentication
 * https://github.com/saintedlama/passport-local-mongoose
 *
 * passport-azure-ad-oath2 is used to create the 'Microsoft' athentication
 * https://www.passportjs.org/packages/passport-azure-ad-oauth2/
 *
 * @returns
 */
module.exports = function (config, mongoose) {
  // enable push for all models
  mongoose.plugin(schema => {
    schema.options.usePushEach = true
  })

  // define user model schema
  // Note: token can be SSO or local password
  const userSchema = new mongoose.Schema({
    auth: {
      id: { type: String, required: false },    // duplicates _id in local strategy
      token: { type: String, required: true },    // OIDC token (azure_ad) or pwd (local)
      email: { type: String, required: true },
      name: { type: String, required: true },
      salt: { type: String, required: false }    // only used by local strategy
    },
    grid: { type: Array },
    missions: { type: Array }
  })

  // Plugin authentication for passport
  const msg = `ERROR Unrecognized auth provider: ${config.auth.provider}`
  const errorMessage =  { code: 403, message: msg }

  switch (config.auth.provider.toLowerCase()) {
    case 'mongo':
      /** passportLocalMongoose adds the following static methods
       *  to the User Model schema (via plugin):
       *
       *   userSchem.statics: {
       *     authenticate:    [Function (anonymous)],
       *     serializeUser:   [Function (anonymous)],
       *     deserializeUser: [Function (anonymous)],
       *     register:        [Function (anonymous)],
       *     findByUsername:  [Function (anonymous)],
       *     createStrategy:  [Function (anonymous)]
       *    }
       */
      userSchema.plugin(passportLocalMongoose,
        {
          usernameField: 'auth.email',  // custom username field
          hashField: 'auth.token',      // custom password field
          saltField: 'auth.salt'        // custom salt field
        })
      // console.log(userSchema.statics)
      // console.log(userSchema.statics.serializeUser.toString())
      break

    case 'microsoft':
      /** create static methods needed by passport for AzureAD strategy
       *  https://www.passportjs.org/packages/passport-azure-ad-oauth2
       *
       *   userSchem.statics: {
       *     serializeUser:   [Function (anonymous)],
       *     deserializeUser: [Function (anonymous)],
       *     createStrategy:  [Function (anonymous)]
       *    }
       */
      userSchema.statics.createStrategy = function (config) {
        const strategy = new passportAzureADoauth2(
          {
            clientID: config.auth.clientID,
            clientSecret: config.auth.clientSecret,
            tenantID: config.auth.tenantID,
            callbackURL: config.auth.callbackURL,
            passReqToCallback: true
          },
          /** callback executed after authentication attempt on AzureAD
           *
           * @param {*} req     - web request
           * @param {*} res     - return (token)
           * @param {*} param   - token
           * @param {*} profile - obj that identifies provider strategy
           * @param {*} next    - next function in call stack (either fail or success fct)
           */
          function (req, res, param, profile, next) {
            // decode token and add to profile object
            profile  = { ...profile, ...jwt.decode(res) }

            // assemble user mongo document (in case of new user)
            let userInfo = {
              auth: {
                id: profile.oid,
                token: res,
                email: profile.unique_name,
                name: `${profile.given_name} ${profile.family_name}`
              }
            }

            // find or create user in quantum db, and return
            // "user._id" which is used in session serialization
            userInfo = User.findOneOrCreate(
              { 'auth.email': profile.unique_name },
              userInfo
            ).then(userInfo => {
              if (config.node.environ === 'development') {
                console.log('Quantum User found/created:')
                console.log(`${userInfo.auth.email} : ${userInfo._id}`)
                console.log('next function is')
                console.log(next.toString())
              }
              // call next fct in stack: function(err, user, info)
              next(undefined, userInfo)
            })
          }
        )
        return strategy
      }
      userSchema.statics.serializeUser = function () {
        return function (user, done) {
          done(null, user.id)
        }
      }
      userSchema.statics.deserializeUser = function () {
        return function (id, done) {
          User.findById(id, function (err, user) {
            done(err, user)
          })
        }
      }

      // console.log(userSchema.statics)
      // console.log(userSchema.statics.serializeUser.toString())
      break

    default:
      throw errorMessage
  }

  // static function to find or create a user from email (called at login)
  // https://tomanagle.medium.com/adding-findoneorcreate-to-a-mongoose-model-efc7c2e11294
  userSchema.statics.findOneOrCreate = function findOneOrCreate (condition, doc) {
    const self = this
    const newDoc = doc

    return new Promise((resolve, reject) => {
      // search for user
      return self.findOne(condition)
        .then((result) => {
          if (result) {
            return resolve(result)
          }
          return self.create(newDoc)
            .then((result) => {
              return resolve(result)
            }).catch((error) => {
              return reject(error)
            })
        }).catch((error) => {
          return reject(error)
        })
    })
  }

  // create the mongoose model for users
  const User = mongoose.model('User', userSchema)

  // if using local strategy and no users exists yet, create from config
  if (config.auth.provider.toLowerCase() === 'mongo') {
    User.findOne({}, function (err, obj) {
      if (obj == null) {
        const emailAdmin  = config.auth.clientID
        const emailDomain = emailAdmin.slice(emailAdmin.indexOf('@'))
        const emailUser   = 'sys.user' + emailDomain
        const password    = config.auth.clientSecret
        const sysAdmin    = { email: emailAdmin, name: 'Sys Admin' }
        const sysUser     = { email: emailUser,  name: 'Sys User'  }

        User.register({ auth: sysAdmin }, password)
        User.register({ auth: sysUser }, password)
        console.log(`::: Created 1st User ::: ${sysAdmin.email}`)
        console.log(`::: Created 2nd User ::: ${sysUser.email}`)
      }
    })
  }

  // expose model to our app
  return User
}
