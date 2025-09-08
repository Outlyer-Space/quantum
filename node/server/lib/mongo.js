const mongoose = require('mongoose')

/** create mongo db connector
 *
 * @param {*} myconfig - active quantum configuration
 * @returns mongoose - connector object
 *
 * Config & options: set from dynamic config object
 * URL constuctor  : https://dmitripavlutin.com/parse-url-javascript/
 * Event listeners : connected, error, disconnected
 *
 */
module.exports = function (myconfig) {
  const url = new URL(myconfig.mongo.url)
  const options = myconfig.mongo.opt

  options.useNewUrlParser = true
  options.useUnifiedTopology = true

  if (myconfig.mongo.usr && myconfig.mongo.pwd) {
    url.username = myconfig.mongo.usr
    url.password = myconfig.mongo.pwd
  }
  if (url.protocol.includes('srv')) {
    url.search = 'retryWrites=true&w=majority'
  }
  if (myconfig.node.environ === 'development') {
    console.log('MongoDB connect settings:')
    console.log(url.href)
    console.log(options)
  }

  // event listeners
  mongoose.connection.on('connected', function () {
    console.log('Mongoose connected succesfully')

    console.log(`> db-host     : ${mongoose.connection.host}`)
    console.log(`> db-port     : ${mongoose.connection.port}`)
    console.log(`> db-name     : ${mongoose.connection.name}`)

    mongoose.connection.db.listCollections().toArray(function (err, names) {
      if (names) {
        const nameList = names.map(function (d) { return String(d.name) })
        console.log(`> collections : ${nameList}`)
      } else {
        console.log('> collections : ERROR')
        console.log(`> ${err}`)
      }
    })
  })
  mongoose.connection.on('error', function (err) {
    console.log(`Mongoose connection error: ${err}`)
  })
  mongoose.connection.on('disconnected', function () {
    console.log('Mongoose connection disconnected')
  })

  // connect to db
  mongoose.connect(url.href, options)
    .catch(function (err) {
      console.log(`ERROR (MongoDB) - ${err}`)
    })

  return mongoose
}

