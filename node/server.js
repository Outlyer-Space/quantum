/** Primary app entry point */

process.chdir(__dirname)                                           // set working directory

const config   = require('./config/config')(__dirname)             // dynamic config
const mongoose = require('./server/lib/mongo')(config)             // mongo connector
const user     = require('./server/models/user')(config, mongoose) // mongoose user model
const passport = require('./server/lib/passport')(config, user)    // authentication
const app      = require('./server/lib/app')(config, passport)     // quantum app

// load routes & start server
require('./server/routes')(config, app, passport, user)
app.listen(app.get('port'), function () {
  console.log(`App is running port ${app.get('port')}`)
})
