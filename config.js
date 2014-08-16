var config = {
  development: {
    name: 'Postera Migration',
    serverPort: 3001,
    mongoConnectString: 'mongodb://localhost/postera',
    sessionSecret: 'hdsah8i4uwfhjshjkfdhjksfjkhdskhjfhkdjskjhfds'

  },
  production: {
    name: 'Postera Migration',
    serverPort: 80,
    mongoConnectString: 'mongodb://localhost/postera',
    sessionSecret: 'hdsah8i4uwfhjshjkfdhjksfjkhdskhjfhkdjskjhfds'
  }
}

module.exports = config[process.env.NODE_ENV || 'development'];