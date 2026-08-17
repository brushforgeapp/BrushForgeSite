/* BrushForge catalogue converter and brand-hub filters.
   The converter loads bounded, precomputed public projections. Catalogue screen
   colors are a shortlist tool, not physical-paint measurements. */
(function (global) {
  "use strict";

  var PUBLIC_CATALOGUE_SCHEMA_VERSION = "2";
  var MANIFEST_URLS = [
    "/assets/catalog/manifest.json?schema=" + PUBLIC_CATALOGUE_SCHEMA_VERSION,
    "/assets/catalog/catalog-manifest.json?schema=" + PUBLIC_CATALOGUE_SCHEMA_VERSION
  ];
  var DATA_UPDATED = "";
  var componentCount = 0;
  var BRAND_DISPLAY = { "Monument Hobbies": "Pro Acryl" };
  var PUBLIC_STATUSES = {
    current: true, legacy: true, reference_only: true, preview: true
  };

  function disp(brand) {
    return BRAND_DISPLAY[brand] || brand;
  }

  function sameBrand(first, second) {
    return disp(first) === disp(second);
  }

  /* ---------------- color math (kept in sync with tools/bfcatalog.py) ------- */

  function hexToLab(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function lin(c) {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    var rl = lin(r), gl = lin(g), bl = lin(b);
    var X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
    var Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
    var Z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
    function f(t) {
      return t > 0.008856451679 ? Math.cbrt(t) : t / (3 * 0.042806183202) + 4 / 29;
    }
    var fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function de2000(l1, l2) {
    var L1 = l1[0], a1 = l1[1], b1 = l1[2], L2 = l2[0], a2 = l2[1], b2 = l2[2];
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    var Cbar = (C1 + C2) / 2;
    var C7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Math.pow(25, 7))));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    function hp(a, b) {
      if (a === 0 && b === 0) return 0;
      var h = Math.atan2(b, a) * 180 / Math.PI;
      return h < 0 ? h + 360 : h;
    }
    var h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    var dLp = L2 - L1, dCp = C2p - C1p, dhp;
    if (C1p * C2p === 0) dhp = 0;
    else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    var Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
    var rad = Math.PI / 180;
    var T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
        + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    var dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    var Cbp7 = Math.pow(Cbp, 7);
    var RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + Math.pow(25, 7)));
    var SL = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    var SC = 1 + 0.045 * Cbp;
    var SH = 1 + 0.015 * Cbp * T;
    var RT = -Math.sin(2 * dTheta * rad) * RC;
    return Math.sqrt(Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2)
        + RT * (dCp / SC) * (dHp / SH));
  }

  function deScale(de) {
    if (de < 0) throw new RangeError("Delta E cannot be negative");
    if (de === 0) return ["Same recorded color value", "same"];
    if (de <= 2) return ["Very close color match", "excellent"];
    if (de <= 5) return ["Close color match", "good"];
    if (de <= 10) return ["Noticeable difference", "fair"];
    return ["Different color", "poor"];
  }

  /* -------------------------- public catalogue data ----------------------- */

  function normalizeSearch(value) {
    var normalized = String(value || "");
    if (typeof normalized.normalize === "function") normalized = normalized.normalize("NFKD");
    return normalized.replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function searchBucket(value) {
    var compact = normalizeSearch(value).replace(/\s/g, "");
    return compact.length >= 2 ? compact.slice(0, 2) : "";
  }

  function cleanBase(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function normalizeManifest(raw) {
    if (!raw || typeof raw !== "object") throw new Error("Catalogue manifest has an unexpected format");
    var version = String(raw.version || "");
    var updated = String(raw.updated || "");
    var searchBase = cleanBase(raw.searchBase || raw.search_base);
    var resultBase = cleanBase(raw.resultBase || raw.results_base || raw.result_base);
    var expectedRoot = "/assets/catalog/" + version;
    if (!/^[A-Za-z0-9._-]+$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(updated)
        || searchBase !== expectedRoot + "/search" || resultBase !== expectedRoot + "/results") {
      throw new Error("Catalogue manifest is missing versioned projection paths");
    }
    return {
      version: version,
      updated: updated,
      searchBase: searchBase,
      resultBase: resultBase,
      brands: Array.isArray(raw.brands) ? raw.brands.filter(function (brand) {
        return typeof brand === "string" && brand;
      }) : []
    };
  }

  function hasOnlyKeys(value, allowed) {
    return Object.keys(value).every(function (key) { return allowed.indexOf(key) >= 0; });
  }

  function isQuantizedSwatch(value) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return false;
    return [1, 3, 5].every(function (offset) {
      var channel = parseInt(value.slice(offset, offset + 2), 16);
      var level = Math.round(channel * 31 / 255);
      return Math.round(level * 255 / 31) === channel;
    });
  }

  function isPublicPaintPath(path) {
    return typeof path === "string" && /^\/paints\/[a-z0-9][a-z0-9\/-]*\.html$/.test(path)
      && path.indexOf("..") < 0;
  }

  function validateIdentity(paint) {
    if (!paint || typeof paint !== "object") return false;
    if (!hasOnlyKeys(paint, [
      "key", "name", "brand", "range", "line", "code", "path", "status", "swatch"
    ])) {
      return false;
    }
    if (["key", "name", "brand", "path", "status", "swatch"].some(function (field) {
      return typeof paint[field] !== "string" || !paint[field];
    })) return false;
    if (!/^[A-Za-z0-9_-]{12,64}$/.test(paint.key) || !isPublicPaintPath(paint.path)) return false;
    if (!isQuantizedSwatch(paint.swatch)) return false;
    if (!PUBLIC_STATUSES[paint.status]) return false;
    if (paint.range !== undefined && typeof paint.range !== "string") return false;
    if (paint.line !== undefined && typeof paint.line !== "string") return false;
    return paint.code === undefined || paint.code === null || typeof paint.code === "string";
  }

  function validateResultItem(item) {
    if (!item || typeof item !== "object") return false;
    if (!hasOnlyKeys(item, [
      "key", "name", "brand", "range", "line", "code", "path", "swatch", "de", "tier", "warning",
      "type", "finish", "behavior", "status"
    ])) return false;
    if (["key", "name", "brand", "path", "swatch"].some(function (field) {
      return typeof item[field] !== "string" || !item[field];
    })) return false;
    if (!/^[A-Za-z0-9_-]{12,64}$/.test(item.key) || !isPublicPaintPath(item.path)) return false;
    if (!isQuantizedSwatch(item.swatch)) return false;
    if (typeof item.range !== "string") return false;
    if (item.line !== undefined && typeof item.line !== "string") return false;
    if (typeof item.code !== "string") return false;
    if (item.de !== undefined && (typeof item.de !== "number" || !isFinite(item.de) || item.de < 0)) return false;
    if (item.tier !== undefined && typeof item.tier !== "string") return false;
    if (["type", "finish", "behavior"].some(function (field) {
      return typeof item[field] !== "string";
    })) return false;
    if (!PUBLIC_STATUSES[item.status]) return false;
    return item.warning === undefined || item.warning === null || typeof item.warning === "string";
  }

  function validateDerivedItem(item) {
    return validateResultItem(item) && typeof item.de === "number" && typeof item.tier === "string";
  }

  function validateResultSource(source) {
    if (!source || typeof source !== "object" || !hasOnlyKeys(source, [
      "key", "name", "brand", "range", "line", "code", "type", "finish", "behavior",
      "swatch", "status", "path"
    ])) return false;
    if (["key", "name", "brand", "path", "status", "swatch"].some(function (field) {
      return typeof source[field] !== "string" || !source[field];
    }) || !/^[A-Za-z0-9_-]{12,64}$/.test(source.key) || !isPublicPaintPath(source.path)
        || !isQuantizedSwatch(source.swatch) || !PUBLIC_STATUSES[source.status]
        || typeof source.range !== "string"
        || (source.line !== undefined && typeof source.line !== "string")
        || typeof source.code !== "string") return false;
    return ["type", "finish", "behavior"].every(function (field) {
      return typeof source[field] === "string";
    });
  }

  function createCatalogClient(fetchJson, manifestUrls) {
    var urls = (manifestUrls && manifestUrls.length ? manifestUrls : MANIFEST_URLS).slice();
    var manifestPromise = null;
    var manifest = null;
    var searchPromises = {};
    var resultPromises = {};

    function request(url, label, noStore) {
      var options = { headers: { Accept: "application/json" } };
      if (noStore) options.cache = "no-store";
      return Promise.resolve().then(function () {
        return fetchJson(url, options);
      })
        .then(function (response) {
          if (!response || !response.ok) {
            throw new Error(label + " request failed (" + (response ? response.status : "no response") + ")");
          }
          return response.json();
        });
    }

    function requestManifestAt(index, previousError) {
      if (index >= urls.length) return Promise.reject(previousError || new Error("Catalogue manifest was unavailable"));
      return request(urls[index], "Catalogue manifest", true).catch(function (error) {
        return requestManifestAt(index + 1, error);
      });
    }

    function loadManifest(force) {
      if (force) {
        manifestPromise = null;
        manifest = null;
        searchPromises = {};
        resultPromises = {};
      }
      if (!manifestPromise) {
        manifestPromise = requestManifestAt(0).then(function (raw) {
          manifest = normalizeManifest(raw);
          return manifest;
        }).catch(function (error) {
          manifestPromise = null;
          manifest = null;
          throw error;
        });
      }
      return manifestPromise;
    }

    function loadSearch(value, force) {
      var bucket = searchBucket(value);
      if (!bucket) return Promise.reject(new Error("Search needs at least two letters or numbers"));
      if (force) {
        return loadManifest(true).then(function () { return loadSearch(value, false); });
      }
      if (!searchPromises[bucket]) {
        searchPromises[bucket] = loadManifest(false).then(function (current) {
          return request(current.searchBase + "/" + encodeURIComponent(bucket) + ".json", "Paint search");
        }).then(function (raw) {
          if (!raw || !hasOnlyKeys(raw, ["version", "paints"]) || raw.version !== manifest.version
              || !Array.isArray(raw.paints) || raw.paints.length > 2000
              || !raw.paints.every(validateIdentity)) {
            throw new Error("Paint search response has an unexpected format");
          }
          return raw.paints;
        }).catch(function (error) {
          delete searchPromises[bucket];
          throw error;
        });
      }
      return searchPromises[bucket];
    }

    function loadResult(key, force) {
      var publicKey = String(key || "");
      if (!/^[a-zA-Z0-9_-]+$/.test(publicKey)) {
        return Promise.reject(new Error("Paint result key has an unexpected format"));
      }
      if (force) {
        return loadManifest(true).then(function () { return loadResult(publicKey, false); });
      }
      if (!resultPromises[publicKey]) {
        resultPromises[publicKey] = loadManifest(false).then(function (current) {
          return request(current.resultBase + "/" + encodeURIComponent(publicKey) + ".json", "Paint result");
        }).then(function (raw) {
          var matchBrands = {};
          if (!raw || !hasOnlyKeys(raw, [
            "version", "source", "matches", "similar", "highlight", "shadow", "complements"
          ]) || raw.version !== manifest.version || !validateResultSource(raw.source)
              || raw.source.key !== publicKey || !Array.isArray(raw.matches)
              || !Array.isArray(raw.similar) || !Array.isArray(raw.complements)
              || !raw.matches.every(validateDerivedItem) || !raw.similar.every(validateDerivedItem)
              || !raw.complements.every(validateResultItem)
              || raw.matches.length > 16 || raw.similar.length > 3 || raw.complements.length > 2
              || raw.matches.some(function (item) {
                if (matchBrands[item.brand]) return true;
                matchBrands[item.brand] = true;
                return false;
              })
              || (raw.highlight !== null && raw.highlight !== undefined && !validateResultItem(raw.highlight))
              || (raw.shadow !== null && raw.shadow !== undefined && !validateResultItem(raw.shadow))) {
            throw new Error("Paint result response has an unexpected format");
          }
          raw.highlight = raw.highlight || null;
          raw.shadow = raw.shadow || null;
          return raw;
        }).catch(function (error) {
          delete resultPromises[publicKey];
          throw error;
        });
      }
      return resultPromises[publicKey];
    }

    return {
      loadManifest: loadManifest,
      loadSearch: loadSearch,
      loadResult: loadResult,
      getManifest: function () { return manifest; }
    };
  }

  function paintHref(path) {
    var value = String(path || "");
    if (/^https?:\/\//i.test(value)) return value;
    if (value.charAt(0) === "/") return value;
    return "/paints/" + value.replace(/^paints\//, "").replace(/\.html$/, "") + ".html";
  }

  function sourcePathToken(path) {
    var value = String(path || "");
    try {
      if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
    } catch (_) {}
    return value.replace(/[?#].*$/, "").replace(/^\/+/, "").replace(/^paints\//, "")
      .replace(/\.html$/, "");
  }

  function brandSlugFromPath(path) {
    return sourcePathToken(path).split("/")[0] || "";
  }

  var mathApi = {
    hexToLab: hexToLab,
    de2000: de2000,
    deScale: deScale,
    normalizeSearch: normalizeSearch,
    searchBucket: searchBucket,
    isQuantizedSwatch: isQuantizedSwatch,
    normalizeManifest: normalizeManifest,
    createCatalogClient: createCatalogClient,
    displayBrand: disp,
    sameBrand: sameBrand,
    paintHref: paintHref,
    sourcePathToken: sourcePathToken
  };
  if (typeof module === "object" && module.exports) module.exports = mathApi;
  if (!global.document) return;

  var catalogClient = createCatalogClient(function (url, options) {
    return global.fetch(url, options);
  }, MANIFEST_URLS);

  /* -------------------------------- utils ---------------------------------- */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function element(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function swatchHtml(hex, metallic) {
    return '<span class="bf-swatch' + (metallic ? " bf-metallic" : "")
      + '" style="background:' + esc(hex) + '"></span>';
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      var args = arguments, self = this;
      global.clearTimeout(timer);
      timer = global.setTimeout(function () { fn.apply(self, args); }, delay);
    };
  }

  function formatDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "date unavailable";
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
      }).format(new Date(iso + "T00:00:00Z"));
    } catch (_) {
      return iso;
    }
  }

  function track(eventName, props) {
    if (typeof global.brushForgeTrack === "function") global.brushForgeTrack(eventName, props || {});
  }

  function behaviorLabel(behavior) {
    return {
      opaque: "opaque color",
      metallic: "metallic",
      wash: "wash",
      single_coat: "Contrast, Speedpaint or Xpress-style single-coat paint",
      ink: "ink",
      glaze: "glaze",
      other_translucent: "other translucent paint"
    }[behavior] || behavior;
  }

  function copyText(text) {
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        if (!document.execCommand("copy")) throw new Error("Copy command was unavailable");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }

  /* --------------------------- converter component ------------------------- */

  function setupConverter(root) {
    componentCount += 1;
    var sourceBrand = root.getAttribute("data-source-brand") || "";
    var presetTarget = root.getAttribute("data-target-brand") || "";
    var androidUrl = root.getAttribute("data-android-url") || "/download/";
    var iosUrl = root.getAttribute("data-ios-url") || "/download/";
    var currentPath = global.location.pathname;
    var analyticsPageFamily = root.getAttribute("data-analytics-page-family")
      || ((currentPath === "/" || currentPath === "/index.html")
      ? "homepage"
      : ((currentPath === "/convert/" || currentPath === "/convert/index.html")
        ? "web_converter"
        : (currentPath.indexOf("/convert/") === 0 ? "conversion_chart" : "content")));
    var input = root.querySelector(".bfc-input");
    var drop = root.querySelector(".bfc-drop");
    var panel = root.querySelector(".bfc-panel");
    var status = root.querySelector(".bfc-status");
    var source = null;
    var sourceIdentity = null;
    var resultData = null;
    var targetBrand = presetTarget ? disp(presetTarget) : "ALL";
    var dropItems = [];
    var activeIndex = -1;
    var searchGeneration = 0;
    var selectionGeneration = 0;
    var trackedSearch = false;

    var listId = "bfc-results-" + componentCount;
    drop.id = listId;
    drop.setAttribute("role", "listbox");
    drop.setAttribute("aria-label", "Paint search results");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);

    function setStatus(message, kind) {
      status.classList.toggle("is-error", kind === "error");
      status.textContent = message || "";
    }

    function setBusy(busy) {
      if (busy) input.setAttribute("aria-busy", "true");
      else input.removeAttribute("aria-busy");
    }

    function rangeOf(paint) {
      return String((paint && (paint.range || paint.line)) || "");
    }

    function statusBadge(paint) {
      var labels = {
        legacy: "legacy",
        reference_only: "reference-only",
        preview: "preview"
      };
      return paint && labels[paint.status]
        ? '<span class="bfc-legacy">' + labels[paint.status] + "</span>"
        : "";
    }

    function showLoadError(message, retry, fallbackPaint) {
      setBusy(false);
      status.classList.add("is-error");
      status.innerHTML = '<span>' + esc(message || "The paint catalogue could not be loaded.") + "</span> "
        + '<button class="bfc-retry" type="button">Retry</button>'
        + (fallbackPaint ? ' <a href="' + esc(paintHref(fallbackPaint.path))
          + '">Open the static paint page</a>' : "");
      status.querySelector(".bfc-retry").addEventListener("click", function () {
        retry();
      });
    }

    function updateManifestDate(manifest) {
      DATA_UPDATED = manifest.updated || "";
      return manifest;
    }

    function clearPanel(updateUrl) {
      selectionGeneration += 1;
      setBusy(false);
      source = null;
      sourceIdentity = null;
      resultData = null;
      panel.hidden = true;
      panel.innerHTML = "";
      if (updateUrl) updateAddressBar(null);
    }

    function closeDrop() {
      drop.hidden = true;
      drop.innerHTML = "";
      dropItems = [];
      activeIndex = -1;
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-activedescendant", "");
    }

    function setActive(index) {
      if (!dropItems.length) return;
      activeIndex = Math.max(0, Math.min(index, dropItems.length - 1));
      dropItems.forEach(function (item, itemIndex) {
        var active = itemIndex === activeIndex;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      var current = dropItems[activeIndex];
      input.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView({ block: "nearest" });
    }

    function renderDrop(hits, query) {
      drop.innerHTML = "";
      dropItems = [];
      activeIndex = -1;
      if (!hits.length) {
        var empty = element("div", "bfc-empty", "No paints found for “" + esc(query) + "”.");
        empty.setAttribute("role", "option");
        empty.setAttribute("aria-disabled", "true");
        drop.appendChild(empty);
        drop.hidden = false;
        input.setAttribute("aria-expanded", "true");
        setStatus("No paint search results.");
        return;
      }
      hits.forEach(function (paint, index) {
        var item = element("button", "bfc-item",
          '<span class="bf-swatch bfc-option-swatch" style="background-color:' + esc(paint.swatch)
          + '" aria-hidden="true"></span>'
          + '<span class="bfc-iname">' + esc(paint.name)
          + (paint.code ? ' <span class="bfc-imeta">' + esc(paint.code) + "</span>" : "") + "</span>"
          + '<span class="bfc-imeta">' + esc(disp(paint.brand))
          + (rangeOf(paint) ? " · " + esc(rangeOf(paint)) : "")
          + " " + statusBadge(paint) + "</span>");
        item.type = "button";
        item.id = drop.id + "-option-" + index;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.addEventListener("click", function () { selectPaint(paint, false); });
        drop.appendChild(item);
        dropItems.push(item);
      });
      drop.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setStatus(hits.length + (hits.length === 1 ? " paint found." : " paints found."));
    }

    function searchScore(paint, query) {
      var name = normalizeSearch(paint.name);
      var code = normalizeSearch(paint.code);
      var range = normalizeSearch(rangeOf(paint));
      var brand = normalizeSearch(paint.brand + " " + disp(paint.brand));
      if (name === query) return 0;
      if (name.indexOf(query) === 0) return 1;
      if (name.split(" ").some(function (word) { return word.indexOf(query) === 0; })) return 2;
      if (code.indexOf(query) === 0) return 3;
      if ((name + " " + code + " " + range + " " + brand).indexOf(query) >= 0) return 4;
      return -1;
    }

    function search(query, generation, force) {
      setBusy(true);
      setStatus("Searching paint catalogue…");
      catalogClient.loadSearch(query, force).then(function (paints) {
        if (generation !== searchGeneration || normalizeSearch(input.value) !== query) return;
        setBusy(false);
        var hits = [];
        paints.forEach(function (paint) {
          if (sourceBrand && !sameBrand(paint.brand, sourceBrand)) return;
          var score = searchScore(paint, query);
          if (score >= 0) hits.push({ score: score, paint: paint });
        });
        hits.sort(function (a, b) {
          return a.score - b.score || a.paint.name.localeCompare(b.paint.name)
            || a.paint.brand.localeCompare(b.paint.brand) || a.paint.path.localeCompare(b.paint.path);
        });
        renderDrop(hits.slice(0, 30).map(function (hit) { return hit.paint; }), input.value.trim());
      }).catch(function () {
        if (generation !== searchGeneration) return;
        setBusy(false);
        closeDrop();
        showLoadError("The paint search could not be loaded.", function () {
          runSearchNow(true);
        });
      });
    }

    function runSearchNow(force) {
      var query = normalizeSearch(input.value);
      searchGeneration += 1;
      if (!searchBucket(query)) {
        setBusy(false);
        closeDrop();
        if (query.length) setStatus("Type at least two characters to search.");
        else setStatus("");
        return;
      }
      if (!trackedSearch) {
        track("converter_search", {
          source_brand: sourceBrand ? disp(sourceBrand) : "all",
          target_brand: targetBrand === "ALL" ? "all" : targetBrand
        });
        trackedSearch = true;
      }
      search(query, searchGeneration, Boolean(force));
    }

    var runSearch = debounce(function () { runSearchNow(false); }, 220);
    input.addEventListener("focus", function () {
      catalogClient.loadManifest(false).then(updateManifestDate).catch(function () {});
    });
    input.addEventListener("input", function () {
      if (source) clearPanel(true);
      else selectionGeneration += 1;
      closeDrop();
      runSearch();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        searchGeneration += 1;
        closeDrop();
        return;
      }
      if (event.key === "Tab") {
        searchGeneration += 1;
        closeDrop();
        return;
      }
      if (drop.hidden) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!dropItems.length) return;
        var next = event.key === "ArrowDown"
          ? (activeIndex < 0 ? 0 : (activeIndex + 1) % dropItems.length)
          : (activeIndex < 0 ? dropItems.length - 1 : (activeIndex - 1 + dropItems.length) % dropItems.length);
        setActive(next);
      } else if (event.key === "Home" && dropItems.length) {
        event.preventDefault();
        setActive(0);
      } else if (event.key === "End" && dropItems.length) {
        event.preventDefault();
        setActive(dropItems.length - 1);
      } else if (event.key === "Enter") {
        if (activeIndex < 0 && dropItems.length) {
          event.preventDefault();
          setActive(0);
          return;
        }
        var choice = activeIndex >= 0 ? dropItems[activeIndex] : null;
        if (choice) {
          event.preventDefault();
          choice.click();
        }
      }
    });

    document.addEventListener("click", function (event) {
      if (!root.contains(event.target)) {
        searchGeneration += 1;
        closeDrop();
      }
    });

    function allTargetBrands() {
      var brands = {};
      (resultData ? resultData.matches : []).forEach(function (paint) {
        if (paint.brand !== source.brand) brands[paint.brand] = true;
      });
      if (targetBrand !== "ALL" && targetBrand !== source.brand) brands[targetBrand] = true;
      return Object.keys(brands).sort(function (a, b) { return disp(a).localeCompare(disp(b)); });
    }

    function computeMatches() {
      var rows = (resultData ? resultData.matches : []).filter(function (paint) {
        return targetBrand === "ALL" || paint.brand === targetBrand;
      });
      rows.sort(function (a, b) {
        return a.de - b.de || a.path.localeCompare(b.path);
      });
      return rows;
    }

    function targetSlugForBrand(brand) {
      var target = resultData && resultData.matches.find(function (paint) { return paint.brand === brand; });
      return target ? brandSlugFromPath(target.path) : normalizeSearch(disp(brand)).replace(/\s+/g, "-");
    }

    function shareUrl() {
      var sourcePath = sourcePathToken((sourceIdentity || source).path);
      var query = "source=" + sourcePath.split("/").map(encodeURIComponent).join("/");
      if (targetBrand !== "ALL") {
        query += "&target=" + encodeURIComponent(targetSlugForBrand(targetBrand));
      }
      return new URL("/convert/?" + query, global.location.origin).toString();
    }

    function updateAddressBar(paint) {
      if (!/^\/convert\/(?:index\.html)?$/.test(global.location.pathname)) return;
      if (!paint) {
        global.history.replaceState(null, "", "/convert/");
        return;
      }
      var url = new URL(shareUrl());
      global.history.replaceState(null, "", url.pathname + url.search);
    }

    function reportUrl(target) {
      var subject = "BrushForge paint match report: " + disp(source.brand) + " " + source.name;
      var body = [
        "I would like to report a catalogue match that may be inaccurate.", "",
        "Source: " + disp(source.brand) + " / " + source.name + " / " + rangeOf(source)
          + (source.code ? " / " + source.code : ""),
        "Target: " + disp(target.brand) + " / " + target.name + " / " + rangeOf(target)
          + (target.code ? " / " + target.code : ""),
        "Displayed Delta E 2000: " + target.de.toFixed(1),
        "Catalogue updated: " + DATA_UPDATED,
        "Share link: " + shareUrl(), "", "What looks inaccurate:", ""
      ].join("\n");
      return "mailto:brushforgeapp@gmail.com?subject=" + encodeURIComponent(subject)
        + "&body=" + encodeURIComponent(body);
    }

    function matchTierClass(match) {
      var aliases = {
        same: "same", identical: "same", excellent: "excellent", very_close: "excellent",
        good: "good", close: "good", fair: "fair", noticeable: "fair",
        poor: "poor", different: "poor"
      };
      var normalized = String(match.tier || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      return aliases[normalized] || deScale(match.de)[1];
    }

    function matchRow(target) {
      var tier = deScale(target.de);
      var warning = target.warning
        ? '<p class="bfc-warning">' + esc(target.warning) + "</p>"
        : (target.de > 10
          ? '<p class="bfc-warning">No close same-type equivalent found; nearest recorded color shown. '
            + "Treat it as a shortlist reference and test dried physical swatches.</p>"
          : "");
      return '<article class="bf-row bfc-result">'
        + '<span class="bf-swatch-pair" aria-label="Screen preview swatches"><span style="background:'
        + esc(source.swatch) + '"></span><span style="background:' + esc(target.swatch) + '"></span></span>'
        + '<span class="grow"><a class="rname" href="' + esc(paintHref(target.path)) + '">'
        + esc(target.name) + (target.code ? " · " + esc(target.code) : "") + '</a><br>'
        + '<span class="rmeta">' + esc(disp(target.brand))
        + (rangeOf(target) ? " · " + esc(rangeOf(target)) : "") + '</span><br>'
        + '<span class="rmeta">Catalogue updated ' + esc(formatDate(DATA_UPDATED)) + '</span>'
        + warning + '<a class="bfc-report" href="' + esc(reportUrl(target))
        + '" data-analytics-event="issue_report_start" data-analytics-placement="converter_result" '
        + 'data-analytics-source-brand="' + esc(source.brand) + '" data-analytics-target-brand="'
        + esc(target.brand) + '">Report an inaccurate match</a></span>'
        + '<span class="bfc-score"><span class="bf-tier ' + matchTierClass(target) + '">&Delta;E '
        + target.de.toFixed(1) + " · " + esc(tier[0]) + "</span></span></article>";
    }

    function render() {
      var brands = allTargetBrands();
      var pills = ['<button type="button" class="bfc-pill' + (targetBrand === "ALL" ? " on" : "")
        + '" data-brand="ALL" aria-pressed="' + (targetBrand === "ALL" ? "true" : "false")
        + '">One closest result per brand</button>'];
      brands.forEach(function (brand) {
        pills.push('<button type="button" class="bfc-pill' + (targetBrand === brand ? " on" : "")
          + '" data-brand="' + esc(brand) + '" aria-pressed="'
          + (targetBrand === brand ? "true" : "false") + '">' + esc(disp(brand)) + "</button>");
      });

      var matches = computeMatches();
      var rowsHtml = matches.map(matchRow).join("");
      if (!matches.length) {
        rowsHtml = '<div class="bfc-empty bfc-incompatible">No same-type equivalent or same-pool '
          + "reference is available for "
          + esc(targetBrand === "ALL" ? "another included brand" : disp(targetBrand)) + ".</div>";
      }

      var sourceStatus = {
        legacy: " · legacy range",
        reference_only: " · reference-only range",
        preview: " · pre-retail preview"
      }[source.status] || "";
      var metallic = source.behavior === "metallic" || /metallic/i.test(source.type + " " + source.finish);
      var appLabel = source.status === "preview" ? "Continue in BrushForge" : "Filter matches by paints you own";
      panel.innerHTML = '<div class="bfc-source">' + swatchHtml(source.swatch, metallic)
        + '<span><strong>' + esc(source.name) + "</strong>" + (source.code ? " · " + esc(source.code) : "")
        + '<br><span class="bfc-imeta">' + esc(disp(source.brand))
        + (rangeOf(source) ? " · " + esc(rangeOf(source)) : "")
        + " · " + esc(source.type) + " · " + esc(source.finish) + " · "
        + esc(behaviorLabel(source.behavior)) + esc(sourceStatus) + '</span><br>'
        + '<span class="bfc-imeta">Screen swatch is an approximate preview.</span><br>'
        + '<span class="bfc-imeta">Catalogue updated ' + esc(formatDate(DATA_UPDATED)) + "</span></span></div>"
        + '<div class="bfc-pills" role="group" aria-label="Target brand">' + pills.join("") + "</div>"
        + '<div class="bfc-share"><button type="button" class="bfc-copy">Copy link</button>'
        + (global.navigator.share ? '<button type="button" class="bfc-share-button">Share</button>' : "")
        + '<span class="bfc-share-status" role="status" aria-live="polite"></span></div>'
        + '<div class="bf-rows">' + rowsHtml + '<div class="bf-tease"><span>Continue with this source and target context in BrushForge, then filter against paints you own.</span>'
        + '<span class="bfc-app-actions"><a href="' + esc(androidUrl) + '" rel="noopener" '
        + 'data-analytics-event="open_in_app" data-analytics-placement="converter_result" '
        + 'data-analytics-page-family="' + esc(analyticsPageFamily) + '" '
        + 'data-analytics-platform="android">' + esc(appLabel) + " on Android</a>"
        + '<a href="' + esc(iosUrl) + '" rel="noopener" data-analytics-event="open_in_app" '
        + 'data-analytics-placement="converter_result" data-analytics-page-family="' + esc(analyticsPageFamily) + '" '
        + 'data-analytics-platform="ios">' + esc(appLabel) + " on iOS</a></span></div></div>";
      panel.hidden = false;

      panel.querySelectorAll(".bfc-pill").forEach(function (button) {
        button.addEventListener("click", function () {
          targetBrand = button.getAttribute("data-brand");
          updateAddressBar(source);
          render();
        });
      });
      panel.querySelector(".bfc-copy").addEventListener("click", function () {
        var output = panel.querySelector(".bfc-share-status");
        copyText(shareUrl()).then(function () {
          output.textContent = "Link copied.";
          track("copy_match_link", { source_brand: source.brand, target_brand: targetBrand });
        }).catch(function () { output.textContent = "Copy failed. Use the address bar instead."; });
      });
      var shareButton = panel.querySelector(".bfc-share-button");
      if (shareButton) shareButton.addEventListener("click", function () {
        global.navigator.share({
          title: source.name + " paint comparison",
          text: "BrushForge catalogue-color comparison for " + disp(source.brand) + " " + source.name,
          url: shareUrl()
        }).then(function () {
          track("copy_match_link", { source_brand: source.brand, target_brand: targetBrand });
        }).catch(function (error) {
          if (error && error.name !== "AbortError") {
            panel.querySelector(".bfc-share-status").textContent = "Sharing was unavailable.";
          }
        });
      });
      var firstTier = matches.length ? matchTierClass(matches[0]) : "incompatible";
      track("converter_result_view", {
        source_brand: source.brand, target_brand: targetBrand,
        result_count: matches.length, match_tier: firstTier
      });
      try {
        global.document.dispatchEvent(new CustomEvent("brushforge:converter-result", {
          detail: {
            resultCount: matches.length,
            sourceBrand: source.brand,
            targetBrand: targetBrand
          }
        }));
      } catch (_error) {
        // The converter remains usable if custom browser events are unavailable.
      }
      setStatus("Showing " + matches.length + (matches.length === 1 ? " comparison." : " comparisons."));
    }

    function applyTargetSlug(targetSlug) {
      if (!targetSlug || !resultData) return;
      var target = resultData.matches.find(function (paint) {
        return brandSlugFromPath(paint.path) === targetSlug && paint.brand !== source.brand;
      });
      if (target) targetBrand = target.brand;
    }

    function selectPaint(paint, fromUrl, targetSlug, force) {
      selectionGeneration += 1;
      var generation = selectionGeneration;
      sourceIdentity = paint;
      source = null;
      resultData = null;
      input.value = paint.name;
      closeDrop();
      if (!fromUrl) updateAddressBar(paint);
      panel.hidden = true;
      panel.innerHTML = "";
      setBusy(true);
      setStatus("Loading paint comparisons…");
      catalogClient.loadResult(paint.key, Boolean(force)).then(function (raw) {
        if (generation !== selectionGeneration) return;
        setBusy(false);
        resultData = raw;
        source = raw.source;
        var manifest = catalogClient.getManifest();
        if (manifest) updateManifestDate(manifest);
        applyTargetSlug(targetSlug);
        if (!fromUrl) updateAddressBar(paint);
        render();
      }).catch(function () {
        if (generation !== selectionGeneration) return;
        showLoadError("The comparisons for this paint could not be loaded.", function () {
          selectPaint(paint, true, targetSlug, true);
        }, paint);
      });
    }

    function findSharedPaint(sourcePath) {
      var token = sourcePathToken(sourcePath);
      var basename = token.split("/").pop().replace(/-/g, " ");
      var firstIndexableToken = normalizeSearch(basename).split(" ").find(function (part) {
        return part.length >= 2;
      }) || basename;
      return catalogClient.loadSearch(firstIndexableToken, false).then(function (paints) {
        return paints.find(function (candidate) { return sourcePathToken(candidate.path) === token; }) || null;
      });
    }

    function initializeSharedState() {
      var params = new URLSearchParams(global.location.search);
      var sourcePath = params.get("source");
      var targetSlug = params.get("target");
      if (!sourcePath) return;
      setBusy(true);
      setStatus("Loading shared paint comparison…");
      catalogClient.loadManifest(false).then(updateManifestDate).then(function () {
        return findSharedPaint(sourcePath);
      }).then(function (paint) {
        if (!paint || (sourceBrand && !sameBrand(paint.brand, sourceBrand))) {
          setBusy(false);
          status.classList.add("is-error");
          status.innerHTML = '<span>The shared source paint is not available in this converter.</span> '
            + '<a href="' + esc(paintHref(sourcePath)) + '">Open the static paint page</a>';
          return;
        }
        selectPaint(paint, true, targetSlug, false);
      }).catch(function () {
        showLoadError("The shared paint comparison could not be loaded.", initializeSharedState,
          { path: sourcePath });
      });
    }

    initializeSharedState();
  }

  /* ------------------------------ hub filter ------------------------------- */

  function setupHubFilter(root) {
    var query = root.querySelector(".bf-hub-query");
    var line = root.querySelector(".bf-hub-line");
    var pool = root.querySelector(".bf-hub-pool");
    var listingStatus = root.querySelector(".bf-hub-status-select");
    var output = root.querySelector(".bf-hub-status");
    var pageRoot = root.closest(".bf-main") || document;
    var rows = Array.prototype.slice.call(pageRoot.querySelectorAll("[data-hub-paint]"));
    var sections = Array.prototype.slice.call(pageRoot.querySelectorAll("[data-hub-section]"));

    function applyFilters() {
      var text = query.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var visible = (!text || row.getAttribute("data-search").indexOf(text) >= 0)
          && (!line.value || row.getAttribute("data-line") === line.value)
          && (!pool.value || row.getAttribute("data-pool") === pool.value)
          && (!listingStatus.value || row.getAttribute("data-reco") === listingStatus.value);
        row.hidden = !visible;
        if (visible) shown += 1;
      });
      sections.forEach(function (section) {
        section.hidden = !section.querySelector("[data-hub-paint]:not([hidden])");
      });
      output.textContent = "Showing " + shown + (shown === 1 ? " paint." : " paints.");
    }

    query.addEventListener("input", debounce(applyFilters, 120));
    [line, pool, listingStatus].forEach(function (control) {
      control.addEventListener("change", applyFilters);
    });
  }

  function init() {
    document.querySelectorAll(".bfc").forEach(setupConverter);
    document.querySelectorAll("[data-hub-filter]").forEach(setupHubFilter);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
