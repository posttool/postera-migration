var http = require("http");
var request = require('request');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');
var archiver = require('archiver');
var rmdir = require('rimraf');
var mkdirp = require('mkdirp');
var utils = require("./utils");


var tmp = '/tmp/postera/';
var templateString;

fs.readFile(__dirname + '/views/template.ejs', function (err, data) {
  if (err) {
    console.error("migrate template err", err);
    return;
  }
  templateString = data.toString();
});


exports = module.exports = function (lock) {

  return {
    info: get_info,
    generate: generate_site,
    siteinfo: get_site_info,
    zippath: get_zippath
  };


  function clean_url(url) {
    var u = url;
    if (u.indexOf("http://") == 0)
      u = u.substring(7);
    if (u.indexOf("www.") == 0)
      u = u.substring(4);
    return u;
  }
  function get_info(url) {
    return lock[clean_url(url)];
  }

  function get_site_info(url) {
    return get_siteid_and_type(clean_url(url));
  }
  function get_zippath(url) {
    return tmp + get_site_info(url).siteid + '.zip';
  }

  function generate_site(url, force, finished) {
    url = clean_url(url);
    if (lock[url]) {
      return;
    }
    lock[url] = {state: "init", complete: 0, total: 0, messages: []};
    var complete = function (err) {
      if (err) {
        lock[url].state = "error";
        lock[url].messages.push(err.message);
        lock[url].error = err.message;
      }
      else {
        lock[url].state = "complete";
      }
      if (finished) finished();
    };
    lock[url].messages.push("Generating " + url);

    var sid = get_siteid_and_type(url);
    var site_path = tmp + sid.siteid;
    var pages = [];
    var site;

    if (!force && fs.exists(site_path + '.zip')) {
      lock[url].state = "complete";
      lock[url].messages.push("Zip exists.");
      return complete(null);
    }

    if (force) {
      rmdir(site_path, function (err) {
        if (err) return complete(err);
        begin();
      });
    } else begin();

    function begin() {
      mkdirp(site_path, function (err) {
        copy(['public/template/main.css', 'public/template/main.js'], site_path, function (err) {
          if (err) return complete(err);
          get_site(sid.siteid, sid.idtype, function () {
            do_zip(site_path, site_path + '.zip', function (err) {
              complete(err, null);
            });
          });
        })
      });
    }

    var url1 = "http://postera.com/PosteraSystems/GetSiteBy";
    var url1a = "/.json?";
    var url2 = "http://postera.com/PosteraTreeModule/FillSystemNode/.json?";
    var resource_base_url = "http://postera.s3.amazonaws.com/";

    function get_site(siteid, idtype, next) {
      var get_site_url = url1 + idtype + url1a;
      http_get(get_site_url, [siteid], function (err, response) {
        if (err) return complete(err);
        if (response.value.exception) return complete(new Error(response.value.message));
        var id = response.value.attributes.published_tree.attributes.root.id;
        http_get(url2, [id], function (err, response) {
          if (err) return complete(err);
          count_pages(response.value);
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
              next(null);
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

    function count_pages(node) {
      lock[url].total++;
      for (var i = 0; i < node.attributes.children.length; i++)
        count_pages(node.attributes.children[i]);
    }

    function process_node(node, next) {
      var dattr = node.attributes.data.attributes;
      lock[url].messages.push("Processing " + dattr.title);
      lock[url].complete++;
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
              console.log(" ... downloading ", img_path);
              lock[url].messages.push("  ... downloading " + img_path);
              next(img_path);
            });
        })

      });
    }
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

  function do_zip(zip_path, out_path, next) {
    var output = fs.createWriteStream(out_path);
    var archive = archiver('zip');

    output.on('close', function () {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      next(null);
    });

    archive.on('error', function (err) {
      next(err);
    });

    archive.pipe(output);
    archive.bulk([
      { expand: true, cwd: zip_path, src: ['**']}
    ]);
    archive.finalize();
  }

  function get_siteid_and_type(url) {
    var siteid, idtype;
    if (url.indexOf("postera.com") == 0) {
      if (url.indexOf("/user/") == 11) {
        var id = url.substring(17);
        if (id.indexOf(".html") == id.length - 5)
          id = id.substring(0, id.length - 5);
        console.log('id', id);
        siteid = Number(id);
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
    return {siteid: siteid, idtype: idtype};
  }


}