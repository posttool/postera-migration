var http = require("http");
var request = require('request');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');
var archiver = require('archiver');
var rmdir = require('rimraf');
var mkdirp = require('mkdirp');
var utils = require("./utils");

//function do_zip(zip_path, out_path) {
//  var output = fs.createWriteStream(out_path);
//  var archive = archiver('zip');
//
//  output.on('close', function () {
//    console.log(archive.pointer() + ' total bytes');
//    console.log('archiver has been finalized and the output file descriptor has closed.');
//  });
//
//  archive.on('error', function (err) {
//    throw err;
//  });
//
//  archive.pipe(output);
//  archive.bulk([
//    { expand: true, cwd: 'source', src: ['**'], dest: 'source'}
//  ]);
//  archive.finalize();
//}

function encoded_args(o) {
  return "args=" + encodeURIComponent(JSON.stringify(o));
}

function http_get(url, args, complete) {
  var s = url + encoded_args(args);
  console.log("get", s);
  http.get(s, function (res) {
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      complete(null, JSON.parse(body));
    });
  }).on('error', function (e) {
    console.log("Got error: ", e);
    complete(e);
  });
}


var url1 = "http://postera.com/PosteraSystems/GetSiteByUserName/.json?";
var url2 = "http://postera.com/PosteraTreeModule/FillSystemNode/.json?";
var resource_base_url = "http://postera.s3.amazonaws.com/";


generate_site(process.argv[2], function(err){
  if (err) throw err;
});

function generate_site(user_name, complete) {

  var site_path = '/tmp/postera/' + user_name;
  var pages = [];
  var templateString;
  var site;

  fs.readFile(__dirname + '/views/template.ejs', function (err, data) {
    if (err) return complete(err);
    templateString = data.toString();
    //rmdir(site_path, function (err) {
    //  if (err) return complete(err);
      mkdirp(site_path, function (err) {
        if (err) return complete(err);
        get_site(user_name);
      });
    //});
  });




  function get_site(user_name) {
    http_get(url1, [user_name], function (err, response) {
      var id = response.value.attributes.published_tree.attributes.root.id;
      http_get(url2, [id], function (err, response) {
        process_node(response.value, function (s) {
          site = s;
          utils.forEach(pages, function (page, next) {
            var c = 0;
            for (var i=0; i<page.url.length; i++)
              if (page.url.charAt(i)=='/') c ++;
            var to_root = '';
            for (var i=0; i<c; i++)
              to_root += '../';
            var html_page = ejs.render(templateString, {page: page, site: site, title: '', to_root: to_root});
            mkdirp(path.dirname(site_path + '/' + page.url), function (err) {
              if (err) return complete(err);
              fs.writeFile(site_path + '/' + page.url + '.html', html_page, function (err) {
                if (err) return complete(err);
                console.log("The file was saved!", site_path + page.url);
                return next();
              });
            });
          }, function () {
            complete(null);
          });
        });
      });
    });
  }



  function process_node(node, next) {
    var descr = node.attributes.data.attributes.description;
    if (descr == '<ROOT><DIV class="column0"><ROOT/></DIV></ROOT>')
      descr = '';
    var page = {
      title: node.attributes.data.attributes.title,
      body: descr,
      url: node.attributes.node_id,
      pages: [],
      resources: []
    };
    utils.forEach(node.attributes.data.attributes.images, function (o, n) {
      //console.log(o.attributes.description);
      //console.log(o.attributes.resource.attributes.title);
      //console.log(o.attributes.resource.attributes['path-token']);
      create_resource(o.attributes.resource.attributes, function (r) {
        if (r)
          page.resources.push({path: r, description: o.attributes.description});
        return n();
      });
    }, function () {
      utils.forEach(node.attributes.children, function (o, n) {
        process_node(o, function (p) {
          page.pages.push(p);
          return n();
        });
      }, function () {
        pages.push(page);
        return next(page);
//     page.save(function (err, p) {
//        console.log(p);
//        return next(page);
//      })
      });
    });
  }


  function create_resource(rd,next) {
    if (rd == null)
      return next(null);
    var img_rel_path = rd['path-token'];
    var basename = path.basename(img_rel_path);
    var img_path = 'images/' + basename;
    mkdirp(path.dirname(site_path + '/' + img_path), function (err) {
      if (err) return complete(err);
      fs.exists(site_path + '/' + img_path, function(exists){
        if (exists)
          next(img_path);
        else
          request(resource_base_url + img_rel_path).pipe(fs.createWriteStream(site_path + '/' + img_path)).on('close', function () {
            console.log(" -> ", img_path);
            next(img_path);
          });
      })

    });
  }

}