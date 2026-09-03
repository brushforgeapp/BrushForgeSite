(function () {
  "use strict";

  var DOMAIN = "brushforgeapp.com";
  var DEFAULT_MEASUREMENT_ID = "G-Y9S5DMZQ38";
  var CONSENT_STORAGE_KEY = "brushforge.analyticsConsent.v1";
  var DEFAULT_CONSENT_DAYS = 180;
  var GOOGLE_TAG_ID = "brushforge-google-analytics";
  var ALLOWED_EVENTS = new Set([
    "pageview",
    "converter_search",
    "converter_result_view",
    "copy_match_link",
    "open_in_app",
    "app_store_click",
    "store_cta_view",
    "download_page_open",
    "install_prompt_view",
    "install_prompt_dismiss",
    "chart_filter_use",
    "methodology_open",
    "issue_report_start",
    "pricing_view",
    "feature_card_click",
    "story_open",
  ]);
  var ALLOWED_PROPS = new Set([
    "platform",
    "placement",
    "page_family",
    "source_brand",
    "target_brand",
    "result_count",
    "match_tier",
    "feature",
  ]);
  var SAFE_QUERY_PARAMS = [
    "ref",
    "from",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
  ];

  var siteConfig = window.BRUSHFORGE_SITE_CONFIG || {};
  var configuredAnalytics = siteConfig.analytics || {};
  var configuredMeasurementId = configuredAnalytics.measurementId;
  var measurementId = validMeasurementId(configuredMeasurementId)
    ? configuredMeasurementId
    : DEFAULT_MEASUREMENT_ID;
  var configuredDays = Number(configuredAnalytics.consentStorageDays);
  var consentStorageDays = Number.isFinite(configuredDays) && configuredDays > 0
    ? Math.min(Math.floor(configuredDays), DEFAULT_CONSENT_DAYS)
    : DEFAULT_CONSENT_DAYS;
  var isProduction = window.location.hostname === DOMAIN
    || window.location.hostname === "www." + DOMAIN;
  var configured = configuredAnalytics.provider === "google_analytics_4"
    && configuredAnalytics.enabled === true
    && validMeasurementId(configuredMeasurementId);
  var runtimeEnabled = configured && isProduction;
  var privacySignal = detectPrivacySignal();
  var storedConsent = readStoredConsent();
  var googleInitialized = false;
  var trackingActive = false;
  var pageViewSent = false;
  var settingsOpen = false;

  // This official opt-out flag also stops automatic hits after consent is revoked.
  window["ga-disable-" + measurementId] = true;

  function validMeasurementId(value) {
    return typeof value === "string" && /^G-[A-Z0-9]+$/.test(value);
  }

  function detectPrivacySignal() {
    if (navigator.globalPrivacyControl === true) return "global_privacy_control";
    if (navigator.doNotTrack === "1"
      || navigator.doNotTrack === "yes"
      || navigator.msDoNotTrack === "1"
      || window.doNotTrack === "1") return "do_not_track";
    return null;
  }

  function storageAvailable() {
    try {
      var key = "brushforge.analyticsStorageTest";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  var canStoreConsent = storageAvailable();

  function readStoredConsent() {
    var raw;
    try {
      raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    } catch (_error) {
      return null;
    }
    if (!raw) return null;

    try {
      var value = JSON.parse(raw);
      if ((value.choice !== "granted" && value.choice !== "denied")
        || !Number.isFinite(value.expiresAt)
        || value.expiresAt <= Date.now()) {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }
      return value;
    } catch (_error) {
      try {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
      } catch (_storageError) {
        // Storage failures leave analytics disabled and the choice pending.
      }
      return null;
    }
  }

  function storeConsent(choice) {
    var value = {
      choice: choice,
      expiresAt: Date.now() + consentStorageDays * 24 * 60 * 60 * 1000,
    };
    storedConsent = value;
    if (!canStoreConsent) return;
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
    } catch (_error) {
      canStoreConsent = false;
    }
  }

  function stateSnapshot() {
    var state = "pending";
    var reason = null;

    if (!runtimeEnabled) {
      state = "disabled";
      reason = !configured ? "configuration" : "environment";
    } else if (privacySignal) {
      state = "denied";
      reason = privacySignal;
    } else if (storedConsent && storedConsent.choice === "granted") {
      state = "granted";
    } else if (storedConsent && storedConsent.choice === "denied") {
      state = "denied";
      reason = "user";
    }

    return {
      state: state,
      pending: state === "pending" || settingsOpen,
      enabled: runtimeEnabled,
      choice: storedConsent ? storedConsent.choice : null,
      expiresAt: storedConsent ? storedConsent.expiresAt : null,
      privacySignal: privacySignal,
      reason: reason,
      settingsOpen: settingsOpen,
    };
  }

  function dispatchDocumentEvent(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (_error) {
      // A missing event API must never affect the website itself.
    }
  }

  function publishState(reason) {
    var detail = stateSnapshot();
    detail.changeReason = reason || "state";
    window.BRUSHFORGE_CONSENT_STATE = detail;
    if (document.documentElement) {
      document.documentElement.dataset.analyticsConsentState = detail.state;
    }
    dispatchDocumentEvent("brushforge:consent-state", detail);
    return detail;
  }

  function pageFamily() {
    var path = window.location.pathname;
    if (path === "/" || path === "/index.html") return "homepage";
    if (path === "/convert/" || path === "/convert/index.html") return "web_converter";
    if (path.startsWith("/convert/")) return "conversion_chart";
    if (/^\/paints\/[^/]+\/[^/]+\.html$/.test(path)) return "paint_detail";
    if (path === "/paints/" || /^\/paints\/[^/]+\/?$/.test(path)) return "paint_hub";
    if (path.startsWith("/guides/")) return "guide";
    if (path.startsWith("/features/")) return "feature";
    if (path.startsWith("/methodology/")) return "methodology";
    if (path.startsWith("/press/")) return "press";
    if (path.startsWith("/download/")) return "download";
    if (path === "/about.html") return "about";
    if (path === "/the-story.html") return "story";
    return "core";
  }

  function privacySafePath(path) {
    if (/^\/paints\/[^/]+\/[^/]+\.html$/.test(path)) return "/paints/paint-detail.html";
    return path;
  }

  function privacySafeTitle() {
    return "BrushForge | " + pageFamily().replace(/_/g, " ");
  }

  function safeCampaignValue(value) {
    if (!value || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,119}$/.test(value)) return null;
    return value;
  }

  function privacySafeUrl() {
    var url = new URL(window.location.href);
    var safeParams = new URLSearchParams();
    url.pathname = privacySafePath(url.pathname);
    SAFE_QUERY_PARAMS.forEach(function (key) {
      if (!url.searchParams.has(key)) return;
      var safeValue = safeCampaignValue(url.searchParams.get(key));
      if (safeValue) safeParams.set(key, safeValue);
    });
    url.search = safeParams.toString();
    url.hash = "";
    return url.toString();
  }

  function privacySafeReferrer() {
    if (!document.referrer) return undefined;
    try {
      var referrer = new URL(document.referrer);
      if (referrer.protocol !== "https:" && referrer.protocol !== "http:") return undefined;
      if (referrer.hostname === DOMAIN || referrer.hostname === "www." + DOMAIN) {
        return referrer.origin + privacySafePath(referrer.pathname);
      }
      return referrer.origin;
    } catch (_error) {
      return undefined;
    }
  }

  function cleanProps(input) {
    var output = { page_family: pageFamily() };
    Object.entries(input || {}).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (!ALLOWED_PROPS.has(key) || value === undefined || value === null) return;
      if (typeof value === "number") {
        if (Number.isFinite(value)) output[key] = value;
        return;
      }
      if (typeof value === "boolean") {
        output[key] = value;
        return;
      }
      if (typeof value === "string") output[key] = value.slice(0, 80);
    });
    return output;
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }
  }

  function loadGoogleAnalytics() {
    if (!runtimeEnabled || privacySignal || !storedConsent || storedConsent.choice !== "granted") return false;

    trackingActive = true;
    window["ga-disable-" + measurementId] = false;
    ensureGtag();

    if (!googleInitialized) {
      googleInitialized = true;
      window.gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        personalization_storage: "denied",
      });
      window.gtag("js", new Date());
      window.gtag("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_expires: consentStorageDays * 24 * 60 * 60,
        cookie_update: false,
        page_location: privacySafeUrl(),
        page_title: privacySafeTitle(),
        page_referrer: privacySafeReferrer() || "",
      });

      if (!document.getElementById(GOOGLE_TAG_ID)) {
        var script = document.createElement("script");
        script.async = true;
        script.id = GOOGLE_TAG_ID;
        script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
        document.head.appendChild(script);
      }
    }

    if (!pageViewSent) {
      pageViewSent = true;
      send("pageview", {}, { interactive: false });
    }
    return true;
  }

  function send(name, props, options) {
    if (!trackingActive || window["ga-disable-" + measurementId] === true || !ALLOWED_EVENTS.has(name)) return false;
    ensureGtag();

    var eventName = name === "pageview" ? "page_view" : name;
    var eventParams = cleanProps(props);
    if ((name === "app_store_click" || name === "store_cta_view")
      && !["android", "ios"].includes(eventParams.platform)) return false;
    eventParams.send_to = measurementId;
    eventParams.page_location = privacySafeUrl();
    if (name === "pageview") eventParams.page_title = privacySafeTitle();
    if (options && options.interactive === false) eventParams.non_interaction = true;
    window.gtag("event", eventName, eventParams);
    return true;
  }

  function deleteAnalyticsCookies() {
    var hostname = window.location.hostname.replace(/^www\./, "");
    var domains = ["", hostname, "." + hostname];
    var cookieNames = document.cookie.split(";").map(function (part) {
      return part.split("=")[0].trim();
    }).filter(function (name) {
      return name === "_ga" || name.startsWith("_ga_");
    });

    cookieNames.forEach(function (name) {
      domains.forEach(function (domain) {
        var domainPart = domain ? "; domain=" + domain : "";
        document.cookie = name + "=; Max-Age=0; path=/" + domainPart + "; SameSite=Lax; Secure";
      });
    });
  }

  function grantConsent() {
    if (!runtimeEnabled || privacySignal) {
      publishState("grant_blocked");
      return false;
    }
    settingsOpen = false;
    storeConsent("granted");
    publishState("grant");
    return loadGoogleAnalytics();
  }

  function denyConsent() {
    settingsOpen = false;
    storeConsent("denied");
    trackingActive = false;
    pageViewSent = false;
    window["ga-disable-" + measurementId] = true;
    deleteAnalyticsCookies();
    publishState("deny");
    return true;
  }

  function openSettings() {
    settingsOpen = true;
    var detail = publishState("settings_open");
    dispatchDocumentEvent("brushforge:analytics-settings-open", detail);
    return detail;
  }

  function closeSettings() {
    settingsOpen = false;
    return publishState("settings_close");
  }

  window.brushForgeTrack = function (name, props, options) {
    return send(name, props, options);
  };

  window.brushForgeAnalytics = Object.freeze({
    grantConsent: grantConsent,
    denyConsent: denyConsent,
    openSettings: openSettings,
    closeSettings: closeSettings,
    getState: stateSnapshot,
    pageFamily: pageFamily,
  });
  window.brushForgeOpenAnalyticsSettings = openSettings;

  document.addEventListener("click", function (event) {
    var consentAction = event.target.closest("[data-analytics-consent]");
    if (consentAction) {
      event.preventDefault();
      if (consentAction.dataset.analyticsConsent === "grant") grantConsent();
      if (consentAction.dataset.analyticsConsent === "deny") denyConsent();
      return;
    }

    var settingsLink = event.target.closest("[data-analytics-settings]");
    if (settingsLink) {
      event.preventDefault();
      openSettings();
      return;
    }

    var settingsClose = event.target.closest("[data-analytics-settings-close]");
    if (settingsClose) {
      event.preventDefault();
      closeSettings();
      return;
    }

    var target = event.target.closest("[data-analytics-event], a[href]");
    if (!target) return;

    var explicitName = target.dataset.analyticsEvent;
    if (explicitName) {
      send(explicitName, {
        platform: target.dataset.analyticsPlatform,
        placement: target.dataset.analyticsPlacement,
        source_brand: target.dataset.analyticsSourceBrand,
        target_brand: target.dataset.analyticsTargetBrand,
        feature: target.dataset.analyticsFeature,
      });
    }

    var href = target.href || "";
    var platform = href.includes("play.google.com/store/apps")
      ? "android"
      : href.includes("apps.apple.com")
        ? "ios"
        : "";
    if (platform) {
      if (explicitName !== "app_store_click") {
        send("app_store_click", {
          platform: platform,
          placement: target.dataset.analyticsPlacement || pageFamily(),
          source_brand: target.dataset.analyticsSourceBrand,
          target_brand: target.dataset.analyticsTargetBrand,
        });
      }
    } else if (!explicitName && href.includes("/methodology/")) {
      send("methodology_open", { placement: pageFamily() });
    } else if (!explicitName && href.startsWith("mailto:") && /match|paint data|inaccurate/i.test(href)) {
      send("issue_report_start", { placement: pageFamily() });
    }
  });

  document.addEventListener("toggle", function (event) {
    var details = event.target;
    if (!(details instanceof HTMLDetailsElement)
      || !details.open
      || !details.matches("[data-methodology-details]")) return;
    if (details.dataset.analyticsOpened === "true") return;
    details.dataset.analyticsOpened = "true";
    send("methodology_open", { placement: pageFamily() });
  }, true);

  var pricing = document.querySelector("[data-analytics-view='pricing_view']");
  if (pricing && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      send("pricing_view", { placement: pageFamily() });
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(pricing);
  }

  publishState("init");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      publishState("ready");
    }, { once: true });
  }
  if (stateSnapshot().state === "granted") loadGoogleAnalytics();
})();
