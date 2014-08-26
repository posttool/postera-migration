var cluster = require('cluster');
var mongoose = require('mongoose');
var express = require('express');
var config = require('./config');
var migrate = require('./migrate')({});

var data = {};

if (cluster.isMaster) {
  var cpuCount = require('os').cpus().length;
  for (var i = 0; i < cpuCount; i += 1)
    cluster.fork();
} else {
  var server = express();

  server.configure(function () {
    server.set('view engine', 'ejs');
    server.set('views', __dirname + '/views');
    server.use(express.static(__dirname + '/public'));
  });

  server.get('/', function (req, res) {
    res.render('index.ejs', {});
  });

  server.get('/generate/:url', function (req, res) {
    var url = req.params.url;
    migrate.generate(url);
    res.json(migrate.info(url));
  });

  server.get('/download/:url', function (req, res) {
    var url = req.params.url;
    res.download(migrate.zippath(url), migrate.siteinfo(url).siteid + '.zip');
  });

  console.log('server on '+config.serverPort);
  server.listen(config.serverPort);

}