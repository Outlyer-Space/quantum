
/** Dynamic config for different running modes.

  * Priumary run mode is set using environment NODE_ENV
  * Depending on mode, aoo runs on host or inside docker

  The following are supported:

    #   mode            | source    |   execution
    #   -----------------------------------------
    #   debug           | host      |   host
    #   development     | host      |   container
    #   production      | container |   container

*/

// show banner + current config

const fs    = require('fs')
const fpath = './app/media/quantum.banner'
const data  = fs.readFileSync(fpath, { encoding: 'utf8', flag: 'r' })
console.log(data)
console.log(' > NODE_ENV            : ' + process.env.NODE_ENV)
console.log(' > MONGO_DB_URL        : ' + process.env.MONGO_DB_URL)
console.log(' > MONGO_DB_USR        : ' + process.env.MONGO_DB_USR)
console.log(' > MONGO_DB_PWD        : ' + process.env.MONGO_DB_PWD)
console.log(' > AUTH_PROVIDER       : ' + process.env.AUTH_PROVIDER)
console.log(' > AUTH_TENANT_ID      : ' + process.env.AUTH_TENANT_ID)
console.log(' > AUTH_CALLBACK_URL   : ' + process.env.AUTH_CALLBACK_URL)
console.log(' > AUTH_CLIENT_ID      : ' + process.env.AUTH_CLIENT_ID)
console.log(' > AUTH_CLIENT_SECRET  : ' + process.env.AUTH_CLIENT_SECRET)
console.log('-'.repeat(95))

// function to return active config

module.exports = function (basePath) {

  // defaults | 'development'
  const myconfig = {
    node: {
      environ: process.env.NODE_ENV,
      host   : process.env.HOSTNAME,
      path   : basePath,
      morgan : 'dev'
    },
    mongo: {
      url: process.env.MONGO_DB_URL,
      usr: process.env.MONGO_DB_USR,
      pwd: process.env.MONGO_DB_PWD,
      opt: {
        authSource: 'admin'
      }
    },
    auth: {
      provider: process.env.AUTH_PROVIDER,
      clientID: process.env.AUTH_CLIENT_ID,
      clientSecret: process.env.AUTH_CLIENT_SECRET,
      tenantID: process.env.AUTH_TENANT_ID,
      callbackURL: process.env.AUTH_CALLBACK_URL
    }
  }

  // run mode switches
  switch (myconfig.node.environ) {
    case 'production':
      myconfig.node.morgan = 'tiny'
      break

    case 'staging':
      myconfig.node.morgan = 'tiny'
      break

    case 'debug':
      myconfig.node.morgan = 'dev'
      break

    default: // development
      console.log(' Quantum active config :')
      console.log(JSON.stringify(myconfig, null, 2))
      console.log('-'.repeat(95))
  }

  return myconfig
}
