(function () {
  "use strict";
  var search = document.querySelector("[data-library-search]");
  var cards = Array.from(document.querySelectorAll("[data-article-card]"));
  var filters = Array.from(document.querySelectorAll("[data-category-filter]"));
  var count = document.querySelector("[data-library-count]");
  var empty = document.querySelector("[data-library-empty]");
  if (!search || !cards.length) return;

  var active = "all";
  function normalize(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFKD").replace(/[\u064B-\u065F]/g, "").trim();
  }
  function refresh() {
    var term = normalize(search.value);
    var visible = 0;
    cards.forEach(function (card) {
      var matchesCategory = active === "all" || card.dataset.category === active;
      var matchesTerm = !term || normalize(card.dataset.search).indexOf(term) !== -1;
      card.hidden = !(matchesCategory && matchesTerm);
      if (!card.hidden) visible += 1;
    });
    if (count) count.textContent = document.documentElement.lang.indexOf("ar") === 0
      ? "يعرض " + visible + " من " + cards.length + " مقالًا"
      : "Showing " + visible + " of " + cards.length + " articles";
    if (empty) empty.hidden = visible !== 0;
  }
  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      active = button.dataset.categoryFilter;
      filters.forEach(function (item) { item.setAttribute("aria-pressed", item === button ? "true" : "false"); });
      refresh();
    });
  });
  search.addEventListener("input", refresh);
  refresh();
})();
