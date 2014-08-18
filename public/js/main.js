$(document).ready(function () {
  var intid = -1;
  $("#generate").click(function () {
    $("#domain_error").empty();
    var domain = $("#domain").val();
    if (domain.length < 8) {
      $("#domain_error").text("Domain may not be empty");
      return;
    }
    if (domain.indexOf("http://") != 0) {
      $("#domain_error").text("Domain must start with http://");
      return;
    }
    $("#generate").prop('disabled', true);
    if (intid == -1) {
      $("#begin").hide();
      $("#generating").show();
      $("#domain-display").text(domain);
      intid = setInterval(function () {
        $.ajax('/generate/' + encodeURIComponent(domain)).done(function (r) {
          if (r.state == "error") {
            clearInterval(intid);
            intid = -1;
            $("#generating-msg").hide();
            $("#progress-wrap").hide();
            $("#info").addClass("error");
            alert(r.error+"\n\nTry again?");
            location.href = "/?"+Math.random();
            return;
          }
          if (r.state == "complete") {
            clearInterval(intid);
            intid = -1;
            $("#generating").hide();
            $("#complete").show();
            var url = "/download/" + encodeURIComponent(domain);
            $("#zip-url").text(url);
            $("#zip-url").attr("href", url);
          }
          var p = r.complete / r.total;
          if (!isNaN(p) && p != 0) {
            $("#progress-meter").css({width: Math.floor(100 * p) + '%'});
          }
          $("#info").empty();
          for (var i = Math.max(0, r.messages.length - 20); i < r.messages.length; i++)
            $("#info").append(r.messages[i] + "<br>");
        });
      }, 1000);
    }
  });
});