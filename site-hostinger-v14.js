(function () {
  "use strict";
  ["/site-v13.css", "/site-v14.css"].forEach(function (href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });
  if (!document.querySelector('script[data-osoul-enhancer="14"]')) {
    var script = document.createElement("script");
    script.src = "/site-hostinger-v13.js?v=14";
    script.defer = true;
    script.dataset.osoulEnhancer = "14";
    document.head.appendChild(script);
  }
})();
