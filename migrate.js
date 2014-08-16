var http = require("http");
var request = require('request');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');
var archiver = require('archiver');
var rmdir = require('rimraf');
var mkdirp = require('mkdirp');
var utils = require("./utils");


exports = module.exports = function (lock) {
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

  return {
    info: get_info,
    generate: generate_site
  };



  function get_info(url){
    return lock[url.substring(7)];
  }

  function generate_site(url, finished) {

    url = url.substring(7);
    if (lock[url]) {
      return;
    }
    lock[url] = {state: "init", complete: 0, messages: []};
    var complete = function(){
      lock[url].state = "complete";
      if (finished) finished();
    };
    lock[url].messages.push("Generating "+url);

    var siteid;
    var idtype;

    if (url.indexOf("postera.com") == 0) {
      if (url.indexOf("/user/") == 11) {
        var id = url.substring(17);
        console.log('id', id);
        siteid = id;
        idtype = 'UserId';
      } else {
        var username = url.substring(12);
        console.log('user', username);
        siteid = username;
        idtype = 'UserName';
      }
    } else {
      console.log('domain', url);
      siteid = url;
      idtype = 'Domain';
    }

    var site_path = '/tmp/postera/' + siteid;
    var pages = [];
    var templateString;
    var site;

    fs.readFile(__dirname + '/views/template.ejs', function (err, data) {
      if (err) return complete(err);
      templateString = data.toString();
      //rmdir(site_path, function (err) {
      //  if (err) return complete(err);
      mkdirp(site_path, function (err) {
        copy(['public/template/main.css', 'public/template/main.js'], site_path, function (err) {
          if (err) return complete(err);
          get_site(siteid, idtype);
        })
      });
      //});
    });

  var url1 = "http://postera.com/PosteraSystems/GetSiteBy";
  var url1a = "/.json?";
  var url2 = "http://postera.com/PosteraTreeModule/FillSystemNode/.json?";
  var resource_base_url = "http://postera.s3.amazonaws.com/";

    function get_site(siteid, idtype) {
      var get_site_url = url1 + idtype + url1a;
      console.log(url1, url1a, get_site_url);
      http_get(get_site_url, [siteid], function (err, response) {
        var id = response.value.attributes.published_tree.attributes.root.id;
        http_get(url2, [id], function (err, response) {
          process_node(response.value, function (s) {
            site = s;
            site.url = 'index';
            utils.forEach(pages, function (page, next) {
              var c = 0;
              for (var i = 0; i < page.url.length; i++)
                if (page.url.charAt(i) == '/') c++;
              var to_root = '';
              for (var i = 0; i < c; i++)
                to_root += '../';
              var html_page = ejs.render(templateString, {
                page: page,
                site: site,
                title: page == site ? site.title : site.title + ' &gt; ' + page.title,
                to_root: to_root
              });
              mkdirp(path.dirname(site_path + '/' + page.url), function (err) {
                if (err) return complete(err);
                fs.writeFile(site_path + '/' + page.url + '.html', html_page, function (err) {
                  if (err) return complete(err);
                  console.log("The file was saved!", site_path + '/' + page.url);
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

    var strip_regex = /(<([^>]+)>)/ig;

    function empty(s) {
      if (s == null)
        return true;
      var ss = s.replace(strip_regex, '');
      if (ss == '')
        return true;
      else
        return false;
    }

    function process_node(node, next) {
      var dattr = node.attributes.data.attributes;
      console.log(lock, url)
      lock[url].messages.push("Processing "+dattr.title);
      var descr = !empty(dattr.description) ? dattr.description :
        !empty(dattr.summary) ? dattr.summary :
          !empty(dattr.overview) ? dattr.overview : '';
      if (empty(descr) && dattr.sections != null && dattr.sections.length != 0) {
        descr = JSON.stringify(dattr.sections);
      }
      if (empty(descr))
        descr = '';
      var page = {
        type: node.attributes.node_class,
        url: node.attributes.node_id,
        title: dattr.title,
        body: descr,
        pages: [],
        resources: []
      };
      utils.forEach(dattr.images, function (o, n) {
        create_resource(o.attributes.resource.attributes, function (r) {
          if (r) {
            var rdescr = o.attributes.description;
            var ext = path.extname(r);
            var rtype = ext == '.flv' ? 'video' : 'image';
            page.resources.push({path: r, description: rdescr, type: rtype});
          }
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


    function create_resource(rd, next) {
      if (rd == null)
        return next(null);
      var img_rel_path = rd['path-token'];
      var basename = path.basename(img_rel_path);
      var img_path = 'images/' + basename;
      mkdirp(path.dirname(site_path + '/' + img_path), function (err) {
        if (err) return complete(err);
        fs.exists(site_path + '/' + img_path, function (exists) {
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

    // utils
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

    function copy(files, dest, cb) {
      utils.forEach(files, function (file, next) {
        utils.copyFile(__dirname + '/' + file, dest + '/' + path.basename(file), next);
      }, function () {
        cb();
      });
    }


  }

}