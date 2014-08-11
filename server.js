var cluster = require('cluster');
var mongoose = require('mongoose');
var express = require('express');

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
    res.render('volume.ejs', {});
  });

  server.get('/download/:username', function (req, res) {
    if (data[req.params.username]) {
      var s = data[req.params.username];

    }
  });



}