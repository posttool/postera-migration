


exports.forEach = function(list, target, complete, concurrent)
{
  if (!list || list.length == 0)
  {
    complete();
    return;
  }
  var c = concurrent ? concurrent : 1;
  var i = 0;
  var k = 0;
  var ff = function(){
    for (var j=0; j<c && i+j<list.length; j++) f();
  }
  var f = function()
  {
    var item = list[i];
    i++;
    target(item, function(){
      k++;
      if (k < list.length)
        ff();
      else
        complete();
    });
  }
  ff();
}


var fs = require('fs');
exports.copyFile = function(source, target, cb) {
  var cbCalled = false;
console.log("CP",source,target)
  var rd = fs.createReadStream(source);
  rd.on("error", function(err) {
    done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on("error", function(err) {
    done(err);
  });
  wr.on("close", function(ex) {
    done();
  });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}