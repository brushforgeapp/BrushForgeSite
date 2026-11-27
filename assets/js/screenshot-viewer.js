(function () {
  "use strict";
  var links = document.querySelectorAll("[data-screenshot]");
  if (!links.length || typeof HTMLDialogElement === "undefined"
      || typeof HTMLDialogElement.prototype.showModal !== "function") return;

  var dialog = document.createElement("dialog");
  dialog.className = "screenshot-viewer";
  dialog.setAttribute("aria-labelledby", "screenshot-viewer-title");
  dialog.innerHTML = '<div class="screenshot-viewer__header">'
    + '<h2 class="screenshot-viewer__title" id="screenshot-viewer-title"></h2>'
    + '<div class="screenshot-viewer__actions"><button type="button" data-image-zoom aria-pressed="false">Actual size</button>'
    + '<button type="button" data-image-close autofocus>Close</button></div></div>'
    + '<div class="screenshot-viewer__scroll" tabindex="0" aria-label="Screenshot, scroll to explore">'
    + '<img class="screenshot-viewer__image" alt=""></div>'
    + '<p class="screenshot-viewer__note">Android screen shown. Choose Actual size to inspect the details.</p>';
  document.body.appendChild(dialog);
  var image = dialog.querySelector("img");
  var title = dialog.querySelector("h2");
  var zoom = dialog.querySelector("[data-image-zoom]");
  var close = dialog.querySelector("[data-image-close]");
  var scroller = dialog.querySelector(".screenshot-viewer__scroll");
  var opener;

  links.forEach(function (link) {
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      title.textContent = link.getAttribute("data-screenshot-title") || "App screenshot";
      image.alt = link.querySelector("img").alt;
      image.src = link.href;
      image.classList.remove("is-full-size");
      zoom.textContent = "Actual size";
      zoom.setAttribute("aria-pressed", "false");
      document.body.classList.add("screenshot-viewer-open");
      dialog.showModal();
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
      close.focus();
    });
  });
  zoom.addEventListener("click", function () {
    var fullSize = image.classList.toggle("is-full-size");
    zoom.textContent = fullSize ? "Fit to width" : "Actual size";
    zoom.setAttribute("aria-pressed", String(fullSize));
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  });
  close.addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === zoom) {
      event.preventDefault();
      scroller.focus();
    } else if (!event.shiftKey && document.activeElement === scroller) {
      event.preventDefault();
      zoom.focus();
    }
  });
  dialog.addEventListener("click", function (event) {
    if (event.target !== dialog) return;
    var bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("screenshot-viewer-open");
    if (opener && opener.isConnected) opener.focus({preventScroll: true});
  });
}());
