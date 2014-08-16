$(document).ready(function(){
  var intid = -1;
  $("#generate").click(function(){
    $("#domain_error").empty();
    var domain = $("#domain").val();
    console.log(domain)
    if (domain.length < 8)
    {
      $("#domain_error").text("Domain may not be empty");
      return;
    }
    if (domain.indexOf("http://") != 0) {
      $("#domain_error").text("Domain must start with http://");
      return;
    }
    $("#generate").prop('disabled',true);
    intid = setInterval(function(){
       $("#info").empty();
      $.ajax('/generate/'+encodeURIComponent(domain)).done(function(r){
        if (r.state == "complete"){
          alert("TODO");
          clearInterval(intid);
          intid = -1;
        }
        for (var i=0; i< r.messages.length; i++)
          $("#info").append(r.messages[i]+"<br>");
      }, 1000);
    })

  })
});